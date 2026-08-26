/**
 * Sincronização dos agendamentos vindos do Agendamento Pro com os leads do pipeline.
 * Roda a cada minuto via cron e pode ser disparada manualmente.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchAgendamentos,
  normalizarTelefone,
  normalizarNome,
  type AgendaAppointment,
} from "./agenda.server";

export async function runAgendaSync(
  origem: string = "cron",
  desde: string | null = null,
): Promise<{ total: number; criados: number; atualizados: number; erro: string | null }> {
  const startedAt = new Date().toISOString();
  let total = 0;
  let criados = 0;
  let atualizados = 0;
  let erro: string | null = null;

  try {
    // Buscar último run com sucesso para saber o "desde" quando não informado.
    let desdeEfetivo = desde;
    if (!desdeEfetivo) {
      const { data: ultimoRun } = await supabaseAdmin
        .from("agenda_sync_runs")
        .select("started_at")
        .eq("status", "ok")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      desdeEfetivo = ultimoRun?.started_at ?? null;
    }

    const agendamentos = await fetchAgendamentos(desdeEfetivo ?? undefined);
    total = agendamentos.length;

    if (agendamentos.length === 0) {
      await registrarRun(startedAt, "ok", origem, total, criados, atualizados, null);
      return { total, criados, atualizados, erro: null };
    }

    // Carregar todos os leads para fazer o match por telefone e nome.
    const { data: leadsExistentes } = await supabaseAdmin
      .from("leads")
      .select("id, nome, telefone, visita_em, visita_status");
    const leads = leadsExistentes ?? [];

    // Índices para match: telefone normalizado -> leads, nome normalizado -> leads
    const porTelefone = new Map<string, typeof leads>();
    const porNome = new Map<string, typeof leads>();
    for (const lead of leads) {
      const tel = normalizarTelefone(lead.telefone);
      if (tel) {
        const arr = porTelefone.get(tel) ?? [];
        arr.push(lead);
        porTelefone.set(tel, arr);
      }
      const nome = normalizarNome(lead.nome);
      if (nome) {
        const arr = porNome.get(nome) ?? [];
        arr.push(lead);
        porNome.set(nome, arr);
      }
    }

    // Carregar corretores para vincular por nome/email do corretor do agendamento.
    const { data: corretoresExistentes } = await supabaseAdmin
      .from("corretores")
      .select("id, nome, email");
    const corretores = corretoresExistentes ?? [];
    const corretorPorNome = new Map(
      corretores.map((c) => [normalizarNome(c.nome), c.id]),
    );
    const corretorPorEmail = new Map(
      corretores.filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]),
    );

    // Agrupar agendamentos por lead matched — se vários agendamentos batem no mesmo lead,
    // usamos o mais recente (por visita_em ou atualizado_em).
    type MatchResult = {
      leadId: string | null;
      agendamento: AgendaAppointment;
      corretorId: string | null;
    };

    const matchesPorLead = new Map<string, MatchResult>();
    const semMatch: MatchResult[] = [];

    for (const ag of agendamentos) {
      const telAg = normalizarTelefone(ag.cliente_telefone);
      const nomeAg = normalizarNome(ag.cliente_nome);

      // Tentar match por telefone primeiro (mais confiável).
      let candidatos = telAg ? (porTelefone.get(telAg) ?? []) : [];
      // Se não encontrou por telefone, tentar por nome exato.
      if (candidatos.length === 0 && nomeAg) {
        candidatos = porNome.get(nomeAg) ?? [];
      }

      // Resolver corretor do agendamento.
      let corretorId: string | null = null;
      if (ag.corretor_email) {
        corretorId = corretorPorEmail.get(ag.corretor_email.toLowerCase()) ?? null;
      }
      if (!corretorId && ag.corretor_nome) {
        corretorId = corretorPorNome.get(normalizarNome(ag.corretor_nome)) ?? null;
      }

      if (candidatos.length === 0) {
        semMatch.push({ leadId: null, agendamento: ag, corretorId });
        continue;
      }

      // Se há mais de um candidato, pegar o primeiro (geralmente há só um).
      const leadId = candidatos[0].id;
      const existente = matchesPorLead.get(leadId);
      if (existente) {
        // Manter o agendamento com a visita mais recente.
        const dataExistente = existente.agendamento.visita_em ?? existente.agendamento.atualizado_em ?? "";
        const dataNovo = ag.visita_em ?? ag.atualizado_em ?? "";
        if (dataNovo > dataExistente) {
          matchesPorLead.set(leadId, { leadId, agendamento: ag, corretorId });
        }
      } else {
        matchesPorLead.set(leadId, { leadId, agendamento: ag, corretorId });
      }
    }

    // Aplicar updates nos leads existentes.
    for (const [leadId, match] of matchesPorLead) {
      const ag = match.agendamento;
      const updatePayload: Record<string, unknown> = {
        visita_em: ag.visita_em,
        visita_status: ag.status,
        visita_realizada: ag.status === "realizado",
        visita_motivo: ag.motivo,
        visita_projeto: ag.empreendimento,
      };
      // Atualizar corretor se identificado e lead ainda não tem.
      if (match.corretorId) {
        // Só sobrescreve se o lead não tem corretor.
        const lead = leads.find((l) => l.id === leadId);
        // Nota: não sobrescrevemos corretor se já existe — pode ter sido atribuído manualmente.
        if (lead && !(lead as Record<string, unknown>)["corretor_id"]) {
          updatePayload.corretor_id = match.corretorId;
        }
      }

      const { error: updateErr } = await supabaseAdmin
        .from("leads")
        .update(updatePayload)
        .eq("id", leadId);
      if (!updateErr) atualizados += 1;
    }

    // Criar leads para agendamentos sem match.
    for (const match of semMatch) {
      const ag = match.agendamento;
      const insertPayload = {
        nome: ag.cliente_nome,
        telefone: ag.cliente_telefone,
        imovel: ag.empreendimento,
        valor: 0,
        stage: ag.status === "realizado" ? "visita_realizada" : "visita",
        corretor_id: match.corretorId,
        origem: "Agenda",
        visita_em: ag.visita_em,
        visita_status: ag.status,
        visita_realizada: ag.status === "realizado",
        visita_motivo: ag.motivo,
        visita_projeto: ag.empreendimento,
        ultima_interacao: new Date().toISOString(),
      };

      const { error: insertErr } = await supabaseAdmin.from("leads").insert(insertPayload);
      if (!insertErr) criados += 1;
    }
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  await registrarRun(startedAt, erro ? "erro" : "ok", origem, total, criados, atualizados, erro);
  return { total, criados, atualizados, erro };
}

async function registrarRun(
  startedAt: string,
  status: string,
  origem: string,
  total: number,
  criados: number,
  atualizados: number,
  erro: string | null,
) {
  await supabaseAdmin.from("agenda_sync_runs").insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status,
    origem,
    total,
    criados,
    atualizados,
    erro,
  });
}
