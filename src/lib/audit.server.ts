import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchC2SContacts } from "./c2s.server";

export type AuditLinha = {
  corretorId: string | null;
  nome: string;
  c2sAgentId: string | null;
  c2sTotal: number;
  crmTotal: number;
  diferenca: number;
  faltandoNoCrm: number;
  atribuicaoDivergente: number;
  causas: string[];
};

export type AuditResultado = {
  desde: string;
  geradoEm: string;
  c2sTotal: number;
  crmTotal: number;
  faltandoNoCrm: number;
  semCorretorNoCrm: number;
  agentesDesconhecidos: number;
  contatosSemAgente: number;
  linhas: AuditLinha[];
  amostraFaltando: { c2s_contact_id: string; nome: string; corretor: string | null }[];
};

type LeadRow = {
  id: string;
  c2s_contact_id: string | null;
  corretor_id: string | null;
  data_c2s: string | null;
};

async function carregarLeads(supabase: SupabaseClient, desde: string): Promise<LeadRow[]> {
  const pagina = 1000;
  const todos: LeadRow[] = [];
  for (let inicio = 0; ; inicio += pagina) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, c2s_contact_id, corretor_id, data_c2s")
      .gte("data_c2s", desde)
      .order("data_c2s", { ascending: false })
      .range(inicio, inicio + pagina - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as LeadRow[];
    todos.push(...lote);
    if (lote.length < pagina) break;
  }
  return todos;
}

export async function auditarContagens(
  supabase: SupabaseClient,
  desdeISO: string,
): Promise<AuditResultado> {
  const [contatos, leads, { data: corretoresRaw, error: errCorretores }] = await Promise.all([
    fetchC2SContacts({ desde: desdeISO, maxPaginas: 400 }),
    carregarLeads(supabase, desdeISO),
    supabase.from("corretores").select("id, nome, c2s_agent_id").order("nome"),
  ]);
  if (errCorretores) throw new Error(errCorretores.message);

  const corretores = (corretoresRaw ?? []) as { id: string; nome: string; c2s_agent_id: string | null }[];
  const porAgente = new Map<string, { id: string; nome: string }>();
  for (const c of corretores) if (c.c2s_agent_id) porAgente.set(String(c.c2s_agent_id), { id: c.id, nome: c.nome });

  const leadPorContato = new Map<string, LeadRow>();
  for (const l of leads) if (l.c2s_contact_id) leadPorContato.set(String(l.c2s_contact_id), l);

  type Agg = {
    corretorId: string | null;
    nome: string;
    c2sAgentId: string | null;
    c2sTotal: number;
    crmTotal: number;
    faltandoNoCrm: number;
    atribuicaoDivergente: number;
    agenteDesconhecido: boolean;
  };
  const agg = new Map<string, Agg>();
  const chaveDe = (agentId: string | null, nome: string | null) =>
    agentId ? `a:${agentId}` : nome ? `n:${nome.toLowerCase()}` : "sem-agente";

  const garantir = (chave: string, base: Partial<Agg>): Agg => {
    let atual = agg.get(chave);
    if (!atual) {
      atual = {
        corretorId: base.corretorId ?? null,
        nome: base.nome ?? "Sem corretor",
        c2sAgentId: base.c2sAgentId ?? null,
        c2sTotal: 0,
        crmTotal: 0,
        faltandoNoCrm: 0,
        atribuicaoDivergente: 0,
        agenteDesconhecido: base.agenteDesconhecido ?? false,
      };
      agg.set(chave, atual);
    }
    return atual;
  };

  // Base: todos os corretores cadastrados aparecem na auditoria.
  for (const c of corretores) {
    garantir(c.c2s_agent_id ? `a:${c.c2s_agent_id}` : `id:${c.id}`, {
      corretorId: c.id,
      nome: c.nome,
      c2sAgentId: c.c2s_agent_id,
    });
  }

  let contatosSemAgente = 0;
  let faltandoTotal = 0;
  const amostraFaltando: AuditResultado["amostraFaltando"] = [];
  const agentesDesconhecidos = new Set<string>();

  for (const contato of contatos) {
    const agentId = contato.c2s_agent_id ? String(contato.c2s_agent_id) : null;
    if (!agentId) contatosSemAgente += 1;
    const conhecido = agentId ? porAgente.get(agentId) : undefined;
    if (agentId && !conhecido) agentesDesconhecidos.add(agentId);

    const chave = conhecido ? `a:${agentId}` : chaveDe(agentId, contato.corretor_nome);
    const linha = garantir(chave, {
      corretorId: conhecido?.id ?? null,
      nome: conhecido?.nome ?? contato.corretor_nome ?? "Sem corretor no C2S",
      c2sAgentId: agentId,
      agenteDesconhecido: !!agentId && !conhecido,
    });
    linha.c2sTotal += 1;

    const lead = leadPorContato.get(String(contato.c2s_contact_id));
    if (!lead) {
      linha.faltandoNoCrm += 1;
      faltandoTotal += 1;
      if (amostraFaltando.length < 20) {
        amostraFaltando.push({
          c2s_contact_id: contato.c2s_contact_id,
          nome: contato.nome,
          corretor: conhecido?.nome ?? contato.corretor_nome ?? null,
        });
      }
    } else if (conhecido && lead.corretor_id !== conhecido.id) {
      linha.atribuicaoDivergente += 1;
    }
  }

  // Contagem do CRM por corretor (leads criados no período).
  const crmPorCorretor = new Map<string, number>();
  let semCorretorNoCrm = 0;
  for (const l of leads) {
    if (!l.corretor_id) {
      semCorretorNoCrm += 1;
      continue;
    }
    crmPorCorretor.set(l.corretor_id, (crmPorCorretor.get(l.corretor_id) ?? 0) + 1);
  }
  for (const linha of agg.values()) {
    if (linha.corretorId) linha.crmTotal = crmPorCorretor.get(linha.corretorId) ?? 0;
  }
  if (semCorretorNoCrm > 0) {
    const linha = garantir("crm:sem-corretor", { nome: "Leads sem corretor no CRM" });
    linha.crmTotal += semCorretorNoCrm;
  }

  const linhas: AuditLinha[] = [...agg.values()]
    .map((l) => {
      const causas: string[] = [];
      if (l.agenteDesconhecido)
        causas.push("Agente do C2S não vinculado a nenhum corretor cadastrado — importe os corretores.");
      if (!l.c2sAgentId && l.c2sTotal > 0)
        causas.push("Contatos sem corretor definido no C2S — ficam sem dono no funil.");
      if (l.faltandoNoCrm > 0)
        causas.push(`${l.faltandoNoCrm} contato(s) do C2S ainda não sincronizados para o CRM.`);
      if (l.atribuicaoDivergente > 0)
        causas.push(`${l.atribuicaoDivergente} lead(s) no CRM estão com outro corretor.`);
      if (l.crmTotal > l.c2sTotal && l.c2sTotal > 0)
        causas.push("CRM tem mais leads: contatos antigos/manuais ou transferidos de outro corretor.");
      if (l.crmTotal === 0 && l.c2sTotal === 0) causas.push("Sem movimentação no período.");
      if (!causas.length) causas.push("Contagens conferem.");
      return {
        corretorId: l.corretorId,
        nome: l.nome,
        c2sAgentId: l.c2sAgentId,
        c2sTotal: l.c2sTotal,
        crmTotal: l.crmTotal,
        diferenca: l.crmTotal - l.c2sTotal,
        faltandoNoCrm: l.faltandoNoCrm,
        atribuicaoDivergente: l.atribuicaoDivergente,
        causas,
      };
    })
    .sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca) || b.c2sTotal - a.c2sTotal);

  return {
    desde: desdeISO,
    geradoEm: new Date().toISOString(),
    c2sTotal: contatos.length,
    crmTotal: leads.length,
    faltandoNoCrm: faltandoTotal,
    semCorretorNoCrm,
    agentesDesconhecidos: agentesDesconhecidos.size,
    contatosSemAgente,
    linhas,
    amostraFaltando,
  };
}
