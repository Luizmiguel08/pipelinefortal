/**
 * Tabela de preços por projeto (empreendimento).
 *
 * Regra: quando o lead chega do C2S / Agenda com o nome do projeto e o valor
 * está zerado, preenchemos automaticamente com o valor de tabela.
 * Valor digitado pelo corretor NUNCA é sobrescrito.
 */
export type RegraProjeto = {
  /** Rótulo exibido para o time. */
  projeto: string;
  /** Trechos (normalizados) que identificam o projeto no campo "imóvel". */
  padroes: string[];
  /** Casamento exato do nome inteiro, em vez de "contém". */
  exato?: boolean;
  valor: number;
};

export const TABELA_PROJETOS: RegraProjeto[] = [
  { projeto: "RMKT - Guilhermina", padroes: ["RMKT GUILHERMINA"], valor: 178_000 },
  { projeto: "RAJ Mendes", padroes: ["RAJ MENDES", "ON MENDES", "MENDES"], valor: 178_000 },
  { projeto: "RAJ Penha", padroes: ["RAJ PENHA", "ON PENHA", "PENHA"], valor: 159_000 },
  { projeto: "Raj Home", padroes: ["RAJ HOME"], valor: 136_000 },
  { projeto: "Guilhermina - SP", padroes: ["GUILHERMINA SP"], valor: 178_000 },
  {
    projeto: "Guilhermina - BR",
    padroes: ["GUILHERMINA BR", "RAJ GUILHERMINA", "GUILHERMINA"],
    valor: 178_000,
  },
  { projeto: "Vértice", padroes: ["VERTICE"], valor: 211_000 },
  { projeto: "Consolação", padroes: ["CONSOLACAO"], valor: 190_000 },
  { projeto: "Formulário R - II", padroes: ["FORMULARIO R II"], valor: 136_000 },
  // "RAJ" isolado: não pode capturar RAJ Penha / RAJ Guilhermina / Raj Home.
  { projeto: "RAJ", padroes: ["RAJ", "RAJ 1", "RAJ 2"], exato: true, valor: 136_000 },
];

/** Maiúsculas, sem acentos e sem pontuação, para comparar nomes de projeto. */
export function normalizarProjeto(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Valor de tabela do projeto informado, ou null quando não houver regra. */
export function valorDoProjeto(imovel: string | null | undefined): number | null {
  const alvo = normalizarProjeto(imovel);
  if (!alvo) return null;
  for (const regra of TABELA_PROJETOS) {
    const bate = regra.exato
      ? regra.padroes.some((p) => alvo === p)
      : regra.padroes.some((p) => alvo.includes(p));
    if (bate) return regra.valor;
  }
  return null;
}

/** Aplica a tabela apenas quando o valor atual está zerado. */
export function valorComTabela(
  imovel: string | null | undefined,
  valorAtual: number | null | undefined,
): number {
  const atual = Number(valorAtual) || 0;
  if (atual > 0) return atual;
  return valorDoProjeto(imovel) ?? 0;
}
