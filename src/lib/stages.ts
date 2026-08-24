export const STAGES = [
  { id: "novo", label: "Lead novo", hint: "Recebido do C2S", color: "var(--stage-novo)" },
  { id: "atendimento", label: "Em atendimento", hint: "Lead respondeu", color: "var(--stage-atendimento)" },
  { id: "negociacao", label: "Negociação", hint: "Proposta e valores", color: "var(--stage-negociacao)" },
  { id: "documentacao", label: "Documentação", hint: "Coleta de documentos", color: "var(--stage-documentacao)" },
  { id: "fechamento", label: "Fechamento", hint: "Documentos aprovados", color: "var(--stage-fechamento)" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const STAGE_IDS = STAGES.map((s) => s.id) as StageId[];

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
