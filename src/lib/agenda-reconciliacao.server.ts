/**
 * Reconciliação diária: compara os agendamentos que existem hoje na Agenda
 * com os registros espelhados que alimentam a coluna "Agendado" do funil,
 * quebrando por data e por corretor.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchAgendamentos, normalizarNome } from "./agenda.server";

export type ReconLinha = {
  data: string; // AAAA-MM-DD (America/Sao_Paulo)
  corretor: string;
  agendaTotal: number;
  funilTotal: number;
  diferenca: number;
  semCorretorNoCrm: number;
  semVinculoC2s: number;
  causas: string[];
};

export type ReconResultado = {
  geradoEm: string;
  desde: string;
  dias: number;
  agendaTotal: number;
  funilTotal: number;
  faltandoNoFunil: number;
  sobrandoNoFunil: number;
  linhas: ReconLinha[];
  datas: Array<{ data: string; agendaTotal: number; funilTotal: number; diferenca: number }>;
};

const SEM_CORRETOR = "Sem corretor na agenda";

/** Data (AAAA-MM-DD) no fuso de operação da Agenda. */
function diaSaoPaulo(iso: string | null): string {
  if (!iso) return "sem-data";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "sem-data";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

type Acc = {
  data: string;
  corretor: string;
  agendaTotal: number;
  funilTotal: number;
  semCorretorNoCrm: number;
  semVinculoC2s: number;
};

export async function reconciliarAgenda(dias: number): Promise<ReconResultado> {
  const desdeMs = Date.now() - dias * 24 * 60 * 60 * 1000;
  const desde = new Date(desdeMs).toISOString();

  const agendamentos = await fetchAgendamentos();

  // Espelho que alimenta a coluna "Agendado" (paginado).
  type Espelho = {
    id: string;
    corretor_nome: string | null;
    corretor_id: string | null;
    encontrado_c2s: boolean;
    agenda_criado_em: string | null;
    created_at: string;
  };
  const espelho: Espelho[] = [];
  for (let inicio = 0; ; inicio += 1000) {
    const { data, error } = await supabaseAdmin
      .from("agenda_appointments")
      .select("id, corretor_nome, corretor_id, encontrado_c2s, agenda_criado_em, created_at")
      .order("id", { ascending: true })
      .range(inicio, inicio + 999);
    if (error) throw new Error(error.message);
    const pagina = (data ?? []) as Espelho[];
    espelho.push(...pagina);
    if (pagina.length < 1000) break;
  }

  const chaves = new Map<string, Acc>();
  const nomeExibicao = new Map<string, string>();
  const pegar = (data: string, corretorBruto: string | null): Acc => {
    const nome = (corretorBruto ?? "").trim() || SEM_CORRETOR;
    const norm = normalizarNome(nome) || SEM_CORRETOR;
    if (!nomeExibicao.has(norm)) nomeExibicao.set(norm, nome);
    const chave = `${data}|${norm}`;
    let acc = chaves.get(chave);
    if (!acc) {
      acc = {
        data,
        corretor: nomeExibicao.get(norm) ?? nome,
        agendaTotal: 0,
        funilTotal: 0,
        semCorretorNoCrm: 0,
        semVinculoC2s: 0,
      };
      chaves.set(chave, acc);
    }
    return acc;
  };

  const dentroDoPeriodo = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && t >= desdeMs;
  };

  const idsAgenda = new Set<string>();
  for (const ag of agendamentos) {
    const referencia = ag.criado_em ?? ag.visita_em;
    if (!dentroDoPeriodo(referencia)) continue;
    idsAgenda.add(ag.id);
    pegar(diaSaoPaulo(referencia), ag.corretor_nome).agendaTotal += 1;
  }

  for (const linha of espelho) {
    const referencia = linha.agenda_criado_em ?? linha.created_at;
    if (!dentroDoPeriodo(referencia)) continue;
    const acc = pegar(diaSaoPaulo(referencia), linha.corretor_nome);
    acc.funilTotal += 1;
    if (!linha.corretor_id) acc.semCorretorNoCrm += 1;
    if (!linha.encontrado_c2s) acc.semVinculoC2s += 1;
  }

  const linhas: ReconLinha[] = [...chaves.values()]
    .map((a) => {
      const diferenca = a.funilTotal - a.agendaTotal;
      const causas: string[] = [];
      if (diferenca < 0)
        causas.push(
          `${Math.abs(diferenca)} agendamento(s) da Agenda ainda não espelhado(s) — rode a sincronização da agenda.`,
        );
      if (diferenca > 0)
        causas.push(
          `${diferenca} registro(s) no funil sem correspondente atual na Agenda — provavelmente excluído(s) lá.`,
        );
      if (a.semCorretorNoCrm > 0)
        causas.push(
          `${a.semCorretorNoCrm} registro(s) com corretor não reconhecido no CRM — cadastre o mesmo nome/apelido em Equipe.`,
        );
      if (a.semVinculoC2s > 0)
        causas.push(`${a.semVinculoC2s} contato(s) sem vínculo com o C2S (nome/telefone não bateram).`);
      if (causas.length === 0) causas.push("Sem divergências.");
      return { ...a, diferenca, causas };
    })
    .sort((a, b) => (a.data === b.data ? a.corretor.localeCompare(b.corretor) : b.data.localeCompare(a.data)));

  const porData = new Map<string, { data: string; agendaTotal: number; funilTotal: number; diferenca: number }>();
  for (const l of linhas) {
    const atual = porData.get(l.data) ?? { data: l.data, agendaTotal: 0, funilTotal: 0, diferenca: 0 };
    atual.agendaTotal += l.agendaTotal;
    atual.funilTotal += l.funilTotal;
    atual.diferenca = atual.funilTotal - atual.agendaTotal;
    porData.set(l.data, atual);
  }

  const agendaTotal = linhas.reduce((s, l) => s + l.agendaTotal, 0);
  const funilTotal = linhas.reduce((s, l) => s + l.funilTotal, 0);

  return {
    geradoEm: new Date().toISOString(),
    desde,
    dias,
    agendaTotal,
    funilTotal,
    faltandoNoFunil: linhas.reduce((s, l) => s + Math.max(0, l.agendaTotal - l.funilTotal), 0),
    sobrandoNoFunil: linhas.reduce((s, l) => s + Math.max(0, l.funilTotal - l.agendaTotal), 0),
    linhas,
    datas: [...porData.values()].sort((a, b) => b.data.localeCompare(a.data)),
  };
}
