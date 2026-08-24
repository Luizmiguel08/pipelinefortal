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

export async function runC2SSync(origem: string = "manual"): Promise<SyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startedAt = new Date();

  const registrar = async (
    status: "sucesso" | "erro",
    r: SyncResult,
    erro?: string,
  ) => {
    await supabaseAdmin.from("sync_runs").insert({
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      duracao_ms: Date.now() - startedAt.getTime(),
      status,
      origem,
      total: r.total,
      criados: r.criados,
      atualizados: r.atualizados,
      movidos: r.movidos,
      corretores_criados: r.corretoresCriados,
      erro: erro ?? null,
    });
  };

  const result: SyncResult = {
    criados: 0,
    atualizados: 0,
    movidos: 0,
    corretoresCriados: 0,
    total: 0,
  };

  try {
    return await executarSync(supabaseAdmin, result);
  } catch (e) {
    await registrar("erro", result, e instanceof Error ? e.message : String(e));
    throw e;
  } finally {
    if (!("erroRegistrado" in result)) {
      // noop: sucesso registrado abaixo
    }
  }
}


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

    const { data: existente } = await supabaseAdmin
      .from("leads")
      .select("id, stage")
      .eq("c2s_contact_id", contato.c2s_contact_id)
      .maybeSingle();

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
      await supabaseAdmin.from("leads").insert({
        ...base,
        c2s_contact_id: contato.c2s_contact_id,
        stage: contato.stage,
      });
      result.criados += 1;
      continue;
    }

    // O lead nunca volta de etapa: mantemos a fase mais avançada entre C2S e painel.
    const atual = existente.stage as StageId;
    const proxima = rank(contato.stage) > rank(atual) ? contato.stage : atual;
    await supabaseAdmin
      .from("leads")
      .update({ ...base, stage: proxima })
      .eq("id", existente.id);
    result.atualizados += 1;
    if (proxima !== atual) result.movidos += 1;
  }

  return result;
}
