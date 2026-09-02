import { chaveCliente } from "@/lib/board-dedupe";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadCard } from "@/components/crm/LeadCard";
import { LeadDialog, type LeadFormValues } from "@/components/crm/LeadDialog";
import { getBoard, moveLead, saveLead, salvarLeadAgenda, type Board, type BoardLead } from "@/lib/crm.functions";
import { ETAPAS_AGENDA, MENSAGEM_AGENDA, MENSAGEM_TRAVA, STAGES, alertaSLA, formatBRL, formatCompactBRL, podeMoverPara, resolverEtapa, type StageId } from "@/lib/stages";
import { useDragAutoscroll } from "@/hooks/use-drag-autoscroll";

// Quantos cards cada coluna renderiza por vez (o funil tem milhares de leads).
const PAGINA_COLUNA = 25;

// Exporta os contatos de uma coluna em CSV (nome, telefone, corretor, valor).
function exportarColuna(
  stage: { id: StageId; label: string },
  leadsColuna: BoardLead[],
  nomePorCorretor: Map<string, string>,
) {
  const telefones = leadsColuna.filter((l) => l.telefone?.trim());
  if (telefones.length === 0) {
    toast.info(`A coluna ${stage.label} não tem contatos com telefone.`);
    return;
  }
  const linhas = [
    "nome;telefone;corretor;valor",
    ...telefones.map((l) => {
      const tel = l.telefone!.replace(/\D/g, "");
      const corretor = l.corretor_id ? (nomePorCorretor.get(l.corretor_id) ?? "") : (l.corretor_agenda_nome ?? "");
      const nome = `"${l.nome.replace(/"/g, '""')}"`;
      return `${nome};${tel};"${corretor.replace(/"/g, '""')}";${l.valor.toFixed(2)}`;
    }),
  ];
  const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fortal-${stage.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`${telefones.length} números exportados da coluna ${stage.label}.`);
}

// Recorte padrão do funil: agosto/2026 em diante.
const INICIO_PADRAO = "2026-08-01";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Funil de Leads | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Kanban de leads por corretor com totais em R$ por etapa, sincronizado com o C2S - Gestão de Contatos.",
      },
      { property: "og:title", content: "Funil de Leads | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Acompanhe leads novos, atendimento, negociação, documentação e fechamento de cada corretor.",
      },
    ],
  }),
  component: PipelinePage,
});

function FunnelSummaryCard({
  total,
  colunas,
}: {
  total: number;
  colunas: Record<StageId, BoardLead[]>;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total de leads</p>
      <p className="text-2xl font-bold">{total}</p>
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {STAGES.map((s) => {
          const count = colunas[s.id]?.length ?? 0;
          if (count === 0) return null;
          return (
            <span key={s.id} className="rounded-full bg-muted px-2 py-0.5">
              {s.label}: {count}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function PipelinePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchBoard = useServerFn(getBoard);
  const move = useServerFn(moveLead);
  const persist = useServerFn(saveLead);
  const persistAgenda = useServerFn(salvarLeadAgenda);

  const [filtrosAbertos, setFiltrosAbertos] = useState(true);

  const { data, isLoading, isError, error: queryError } = useQuery({
    queryKey: ["board"],
    // O tempo real cobre a tabela de leads; a agenda chega pela recarga periódica.
    queryFn: () => fetchBoard(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
    retry: 2,
  });

  // Tempo real: aplicamos as mudanças direto no cache, em lotes, sem recarregar o funil.
  useEffect(() => {
    const normalizar = (r: Record<string, unknown>): BoardLead => ({
      id: String(r['id']),
      nome: String(r['nome'] ?? ""),
      telefone: (r['telefone'] as string) ?? null,
      email: (r['email'] as string) ?? null,
      imovel: (r['imovel'] as string) ?? null,
      valor: Number(r['valor'] ?? 0),
      stage: r['stage'] as StageId,
      corretor_id: (r['corretor_id'] as string) ?? null,
      origem: (r['origem'] as string) ?? null,
      observacoes: (r['observacoes'] as string) ?? null,
      ultima_interacao: (r['ultima_interacao'] as string) ?? null,
      c2s_contact_id: (r['c2s_contact_id'] as string) ?? null,
      created_at: (r['created_at'] as string) ?? null,
      data_c2s: (r['data_c2s'] as string) ?? null,
      entrada: Number(r['entrada'] ?? 0),
      finalidade: (r['finalidade'] as BoardLead["finalidade"]) ?? null,
      estagio_imovel: (r['estagio_imovel'] as BoardLead["estagio_imovel"]) ?? null,
      documentacao_ok: Boolean(r['documentacao_ok']),
      visita_em: (r['visita_em'] as string) ?? null,
      visita_realizada: Boolean(r['visita_realizada']),
      visita_status: (r['visita_status'] as BoardLead["visita_status"]) ?? null,
      visita_motivo: (r['visita_motivo'] as string) ?? null,
      visita_projeto: (r['visita_projeto'] as string) ?? null,
      stage_since: (r['stage_since'] as string) ?? null,
      agenda_record: Boolean(r['agenda_record']),
      encontrado_c2s: Boolean(r['encontrado_c2s']),
      corretor_agenda_nome: (r['corretor_agenda_nome'] as string) ?? null,
    });

    // Durante uma sincronização grande chegam centenas de eventos por segundo:
    // acumulamos e aplicamos em blocos para a tela não travar.
    const pendentes = new Map<string, BoardLead | null>();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const aplicar = () => {
      timer = null;
      if (pendentes.size === 0) return;
      const lote = new Map(pendentes);
      pendentes.clear();
      queryClient.setQueryData<Board>(["board"], (old) => {
        if (!old) return old;
        const removidos = new Set<string>();
        const atualizados = new Map<string, BoardLead>();
        for (const [id, lead] of lote) {
          if (lead === null) removidos.add(id);
          else atualizados.set(id, lead);
        }
        // Um cliente aparece em uma única coluna: se já existe card da Agenda do mesmo
        // cliente (por vínculo ou por telefone/nome), o registro do C2S não volta pelo tempo real.
        const cardsAgenda = old.leads.filter((l) => l.agenda_record);
        const comAgenda = new Set(
          cardsAgenda.filter((l) => l.agenda_lead_id).map((l) => l.agenda_lead_id as string),
        );
        const chavesAgenda = new Set(cardsAgenda.map((l) => chaveCliente(l)));
        for (const [id, lead] of atualizados) {
          if (comAgenda.has(id) || chavesAgenda.has(chaveCliente(lead))) atualizados.delete(id);
        }
        const leads = old.leads
          .filter(
            (l) =>
              !removidos.has(l.id) &&
              !(!l.agenda_record && (comAgenda.has(l.id) || chavesAgenda.has(chaveCliente(l)))),
          )

          .map((l) => {
            const novo = atualizados.get(l.id);
            if (!novo) return l;
            atualizados.delete(l.id);
            return { ...l, ...novo };
          });
        const novos = Array.from(atualizados.values());
        return { ...old, leads: novos.length ? [...novos, ...leads] : leads };

      });
    };

    const agendar = () => {
      if (timer) return;
      timer = setTimeout(aplicar, 400);
    };

    const channel = supabase
      .channel("leads-tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (payload) => {
        if (payload.eventType === "DELETE") {
          const id = (payload.old as { id?: string })?.id;
          if (id) pendentes.set(id, null);
        } else {
          const novo = normalizar(payload.new as Record<string, unknown>);
          pendentes.set(novo.id, novo);
        }
        agendar();
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // A sincronização com o C2S roda no servidor a cada minuto (rotina automática),
  // por isso o navegador de cada corretor/gestor não dispara mais sync sozinho.

  // Foco atual: leads de agosto/2026 em diante. Datas anteriores só via filtro manual.


  const [corretorFiltro, setCorretorFiltro] = useState<string>("todos");
  const [dataInicio, setDataInicio] = useState(INICIO_PADRAO);
  const [dataFim, setDataFim] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [dragging, setDragging] = useState<BoardLead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [leadAtual, setLeadAtual] = useState<BoardLead | null>(null);
  const [visiveis, setVisiveis] = useState<Partial<Record<StageId, number>>>({});
  // Relógio para recalcular os alertas de prazo sem depender de novas buscas.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Busca com debounce: digitar não re-renderiza milhares de cards a cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setBusca(buscaInput), 250);
    return () => clearTimeout(id);
  }, [buscaInput]);

  // Auto-scroll horizontal durante drag
  const { containerRef, containerProps, stopScroll } = useDragAutoscroll();

  const moveMutation = useMutation({
    mutationFn: (vars: { id: string; stage: StageId }) => move({ data: vars }),
    // Atualização otimista: o card muda de coluna na hora, sem esperar o servidor.
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["board"] });
      const anterior = queryClient.getQueryData<Board>(["board"]);
      queryClient.setQueryData<Board>(["board"], (old) =>
        old
          ? { ...old, leads: old.leads.map((l) => (l.id === vars.id ? { ...l, stage: vars.stage } : l)) }
          : old,
      );
      return { anterior };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(["board"], ctx.anterior);
      toast.error(e.message);
    },
    onSuccess: (_r, vars) => {
      // Cards da Agenda usam ID sintético (agenda:<id>:<etapa>). A etapa real fica no lead
      // vinculado, então precisamos recarregar o funil para refletir a mudança no card correto.
      const board = queryClient.getQueryData<Board>(["board"]);
      if (board?.leads.some((l) => l.agenda_lead_id === vars.id)) {
        queryClient.invalidateQueries({ queryKey: ["board"] });
      }
    },
  });


  const saveMutation = useMutation({
    mutationFn: (values: LeadFormValues) =>
      values.agenda_appointment_id
        ? persistAgenda({
            data: {
              agenda_appointment_id: values.agenda_appointment_id,
              nome: values.nome,
              telefone: values.telefone,
              email: values.email,
              imovel: values.imovel,
              valor: values.valor,
              observacoes: values.observacoes,
              entrada: values.entrada,
              finalidade: values.finalidade,
              estagio_imovel: values.estagio_imovel,
              documentacao_ok: values.documentacao_ok,
            },
          })
        : persist({
        data: {
          id: values.id,
          nome: values.nome,
          telefone: values.telefone,
          email: values.email,
          imovel: values.imovel,
          valor: values.valor,
          stage: values.stage,
          corretor_id: values.corretor_id,
          observacoes: values.observacoes,
          entrada: values.entrada,
          finalidade: values.finalidade,
          estagio_imovel: values.estagio_imovel,
          documentacao_ok: values.documentacao_ok,
          visita_em: values.visita_em,
          visita_realizada: values.visita_realizada,
          forcar_stage: values.forcar_stage,
          preservar_stage: values.preservar_stage,
        },
      }),
    // Atualização otimista: o card muda de coluna na hora (ex.: documentação recebida).
    onMutate: async (values) => {
      setDialogOpen(false);
      if (!values.id || values.agenda_appointment_id) return { anterior: undefined };
      await queryClient.cancelQueries({ queryKey: ["board"] });
      const anterior = queryClient.getQueryData<Board>(["board"]);
      if (values.preservar_stage) return { anterior: undefined };
      const stageFinal: StageId = values.forcar_stage
        ? values.stage
        : resolverEtapa(values, values.stage);
      queryClient.setQueryData<Board>(["board"], (old) =>
        old
          ? {
              ...old,
              leads: old.leads.map((l) =>
                l.id === values.id
                  ? {
                      ...l,
                      nome: values.nome,
                      telefone: values.telefone ?? null,
                      email: values.email ?? null,
                      imovel: values.imovel ?? null,
                      valor: values.valor,
                      corretor_id: values.corretor_id,
                      observacoes: values.observacoes ?? null,
                      entrada: values.entrada ?? 0,
                      finalidade: values.finalidade ?? null,
                      estagio_imovel: values.estagio_imovel ?? null,
                      documentacao_ok: Boolean(values.documentacao_ok),
                      visita_em: values.visita_em ?? null,
                      visita_realizada: Boolean(values.visita_realizada),
                      stage: stageFinal,
                      stage_since: l.stage === stageFinal ? l.stage_since : new Date().toISOString(),
                    }
                  : l,
              ),
            }
          : old,
      );
      return { anterior };
    },
    onSuccess: (_r, values) => {
      toast.success("Lead salvo");
      // Só recarregamos o funil inteiro quando o lead é novo; edições já foram aplicadas localmente.
      if (!values.id || values.preservar_stage || values.agenda_appointment_id)
        queryClient.invalidateQueries({ queryKey: ["board"] });
    },
    onError: (e: Error, _values, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(["board"], ctx.anterior);
      toast.error(e.message);
    },
  });

  const corretores = data?.corretores ?? [];
  const nomePorCorretor = useMemo(
    () => new Map(corretores.map((c) => [c.id, c.nome])),
    [corretores],
  );

  const meuCorretorId = data?.meuCorretorId ?? null;

  const leadsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const inicioMs = dataInicio ? new Date(`${dataInicio}T00:00:00`).getTime() : null;
    const fimMs = dataFim ? new Date(`${dataFim}T23:59:59.999`).getTime() : null;
    return (data?.leads ?? []).filter((l) => {
      if (corretorFiltro === "meus" && l.corretor_id !== meuCorretorId) return false;
      if (corretorFiltro !== "todos" && corretorFiltro !== "meus" && l.corretor_id !== corretorFiltro)
        return false;
      if (inicioMs !== null || fimMs !== null) {
        // O período sempre representa a data de ENTRADA do lead, em qualquer coluna.
        // Assim um lead entrou hoje e movido para outra etapa continua contando uma única vez.
        const dataRef = l.data_c2s ?? l.created_at;
        const ref = dataRef ? new Date(dataRef).getTime() : null;
        // Se o lead não tem data de referência, incluímos mesmo assim para não ocultar
        // contatos que ainda não foram sincronizados com uma data válida.
        if (ref !== null && !Number.isNaN(ref)) {
          if (inicioMs !== null && ref < inicioMs) return false;
          if (fimMs !== null && ref > fimMs) return false;
        }
      }

      if (!termo) return true;
      return `${l.nome} ${l.imovel ?? ""} ${l.email ?? ""}`.toLowerCase().includes(termo);
    });
  }, [data?.leads, corretorFiltro, busca, meuCorretorId, dataInicio, dataFim]);

  // Agrupamos uma única vez por etapa em vez de varrer a lista inteira por coluna.
  const colunas = useMemo(() => {
    const mapa = Object.fromEntries(STAGES.map((s) => [s.id, [] as BoardLead[]])) as Record<StageId, BoardLead[]>;
    for (const lead of leadsFiltrados) mapa[lead.stage]?.push(lead);
    return mapa;
  }, [leadsFiltrados]);

  const totalGeral = leadsFiltrados.reduce((acc, l) => acc + l.valor, 0);
  const emAndamento = leadsFiltrados
    .filter((l) => l.stage !== "fechamento")
    .reduce((acc, l) => acc + l.valor, 0);

  const abrirLead = useCallback((l: BoardLead) => {
    if (l.agenda_record) {
      // Cards da Agenda sempre abrem para preencher indicadores — inclusive contatos
      // sem vínculo no C2S (nesse caso o lead é criado e amarrado ao agendamento).
      setLeadAtual({ ...l, id: l.agenda_lead_id ?? "" });
      setDialogOpen(true);
      return;
    }
    setLeadAtual(l);
    setDialogOpen(true);
  }, []);

  function handleDrop(stage: StageId) {
    stopScroll();
    if (!dragging || dragging.stage === stage) return setDragging(null);
    if (ETAPAS_AGENDA.includes(stage)) {
      toast.error(MENSAGEM_AGENDA);
      return setDragging(null);
    }
    // Cards da Agenda podem avançar manualmente para qualquer etapa do funil;
    // apenas as colunas Agendado e Visita realizada continuam alimentadas pela Agenda.
    if (dragging.agenda_record && !dragging.agenda_lead_id) {
      toast.error("Preencha as informações do cliente antes de avançar.");
      abrirLead(dragging);
      return setDragging(null);
    }
    // Trava: sem indicador preenchido o lead não sai das colunas frias.
    if (!podeMoverPara(stage, dragging)) {
      toast.error(MENSAGEM_TRAVA);
      abrirLead(dragging);
      return setDragging(null);
    }
    const id = dragging.agenda_record ? (dragging.agenda_lead_id ?? dragging.id) : dragging.id;
    moveMutation.mutate({ id, stage });
    setDragging(null);
  }

  function handleDragEnd() {
    stopScroll();
    setDragging(null);
  }


  async function sair() {
    await supabase.auth.signOut();
    queryClient.clear();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        {/* Linha 1: marca + ações */}
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-5 py-3">
          <div className="mr-auto flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight text-foreground">Fortal Pipeline</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFiltrosAbertos((v) => !v)}
              aria-expanded={filtrosAbertos}
            >
              {filtrosAbertos ? "Ocultar filtros" : "Mostrar filtros"}
            </Button>

            <Button
              onClick={() => {
                setLeadAtual(null);
                setDialogOpen(true);
              }}
            >
              Novo lead
            </Button>
            {data?.isGestor && (
              <Button variant="secondary" asChild>
                <Link to="/integracao">Integração C2S</Link>
              </Button>
            )}
            {data?.isGestor && (
              <Button variant="secondary" asChild>
                <Link to="/auditoria">Auditoria</Link>
              </Button>
            )}
            {data?.isGestor && (
              <Button variant="secondary" asChild>
                <Link to="/reconciliacao-agenda">Reconciliação agenda</Link>
              </Button>
            )}

            {data?.isGestor && (
              <Button variant="secondary" asChild>
                <Link to="/equipe">Equipe</Link>
              </Button>
            )}

            <Button variant="secondary" asChild>
              <Link to="/atividade">Atividade</Link>
            </Button>


            <Button variant="ghost" onClick={sair}>
              Sair
            </Button>
          </div>
        </div>

        {/* Linha 2: filtros recolhíveis */}
        {filtrosAbertos && (
          <div className="border-t border-border">
            <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-5 py-3">
              <Input
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                placeholder="Buscar cliente ou imóvel"
                className="h-9 w-64"
              />
              {data?.isGestor && (
                <select
                  value={corretorFiltro}
                  onChange={(e) => setCorretorFiltro(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="todos">Todos os corretores</option>
                  {meuCorretorId && <option value="meus">Somente meus leads</option>}
                  {corretores.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            )}

            <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Período</span>
                <Input
                  type="date"
                  aria-label="Data inicial"
                  value={dataInicio}
                  max={dataFim || undefined}
                  onChange={(e) => setDataInicio(e.target.value)}
                  className="h-7 w-[132px] border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="date"
                  aria-label="Data final"
                  value={dataFim}
                  min={dataInicio || undefined}
                  onChange={(e) => setDataFim(e.target.value)}
                  className="h-7 w-[132px] border-0 px-1 text-xs shadow-none focus-visible:ring-0"
                />
                {(dataInicio !== INICIO_PADRAO || dataFim) && (
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setDataInicio(INICIO_PADRAO);
                      setDataFim("");
                    }}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-6">
        {isError && (
          <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/5 p-4">
            <p className="text-sm font-medium text-destructive">Falha ao carregar os leads</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {(queryError as Error)?.message || "Erro desconhecido. Tente recarregar a página."}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["board"] })}
            >
              Tentar novamente
            </Button>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-3">
          <FunnelSummaryCard
            total={leadsFiltrados.length}
            colunas={colunas}
          />
          <SummaryCard label="Em andamento" value={formatBRL(emAndamento)} hint="Exclui a coluna Fechamento" />
          <SummaryCard label="Volume total" value={formatBRL(totalGeral)} hint="Somatório de todas as colunas" />
        </section>

        {corretorFiltro === "todos" && data?.isGestor && corretores.length > 0 && (
          <section className="mt-4 flex flex-wrap gap-2">
            {corretores.map((c) => {
              const leadsDoCorretor = leadsFiltrados.filter((l) => l.corretor_id === c.id);
              const total = leadsDoCorretor.reduce((acc, l) => acc + l.valor, 0);
              return (
                <button
                  key={c.id}
                  onClick={() => setCorretorFiltro(c.id)}
                  className="rounded-full border border-border bg-surface px-3.5 py-1.5 text-xs transition-colors hover:border-primary/60"
                >
                  <span className="font-semibold">{c.nome}</span>
                  <span className="ml-2 text-muted-foreground">
                    {leadsDoCorretor.length} leads · {formatCompactBRL(total)}
                  </span>
                </button>
              );
            })}
          </section>
        )}

        {isLoading ? (
          <p className="mt-10 text-sm text-muted-foreground">Carregando pipeline...</p>
        ) : (
          <div
            ref={containerRef}
            {...containerProps}
            onDragOver={(e) => {
              e.preventDefault();
              containerProps.onDragOver(e);
            }}
            className="scroll-slim mt-5 flex gap-4 overflow-x-auto pb-6"
          >
            {STAGES.map((stage) => {
              const leadsColuna = colunas[stage.id];
              const totalColuna = leadsColuna.reduce((acc, l) => acc + l.valor, 0);
              const emRisco = leadsColuna.filter(
                (l) => alertaSLA(l.stage, l.stage_since, l.ultima_interacao, agora)?.alerta,
              ).length;
              const limite = visiveis[stage.id] ?? PAGINA_COLUNA;
              const mostrados = leadsColuna.slice(0, limite);
              return (
                <section
                  key={stage.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(stage.id)}
                  className="panel flex w-[280px] shrink-0 flex-col p-3"
                >
                  <div
                    className="mb-3 rounded-lg border border-border bg-surface-2 px-3 py-2 text-center"
                    style={{ borderTop: `3px solid ${stage.color}` }}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Acumulado</p>
                    <p className="text-lg font-semibold leading-tight" style={{ color: stage.color }}>
                      {formatBRL(totalColuna)}
                    </p>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold">{stage.label}</h2>
                      <p className="text-[11px] text-muted-foreground">{stage.hint}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                        {leadsColuna.length}
                      </span>
                      {emRisco > 0 && (
                        <span
                          className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive"
                          title="Leads com prazo da etapa estourando"
                        >
                          {emRisco} em risco
                        </span>
                      )}
                    </div>
                  </div>


                  <div className="scroll-slim mt-3 flex max-h-[62vh] flex-col gap-2 overflow-y-auto pr-0.5">
                    {mostrados.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        corretorNome={lead.corretor_id ? nomePorCorretor.get(lead.corretor_id) : undefined}
                        showCorretor={corretorFiltro === "todos"}
                        agora={agora}
                        onOpen={abrirLead}
                        onDragStart={setDragging}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                    {leadsColuna.length > limite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 w-full text-xs"
                        onClick={() =>
                          setVisiveis((v) => ({ ...v, [stage.id]: limite + PAGINA_COLUNA }))
                        }
                      >
                        Mostrar mais ({leadsColuna.length - limite} restantes)
                      </Button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <LeadDialog
        open={dialogOpen}
        lead={leadAtual}
        corretores={corretores}
        defaultCorretorId={meuCorretorId}
        saving={saveMutation.isPending}
        onOpenChange={setDialogOpen}
        onSave={(values) => saveMutation.mutate(values)}
      />
    </div>
  );
}
