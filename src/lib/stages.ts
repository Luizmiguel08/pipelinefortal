export const STAGES = [
  { id: "novo", label: "Lead novo", hint: "Responder em até 5 min", color: "var(--stage-novo)" },
  { id: "atendimento", label: "Em atendimento", hint: "Avanço em até 1 dia", color: "var(--stage-atendimento)" },
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
