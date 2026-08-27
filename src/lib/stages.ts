export const STAGES = [
  { id: "novo", label: "Lead novo", hint: "Responder em até 5 min", color: "var(--stage-novo)" },
  { id: "atendimento", label: "Em atendimento", hint: "Avanço em até 1 dia", color: "var(--stage-atendimento)" },
  { id: "nao_respondeu", label: "Não Respondeu", hint: "Sem interação após 5 min no Lead novo", color: "var(--stage-nao-respondeu)" },
  { id: "visita", label: "Agendado", hint: "Agendamentos confirmados na Agenda", color: "var(--stage-visita)" },
  { id: "visita_realizada", label: "Visita realizada", hint: "Cliente compareceu à visita", color: "var(--stage-visita-realizada)" },
  { id: "dia1", label: "Dia 1", hint: "Sem retorno há 1 dia", color: "var(--stage-dia1)" },
  { id: "dia2", label: "Dia 2", hint: "Sem retorno há 2 dias", color: "var(--stage-dia2)" },
  { id: "dia3", label: "Dia 3", hint: "Sem retorno há 3 dias", color: "var(--stage-dia3)" },
  { id: "lista_fria", label: "Lista fria", hint: "Sem interação após o dia 3", color: "var(--stage-fria)" },
  { id: "negociacao", label: "Negociação", hint: "Proposta e valores", color: "var(--stage-negociacao)" },
  { id: "documentacao", label: "Documentação", hint: "Coleta de documentos", color: "var(--stage-documentacao)" },
  { id: "fechamento", label: "Fechamento", hint: "Documentos aprovados", color: "var(--stage-fechamento)" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];

// Tempo máximo (ms) que o lead pode ficar parado em cada etapa antes do escalonamento.
const LIMITE_ETAPA: Partial<Record<StageId, number>> = {
  novo: 5 * 60_000,
  nao_respondeu: 24 * 3600_000,
  atendimento: 24 * 3600_000,
  dia1: 24 * 3600_000,
  dia2: 24 * 3600_000,
  dia3: 24 * 3600_000,
};

/** Alerta quando o lead já passou de 80% do tempo permitido na etapa. */
export function alertaSLA(
  stage: StageId,
  stageSince: string | null,
  ultimaInteracao: string | null,
  agora: number,
): { alerta: boolean; restanteMs: number } | null {
  const limite = LIMITE_ETAPA[stage];
  if (!limite || !stageSince) return null;
  const base = Math.max(
    new Date(stageSince).getTime(),
    ultimaInteracao ? new Date(ultimaInteracao).getTime() : 0,
  );
  if (Number.isNaN(base)) return null;
  const restanteMs = base + limite - agora;
  return { alerta: restanteMs <= limite * 0.2, restanteMs };
}

export function formatRestante(ms: number) {
  if (ms <= 0) return "prazo vencido";
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `resta ${min} min`;
  const horas = Math.ceil(min / 60);
  return `resta ${horas}h`;
}

export function stageLabel(id: StageId) {
  return STAGES.find((s) => s.id === id)?.label ?? id;
}

export function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatCompactBRL(value: number) {
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  return formatBRL(value);
}

export function relativeTime(iso: string | null) {
  if (!iso) return "sem interação";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.round(hours / 24);
  return `há ${days}d`;
}

export type Qualificacao = {
  valor?: number | null | undefined;
  entrada?: number | null | undefined;
  finalidade?: string | null | undefined;
  estagio_imovel?: string | null | undefined;
  documentacao_ok?: boolean | null | undefined;
  visita_em?: string | null | undefined;
  visita_realizada?: boolean | null | undefined;
};

/** Etapas frias: o lead ainda não teve tratativa registrada. */
export const ETAPAS_FRIAS: StageId[] = ["novo", "dia1", "dia2", "dia3", "lista_fria"];

/** Indicadores preenchidos = o corretor já qualificou o lead. */
export function indicadoresPreenchidos(q: Qualificacao) {
  return (
    Number(q.valor) > 0 ||
    Number(q.entrada) > 0 ||
    !!q.finalidade ||
    !!q.estagio_imovel ||
    !!q.documentacao_ok ||
    !!q.visita_em ||
    !!q.visita_realizada
  );
}

/**
 * Trava do funil: só é possível tirar o lead das etapas frias quando ao menos um
 * indicador da tratativa foi preenchido (valor, entrada, finalidade, imóvel,
 * visita ou documentação).
 */
export function podeMoverPara(stage: StageId, q: Qualificacao) {
  if (ETAPAS_AGENDA.includes(stage)) return false;
  if (ETAPAS_FRIAS.includes(stage)) return true;
  return indicadoresPreenchidos(q);
}

/** Etapas espelhadas do projeto Agenda: não podem ser preenchidas manualmente. */
export const ETAPAS_AGENDA: StageId[] = ["visita", "visita_realizada"];

export const MENSAGEM_AGENDA =
  "As colunas Agendado e Visita realizada são espelhadas do projeto Agenda. Faça o agendamento lá e o lead aparece aqui automaticamente.";

export const MENSAGEM_TRAVA =
  "Preencha ao menos um indicador (valor, entrada, finalidade, pronto/planta, visita ou documentação) para avançar o lead.";

/**
 * Etapa resultante ao salvar o lead:
 * - documentação marcada -> Documentação (exceto se já está em Fechamento)
 * - documentação desmarcada estando em Documentação -> Negociação
 * - qualquer indicador preenchido com o lead ainda parado em etapas frias -> Em atendimento
 */
export function resolverEtapa(q: Qualificacao, stage: StageId): StageId {
  if (q.documentacao_ok && stage !== "documentacao" && stage !== "fechamento") return "documentacao";
  if (!q.documentacao_ok && stage === "documentacao") return "negociacao";
  const frias = ETAPAS_FRIAS;
  // Agendado / Visita realizada são espelhados da Agenda: nunca resolvidos manualmente.
  if (indicadoresPreenchidos(q) && frias.includes(stage)) return "atendimento";
  return stage;
}

/** Monta o link wa.me a partir do telefone (aceita formatos variados, assume Brasil se faltar DDI). */
export function whatsappLink(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const numero = digitos.startsWith("55") && digitos.length > 11 ? digitos : `55${digitos}`;
  return `https://wa.me/${numero}`;
}
