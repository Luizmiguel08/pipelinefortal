import type { BoardLead } from "./crm.functions";

/**
 * Chave de deduplicação do funil: o telefone é a chave principal
 * (últimos 8 dígitos, ignorando DDI/DDD e formatação). Sem telefone,
 * caímos no lead vinculado do C2S e, por último, no nome normalizado.
 */
export function chaveCliente(lead: Pick<BoardLead, "telefone" | "agenda_lead_id" | "nome" | "id">): string {
  const digitos = (lead.telefone ?? "").replace(/\D/g, "");
  if (digitos.length >= 8) return `tel:${digitos.slice(-8)}`;
  if (lead.agenda_lead_id) return `lead:${lead.agenda_lead_id}`;
  const nome = (lead.nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return nome ? `nome:${nome}` : `id:${lead.id}`;
}

const ordem = (l: BoardLead) => new Date(l.data_c2s ?? l.created_at ?? 0).getTime();

/**
 * Mantém apenas um card por cliente em cada coluna (o mais recente),
 * evitando repetições em Documentação, Agendado e Visita realizada.
 */
export function dedupePorTelefone(leads: BoardLead[]): BoardLead[] {
  const melhores = new Map<string, BoardLead>();
  for (const lead of leads) {
    const chave = `${lead.stage}|${chaveCliente(lead)}`;
    const atual = melhores.get(chave);
    if (!atual || ordem(lead) > ordem(atual)) melhores.set(chave, lead);
  }
  return leads.filter((l) => melhores.get(`${l.stage}|${chaveCliente(l)}`) === l);
}
