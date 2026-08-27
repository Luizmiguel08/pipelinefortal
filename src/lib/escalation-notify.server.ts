/**
 * Avisos automáticos de escalonamento do funil.
 *
 * Sempre que a rotina do banco move um lead para "Não Respondeu" ou "Dia 1",
 * esta rotina envia uma mensagem no Slack (uma única vez por lead/etapa).
 * O controle de duplicidade é feito pela tabela public.lead_stage_alerts.
 */

const ETAPAS_AVISO = ["nao_respondeu", "dia1"] as const;
type EtapaAviso = (typeof ETAPAS_AVISO)[number];

const ROTULO: Record<EtapaAviso, string> = {
  nao_respondeu: "Não Respondeu",
  dia1: "Dia 1",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/slack/api";

function canalSlack() {
  return process.env["SLACK_ALERT_CHANNEL"]?.trim() || "#geral";
}

function credenciaisSlack() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const slackKey =
    process.env["SLACK_API_KEY"] ?? process.env["SLACK_API_KEY_1"] ?? undefined;
  return lovableKey && slackKey ? { lovableKey, slackKey } : null;
}

async function enviarSlack(texto: string) {
  const cred = credenciaisSlack();
  if (!cred) throw new Error("Slack ainda não conectado ao projeto.");

  const res = await fetch(`${GATEWAY_URL}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cred.lovableKey}`,
      "X-Connection-Api-Key": cred.slackKey,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ channel: canalSlack(), text: texto }),
  });
  const corpo = await res.text();
  if (!res.ok) throw new Error(`Slack falhou [${res.status}]: ${corpo.slice(0, 300)}`);
  let json: { ok?: boolean; error?: string };
  try {
    json = JSON.parse(corpo) as { ok?: boolean; error?: string };
  } catch {
    throw new Error(`Resposta inválida do Slack: ${corpo.slice(0, 200)}`);
  }
  if (!json.ok) throw new Error(`Slack recusou o envio: ${json.error ?? "erro desconhecido"}`);
}

export async function notificarEscalonamentos() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Só olhamos o que entrou nessas etapas nas últimas 24h para não avisar histórico antigo.
  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: leads, error } = await supabaseAdmin
    .from("leads")
    .select("id, nome, telefone, valor, stage, stage_since, corretor_id, corretores(nome)")
    .in("stage", ETAPAS_AVISO as unknown as string[])
    .gte("stage_since", desde)
    .order("stage_since", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  let enviados = 0;
  const erros: string[] = [];

  for (const lead of leads ?? []) {
    // A trava de unicidade garante um único aviso por lead/etapa: se o insert
    // não retornar linha, o aviso já havia sido enviado antes.
    const { data: marcado, error: erroMarcar } = await supabaseAdmin
      .from("lead_stage_alerts")
      .insert({ lead_id: lead.id, stage: lead.stage, canal: "slack" })
      .select("id")
      .maybeSingle();
    if (erroMarcar || !marcado) continue;

    const corretor =
      (lead as unknown as { corretores?: { nome?: string } | null }).corretores?.nome ??
      "sem corretor";
    const valor = Number(lead.valor ?? 0);
    const texto = [
      `:rotating_light: Lead movido para *${ROTULO[lead.stage as EtapaAviso]}*`,
      `• Cliente: ${lead.nome}${lead.telefone ? ` (${lead.telefone})` : ""}`,
      `• Corretor: ${corretor}`,
      valor > 0
        ? `• Valor: ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await enviarSlack(texto);
      enviados += 1;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao enviar";
      erros.push(msg);
      // Libera o lead para nova tentativa no próximo ciclo.
      await supabaseAdmin
        .from("lead_stage_alerts")
        .delete()
        .eq("lead_id", lead.id)
        .eq("stage", lead.stage);
      // Falha de credencial não melhora nas próximas linhas: paramos o ciclo.
      if (!credenciaisSlack()) break;
    }
  }

  return { ok: erros.length === 0, analisados: leads?.length ?? 0, enviados, erros };
}
