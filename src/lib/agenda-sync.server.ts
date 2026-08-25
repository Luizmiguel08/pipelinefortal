import {
  fetchAgendamentos,
  normalizarNome,
  normalizarTelefone,
  type AgendaAppointment,
} from "./agenda.server";
import type { StageId } from "./stages";

export type AgendaSyncResult = {
  total: number;
  criados: number;
  atualizados: number;
};

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

/** Etapas comerciais avançadas: a agenda não puxa o lead de volta. */
const ETAPAS_PROTEGIDAS: StageId[] = ["negociacao", "documentacao", "fechamento"];

function etapaDoStatus(status: AgendaAppointment["status"]): StageId {
  if (status === "realizado") return "visita_realizada";
  if (status === "desmarcado") return "atendimento";
  return "visita";
}

type LeadRef = {
  id: string;
  stage: StageId;
  telefone: string | null;
  nome: string;
  corretor_id: string | null;
  agenda_appointment_id: string | null;
};

async function carregarLeads(supabaseAdmin: AdminClient) {
  const pagina = 1000;
  const todos: LeadRef[] = [];
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("id, stage, telefone, nome, corretor_id, agenda_appointment_id")
      .order("created_at", { ascending: false })
      .range(inicio, inicio + pagina - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as unknown as LeadRef[];
    todos.push(...lote);
    if (lote.length < pagina) break;
  }
  return todos;
}

async function resolverCorretores(supabaseAdmin: AdminClient) {
  const { data } = await supabaseAdmin.from("corretores").select("id, nome, email");
  const porEmail = new Map<string, string>();
  const porNome = new Map<string, string>();
  for (const c of data ?? []) {
    if (c.email) porEmail.set(c.email.toLowerCase(), c.id);
    if (c.nome) porNome.set(normalizarNome(c.nome), c.id);
  }
  return { porEmail, porNome };
}

export async function runAgendaSync(
  origem: "manual" | "automatico" = "manual",
  desde?: string,
): Promise<AgendaSyncResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const inicio = Date.now();

  // Trava: evita duas sincronizações simultâneas (igual ao C2S).
  const { data: emAndamento } = await supabaseAdmin
    .from("agenda_sync_runs")
    .select("id")
    .eq("status", "executando")
    .gt("started_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .limit(1);
  if (emAndamento && emAndamento.length > 0) {
    return { total: 0, criados: 0, atualizados: 0 };
  }

  const { data: corrida } = await supabaseAdmin
    .from("agenda_sync_runs")
    .insert({ origem, status: "executando" })
    .select("id")
    .single();

  const result: AgendaSyncResult = { total: 0, criados: 0, atualizados: 0 };

  // Modo incremental: se não veio data, pega desde a última sync com sucesso.
  let janela = desde;
  if (!janela) {
    const { data: ultima } = await supabaseAdmin
      .from("agenda_sync_runs")
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
    const agendamentos = await fetchAgendamentos(janela);
    result.total = agendamentos.length;

    const [leads, corretores] = await Promise.all([
      carregarLeads(supabaseAdmin),
      resolverCorretores(supabaseAdmin),
    ]);

    const porAppointment = new Map<string, LeadRef>();
    const porTelefone = new Map<string, LeadRef>();
    const porNomeLead = new Map<string, LeadRef>();
    for (const l of leads) {
      if (l.agenda_appointment_id) porAppointment.set(l.agenda_appointment_id, l);
      const tel = normalizarTelefone(l.telefone);
      if (tel && !porTelefone.has(tel)) porTelefone.set(tel, l);
      const nome = normalizarNome(l.nome);
      if (nome && !porNomeLead.has(nome)) porNomeLead.set(nome, l);
    }

    const agora = new Date().toISOString();

    for (const ag of agendamentos) {
      const tel = normalizarTelefone(ag.cliente_telefone);
      const nome = normalizarNome(ag.cliente_nome);
      const lead =
        porAppointment.get(ag.id) ??
        (tel ? porTelefone.get(tel) : undefined) ??
        porNomeLead.get(nome);

      const corretorId =
        (ag.corretor_email ? corretores.porEmail.get(ag.corretor_email.toLowerCase()) : undefined) ??
        (ag.corretor_nome ? corretores.porNome.get(normalizarNome(ag.corretor_nome)) : undefined) ??
        null;

      const etapa = etapaDoStatus(ag.status);
      const base = {
        agenda_appointment_id: ag.id,
        visita_status: ag.status,
        visita_motivo: ag.status === "desmarcado" ? ag.motivo : null,
        visita_projeto: ag.empreendimento,
        visita_em: ag.status === "desmarcado" ? null : ag.visita_em,
        visita_realizada: ag.status === "realizado",
        agenda_synced_at: agora,
        ultima_interacao: agora,
      };

      if (lead) {
        const manterEtapa = ETAPAS_PROTEGIDAS.includes(lead.stage);
        const { error } = await supabaseAdmin
          .from("leads")
          .update({
            ...base,
            ...(manterEtapa ? {} : { stage: etapa }),
            // Sempre atualiza o corretor_id se o agendamento identifica o corretor,
            // garantindo que o lead apareça no pipeline do corretor certo.
            ...(corretorId ? { corretor_id: corretorId } : {}),
          } as never)
          .eq("id", lead.id);
        if (!error) {
          result.atualizados += 1;
          lead.agenda_appointment_id = ag.id;
          porAppointment.set(ag.id, lead);
          if (!manterEtapa) lead.stage = etapa;
          if (corretorId) lead.corretor_id = corretorId;
        }
      } else {
        const { data: criado, error } = await supabaseAdmin
          .from("leads")
          .insert({
            ...base,
            nome: ag.cliente_nome,
            telefone: ag.cliente_telefone,
            imovel: ag.empreendimento,
            corretor_id: corretorId,
            origem: "Agenda",
            stage: etapa,
          } as never)
          .select("id")
          .single();
        if (!error && criado) {
          result.criados += 1;
          const novo: LeadRef = {
            id: criado.id,
            stage: etapa,
            telefone: ag.cliente_telefone,
            nome: ag.cliente_nome,
            corretor_id: corretorId,
            agenda_appointment_id: ag.id,
          };
          porAppointment.set(ag.id, novo);
          if (tel) porTelefone.set(tel, novo);
          if (nome) porNomeLead.set(nome, novo);
        }
      }
    }

    if (corrida) {
      await supabaseAdmin
        .from("agenda_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "sucesso",
          total: result.total,
          criados: result.criados,
          atualizados: result.atualizados,
        })
        .eq("id", corrida.id);
    }

    console.info("Agenda sync concluída", { ...result, ms: Date.now() - inicio });
    return result;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
    if (corrida) {
      await supabaseAdmin
        .from("agenda_sync_runs")
        .update({
          finished_at: new Date().toISOString(),
          status: "erro",
          erro: mensagem,
          total: result.total,
          criados: result.criados,
          atualizados: result.atualizados,
        })
        .eq("id", corrida.id);
    }
    throw erro;
  }
}
