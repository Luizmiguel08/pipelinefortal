/** Espelha cada registro da Agenda e cruza o contato com C2S e corretor. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchTodosAgendamentos, normalizarNome, normalizarTelefone } from "./agenda.server";

type SyncResult = {
  total: number;
  criados: number;
  atualizados: number;
  vinculadosC2s: number;
  naoEncontradosC2s: number;
  corretoresNaoReconhecidos: number;
  erro: string | null;
};

type LeadMatch = { id: string; nome: string; telefone: string | null; agenda_appointment_id: string | null };

export async function runAgendaSync(
  origem: string = "cron",
  _desde: string | null = null,
  _reconciliacaoCompleta = true,
): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  let total = 0;
  let criados = 0;
  let atualizados = 0;
  let vinculadosC2s = 0;
  let naoEncontradosC2s = 0;
  let corretoresNaoReconhecidos = 0;
  let erro: string | null = null;

  try {
    // Espelho fiel: sempre lemos a agenda inteira (datas passadas, de hoje e futuras)
    // para refletir criações, mudanças de status e cancelamentos em qualquer data.
    const agendamentos = await fetchTodosAgendamentos();
    total = agendamentos.length;


    const leads: LeadMatch[] = [];
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabaseAdmin
        .from("leads")
        .select("id, nome, telefone, agenda_appointment_id")
        .not("c2s_contact_id", "is", null)
        .order("created_at", { ascending: true })
        .range(inicio, inicio + 999);
      if (error) throw error;
      const pagina = (data ?? []) as LeadMatch[];
      leads.push(...pagina);
      if (pagina.length < 1000) break;
    }

    const porAppointment = new Map<string, LeadMatch>();
    const porTelefone = new Map<string, LeadMatch[]>();
    const porNome = new Map<string, LeadMatch[]>();
    for (const lead of leads) {
      if (lead.agenda_appointment_id) porAppointment.set(lead.agenda_appointment_id, lead);
      const telefone = normalizarTelefone(lead.telefone);
      if (telefone) porTelefone.set(telefone, [...(porTelefone.get(telefone) ?? []), lead]);
      const nome = normalizarNome(lead.nome);
      if (nome) porNome.set(nome, [...(porNome.get(nome) ?? []), lead]);
    }

    const { data: corretoresExistentes, error: corretoresError } = await supabaseAdmin
      .from("corretores")
      .select("id, nome, email");
    if (corretoresError) throw corretoresError;
    const corretorPorNome = new Map((corretoresExistentes ?? []).map((c) => [normalizarNome(c.nome), c.id]));
    const corretorPorEmail = new Map(
      (corretoresExistentes ?? []).filter((c) => c.email).map((c) => [c.email?.trim().toLowerCase(), c.id]),
    );

    // Ids já espelhados (paginado: o PostgREST devolve no máximo 1000 linhas).
    const idsExistentes = new Set<string>();
    for (let inicio = 0; ; inicio += 1000) {
      const { data, error } = await supabaseAdmin
        .from("agenda_appointments")
        .select("id")
        .order("id", { ascending: true })
        .range(inicio, inicio + 999);
      if (error) throw error;
      const pagina = data ?? [];
      for (const linha of pagina) idsExistentes.add(linha.id);
      if (pagina.length < 1000) break;
    }

    const idsRecebidos: string[] = [];
    const payloads = agendamentos.map((ag) => {
      idsRecebidos.push(ag.id);
      const telefone = normalizarTelefone(ag.cliente_telefone);
      const nome = normalizarNome(ag.cliente_nome);
      // O vínculo por nome só vale quando não há telefone para conferir e o nome é
      // único no C2S. Sem isso, vários "Leonardo" de telefones diferentes caíam no
      // mesmo lead e o card se repetia em Documentação/Visita realizada.
      const porNomeCandidatos = porNome.get(nome) ?? [];
      const nomeUnico =
        porNomeCandidatos.length === 1 &&
        (!telefone || !normalizarTelefone(porNomeCandidatos[0]!.telefone));
      const candidatos = porAppointment.get(ag.id)
        ? [porAppointment.get(ag.id)]
        : telefone && porTelefone.has(telefone)
          ? porTelefone.get(telefone)
          : nomeUnico
            ? porNomeCandidatos
            : [];
      const lead = candidatos?.[0] ?? null;


      const emailCorretor = ag.corretor_email?.trim().toLowerCase();
      const corretorId =
        (emailCorretor ? corretorPorEmail.get(emailCorretor) : null) ??
        (ag.corretor_nome ? corretorPorNome.get(normalizarNome(ag.corretor_nome)) : null) ??
        null;

      if (lead) vinculadosC2s += 1;
      else naoEncontradosC2s += 1;
      if (!corretorId) corretoresNaoReconhecidos += 1;
      if (idsExistentes.has(ag.id)) atualizados += 1;
      else criados += 1;

      return {
        id: ag.id,
        cliente_nome: ag.cliente_nome,
        cliente_telefone: ag.cliente_telefone,
        corretor_nome: ag.corretor_nome,
        corretor_email: ag.corretor_email,
        empreendimento: ag.empreendimento,
        visita_em: ag.visita_em,
        status: ag.status,
        motivo: ag.motivo,
        agenda_atualizado_em: ag.atualizado_em,
        agenda_criado_em: ag.criado_em,
        lead_id: lead?.id ?? null,
        corretor_id: corretorId,
        encontrado_c2s: Boolean(lead),
        synced_at: new Date().toISOString(),
      };
    });

    for (let inicio = 0; inicio < payloads.length; inicio += 200) {
      const { error: upsertError } = await supabaseAdmin
        .from("agenda_appointments")
        .upsert(payloads.slice(inicio, inicio + 200), { onConflict: "id" });
      if (upsertError) throw upsertError;
    }

    // Remove do espelho o que não existe mais na agenda, em qualquer data.
    const recebidos = new Set(idsRecebidos);
    const obsoletos = [...idsExistentes].filter((id) => !recebidos.has(id));
    for (let inicio = 0; inicio < obsoletos.length; inicio += 200) {
      const { error: cleanupError } = await supabaseAdmin
        .from("agenda_appointments")
        .delete()
        .in("id", obsoletos.slice(inicio, inicio + 200));
      if (cleanupError) throw cleanupError;
    }

  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  await supabaseAdmin.from("agenda_sync_runs").insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: erro ? "erro" : "sucesso",
    origem,
    total,
    criados,
    atualizados,
    vinculados_c2s: vinculadosC2s,
    nao_encontrados_c2s: naoEncontradosC2s,
    corretores_nao_reconhecidos: corretoresNaoReconhecidos,
    erro,
  });

  return { total, criados, atualizados, vinculadosC2s, naoEncontradosC2s, corretoresNaoReconhecidos, erro };
}