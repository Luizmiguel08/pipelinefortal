import { STAGE_IDS, type StageId } from "./stages";
import type { BoardCorretor, BoardLead } from "./crm.functions";

/**
 * Formato compacto do funil: cada lead viaja como array (sem repetir os nomes
 * dos campos em milhares de registros), o que reduz muito o tamanho da resposta
 * e o tempo de serialização. O cliente reconstrói o objeto ao receber.
 */
export type LeadWire = (string | number | boolean | null)[];

export type BoardWire = {
  isGestor: boolean;
  nome: string;
  meuCorretorId: string | null;
  corretores: BoardCorretor[];
  leads: LeadWire[];
};

export type BoardDecoded = {
  isGestor: boolean;
  nome: string;
  meuCorretorId: string | null;
  corretores: BoardCorretor[];
  leads: BoardLead[];
};

export function encodeLead(l: BoardLead): LeadWire {
  return [
    l.id,
    l.nome,
    l.telefone,
    l.email,
    l.imovel,
    Number(l.valor) || 0,
    STAGE_IDS.indexOf(l.stage),
    l.corretor_id,
    l.origem,
    l.observacoes,
    l.ultima_interacao,
    l.c2s_contact_id,
    l.created_at,
    l.data_c2s,
    Number(l.entrada) || 0,
    l.finalidade,
    l.estagio_imovel,
    l.documentacao_ok ? 1 : 0,
    l.visita_em,
    l.visita_realizada ? 1 : 0,
    l.visita_status,
    l.visita_motivo,
    l.visita_projeto,
    l.stage_since,
    l.agenda_record ? 1 : 0,
    l.encontrado_c2s ? 1 : 0,
    l.corretor_agenda_nome ?? null,
  ];
}

export function decodeLead(w: LeadWire): BoardLead {
  return {
    id: w[0] as string,
    nome: w[1] as string,
    telefone: (w[2] as string) ?? null,
    email: (w[3] as string) ?? null,
    imovel: (w[4] as string) ?? null,
    valor: (w[5] as number) ?? 0,
    stage: (STAGE_IDS[w[6] as number] ?? "novo") as StageId,
    corretor_id: (w[7] as string) ?? null,
    origem: (w[8] as string) ?? null,
    observacoes: (w[9] as string) ?? null,
    ultima_interacao: (w[10] as string) ?? null,
    c2s_contact_id: (w[11] as string) ?? null,
    created_at: (w[12] as string) ?? null,
    data_c2s: (w[13] as string) ?? null,
    entrada: (w[14] as number) ?? 0,
    finalidade: (w[15] as BoardLead["finalidade"]) ?? null,
    estagio_imovel: (w[16] as BoardLead["estagio_imovel"]) ?? null,
    documentacao_ok: Boolean(w[17]),
    visita_em: (w[18] as string) ?? null,
    visita_realizada: Boolean(w[19]),
    visita_status: (w[20] as BoardLead["visita_status"]) ?? null,
    visita_motivo: (w[21] as string) ?? null,
    visita_projeto: (w[22] as string) ?? null,
    stage_since: (w[23] as string) ?? null,
    agenda_record: Boolean(w[24]),
    encontrado_c2s: Boolean(w[25]),
    corretor_agenda_nome: (w[26] as string) ?? null,
  };
}

export function decodeBoard(b: BoardWire): BoardDecoded {
  return { ...b, leads: b.leads.map(decodeLead) };
}
