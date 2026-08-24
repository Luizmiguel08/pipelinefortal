import { fetchC2SContacts } from "./c2s.server";
import { STAGE_IDS, type StageId } from "./stages";

export type SyncResult = {
  criados: number;
  atualizados: number;
  movidos: number;
  corretoresCriados: number;
  total: number;
};

function rank(stage: StageId) {
  return STAGE_IDS.indexOf(stage);
}

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

async function executarSync(supabaseAdmin: AdminClient, result: SyncResult, desde?: string) {
  const contatos = await fetchC2SContacts(
    desde ? { desde, maxPaginas: 600 } : {},
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
  const existentes = new Map<string, { id: string; stage: StageId }>();
  const ids = contatos.map((c) => c.c2s_contact_id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabaseAdmin
      .from("leads")
      .select("id, stage, c2s_contact_id")
      .in("c2s_contact_id", ids.slice(i, i + 200));
    for (const l of data ?? []) {
      if (l.c2s_contact_id) existentes.set(l.c2s_contact_id, { id: l.id, stage: l.stage as StageId });
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
      valor: contato.valor,
      origem: contato.origem,
      ultima_interacao: contato.ultima_interacao,
      corretor_id: corretorId,
      last_synced_at: new Date().toISOString(),
    };

    if (!existente) {
      novos.push({ ...base, c2s_contact_id: contato.c2s_contact_id, stage: contato.stage });
      result.criados += 1;
      continue;
    }

    // O lead nunca volta de etapa: mantemos a fase mais avançada entre C2S e painel.
    const atual = existente.stage;
    const proxima = rank(contato.stage) > rank(atual) ? contato.stage : atual;
    atualizados.push({ ...base, c2s_contact_id: contato.c2s_contact_id, stage: proxima });
    result.atualizados += 1;
    if (proxima !== atual) result.movidos += 1;
  }

  // Gravação em lote (upsert por c2s_contact_id) para a rodada terminar em segundos.
  const gravar = async (linhas: Record<string, unknown>[]) => {
    for (let i = 0; i < linhas.length; i += 200) {
      await supabaseAdmin
        .from("leads")
        .upsert(linhas.slice(i, i + 200) as never, { onConflict: "c2s_contact_id" });
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

  const registrar = async (status: "sucesso" | "erro", erro?: string) => {
    await supabaseAdmin.from("sync_runs").insert({
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
    });
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
