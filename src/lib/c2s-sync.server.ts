import { fetchC2SContacts } from "./c2s.server";
import { type StageId } from "./stages";

export type SyncResult = {
  criados: number;
  atualizados: number;
  movidos: number;
  corretoresCriados: number;
  total: number;
};



type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

async function executarSync(supabaseAdmin: AdminClient, result: SyncResult, desde?: string) {
  // Janelas curtas terminam rapidamente; reconciliações históricas varrem todas as páginas.
  const recente = desde ? Date.now() - Date.parse(desde) < 3 * 60 * 60 * 1000 : false;
  const contatos = await fetchC2SContacts(
    desde ? { desde, maxPaginas: recente ? 40 : 2000 } : {},
  );
  result.total = contatos.length;

  const { data: corretores } = await supabaseAdmin
    .from("corretores")
    .select("id, c2s_agent_id, email, nome");
  const byAgent = new Map(
    (corretores ?? []).filter((c) => c.c2s_agent_id).map((c) => [c.c2s_agent_id!, c.id]),
  );
  const byEmail = new Map(
    (corretores ?? []).filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]),
  );

  // Carrega de uma vez os leads já existentes para evitar uma consulta por contato.
  const existentes = new Map<string, { id: string; stage: StageId; valor: number }>();
  const ids = contatos.map((c) => c.c2s_contact_id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("id, stage, valor, c2s_contact_id")
      .in("c2s_contact_id", ids.slice(i, i + 200));
    for (const l of data ?? []) {
      if (l.c2s_contact_id)
        existentes.set(l.c2s_contact_id, {
          id: l.id,
          stage: l.stage as StageId,
          valor: Number(l.valor ?? 0),
        });
    }
  }

  const novos: Record<string, unknown>[] = [];
  const atualizados: Record<string, unknown>[] = [];

  for (const contato of contatos) {
    let corretorId: string | null = null;
    if (contato.c2s_agent_id && byAgent.has(contato.c2s_agent_id)) {
      corretorId = byAgent.get(contato.c2s_agent_id)!;
    } else if (contato.corretor_email && byEmail.has(contato.corretor_email.toLowerCase())) {
      corretorId = byEmail.get(contato.corretor_email.toLowerCase())!;
    } else if (contato.corretor_nome || contato.c2s_agent_id) {
      const { data: novo } = await supabaseAdmin
        .from("corretores")
        .insert({
          nome: contato.corretor_nome ?? `Corretor ${contato.c2s_agent_id}`,
          email: contato.corretor_email,
          c2s_agent_id: contato.c2s_agent_id,
        })
        .select("id")
        .single();
      if (novo) {
        corretorId = novo.id;
        result.corretoresCriados += 1;
        if (contato.c2s_agent_id) byAgent.set(contato.c2s_agent_id, novo.id);
        if (contato.corretor_email) byEmail.set(contato.corretor_email.toLowerCase(), novo.id);
      }
    }

    const existente = existentes.get(contato.c2s_contact_id);

    const base = {
      nome: contato.nome,
      telefone: contato.telefone,
      email: contato.email,
      imovel: contato.imovel,
      valor: valorComTabela(contato.imovel, contato.valor),
      origem: contato.origem,
      ultima_interacao: contato.ultima_interacao,
      data_c2s: contato.data_c2s,
      corretor_id: corretorId,
      last_synced_at: new Date().toISOString(),
    };

    // Regra do time: o C2S nunca move o lead de coluna.
    // Novo lead entra sempre em "novo"; a etapa só muda manualmente dentro do CRM.
    if (!existente) {
      novos.push({ ...base, c2s_contact_id: contato.c2s_contact_id, stage: "novo" as StageId });
      result.criados += 1;
      continue;
    }

    // Atualiza somente dados do contato, preservando a etapa definida no painel.
    // O valor digitado pelo corretor nunca é zerado: só sobrescrevemos quando o
    // C2S traz valor maior que zero; se ambos forem zero, usa a tabela do projeto.
    atualizados.push({
      ...base,
      valor:
        Number(contato.valor) > 0
          ? Number(contato.valor)
          : Number(existente.valor) > 0
            ? existente.valor
            : valorComTabela(contato.imovel, 0),
      c2s_contact_id: contato.c2s_contact_id,
      stage: existente.stage,
    });
    result.atualizados += 1;



  }

  // Gravação em lote (upsert por c2s_contact_id) para a rodada terminar em segundos.
  const gravar = async (linhas: Record<string, unknown>[]) => {
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await supabaseAdmin
        .from("leads")
        .upsert(linhas.slice(i, i + 200) as never, { onConflict: "c2s_contact_id" });
      if (error) throw new Error(`Falha ao gravar contatos no CRM: ${error.message}`);
    }
  };
  await gravar(novos);
  await gravar(atualizados);

  return result;
}


export async function runC2SSync(origem: string = "manual", desde?: string): Promise<SyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startedAt = new Date();
  const result: SyncResult = {
    criados: 0,
    atualizados: 0,
    movidos: 0,
    corretoresCriados: 0,
    total: 0,
  };

  // Trava: com vários corretores logados e a rotina automática de 1 em 1 minuto,
  // nunca deixamos duas sincronizações rodarem ao mesmo tempo (evita travar o C2S e o banco).
  const { data: emAndamento } = await supabaseAdmin
    .from("sync_runs")
    .select("id")
    .is("finished_at", null)
    .gt("started_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .limit(1);
  if (emAndamento && emAndamento.length > 0) return result;

  const { data: corrida } = await supabaseAdmin
    .from("sync_runs")
    .insert({ started_at: startedAt.toISOString(), status: "rodando", origem })
    .select("id")
    .single();
  const corridaId = corrida?.id ?? null;

  const registrar = async (status: "sucesso" | "erro", erro?: string) => {
    const linha = {
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duracao_ms: Date.now() - startedAt.getTime(),
      status,
      origem,
      total: result.total,
      criados: result.criados,
      atualizados: result.atualizados,
      movidos: result.movidos,
      corretores_criados: result.corretoresCriados,
      erro: erro ?? null,
    };
    if (corridaId) {
      await supabaseAdmin.from("sync_runs").update(linha).eq("id", corridaId);
    } else {
      await supabaseAdmin.from("sync_runs").insert(linha);
    }
  };


  // Modo incremental: sem data informada, buscamos só o que mudou desde a última
  // sincronização bem-sucedida (com 30 min de folga), deixando cada rodada bem rápida.
  let janela = desde;
  if (!janela) {
    const { data: ultima } = await supabaseAdmin
      .from("sync_runs")
      .select("started_at")
      .eq("status", "sucesso")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultima?.started_at) {
      janela = new Date(Date.parse(ultima.started_at) - 10 * 60 * 1000).toISOString();
    }
  }

  try {
    await executarSync(supabaseAdmin, result, janela);
  } catch (e) {
    await registrar("erro", e instanceof Error ? e.message : String(e));
    throw e;
  }

  await registrar("sucesso");
  return result;
}
