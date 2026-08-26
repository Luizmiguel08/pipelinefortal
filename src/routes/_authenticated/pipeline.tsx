import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadCard } from "@/components/crm/LeadCard";
import { LeadDialog, type LeadFormValues } from "@/components/crm/LeadDialog";
import {
  PAGINA_COLUNA,
  getBoard,
  getBoardCards,
  moveLead,
  saveLead,
  type Board,
  type BoardLead,
} from "@/lib/crm.functions";
import { ETAPAS_AGENDA, MENSAGEM_AGENDA, MENSAGEM_TRAVA, STAGES, formatBRL, formatCompactBRL, podeMoverPara, resolverEtapa, type StageId } from "@/lib/stages";
import { useDragAutoscroll } from "@/hooks/use-drag-autoscroll";

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

function PipelinePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchBoard = useServerFn(getBoard);
  const fetchCards = useServerFn(getBoardCards);
  const move = useServerFn(moveLead);
  const persist = useServerFn(saveLead);

  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [corretorFiltro, setCorretorFiltro] = useState<string>("todos");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [buscaInput, setBuscaInput] = useState("");
  const [busca, setBusca] = useState("");
  const [dragging, setDragging] = useState<BoardLead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [leadAtual, setLeadAtual] = useState<BoardLead | null>(null);
  const [extras, setExtras] = useState<Partial<Record<StageId, BoardLead[]>>>({});
  const [carregandoMais, setCarregandoMais] = useState<StageId | null>(null);

  const meuCorretorIdRef = useRef<string | null>(null);

  const filtros = useMemo(
    () => ({
      corretor:
        corretorFiltro === "meus" ? meuCorretorIdRef.current : corretorFiltro === "todos" ? null : corretorFiltro,
      inicio: dataInicio ? `${dataInicio}T00:00:00` : null,
      fim: dataFim ? `${dataFim}T23:59:59.999` : null,
      busca: busca || null,
    }),
    [corretorFiltro, dataInicio, dataFim, busca],
  );

  const chave = ["board", filtros.corretor, filtros.inicio, filtros.fim, filtros.busca] as const;

  const { data, isLoading } = useQuery<Board>({
    queryKey: chave,
    queryFn: () => fetchBoard({ data: filtros }),
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  meuCorretorIdRef.current = data?.meuCorretorId ?? null;

  // Ao trocar de filtro as páginas extras deixam de valer.
  useEffect(() => {
    setExtras({});
  }, [filtros.corretor, filtros.inicio, filtros.fim, filtros.busca]);

  // Tempo real: recarregamos o funil (agora leve) em lotes, sem travar a tela.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const agendar = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries({ queryKey: ["board"] });
      }, 1500);
    };
    const channel = supabase
      .channel("leads-tempo-real")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, agendar)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // Relógio para recalcular os alertas de prazo sem depender de novas buscas.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  // Busca com debounce: digitar não dispara uma consulta a cada tecla.
  useEffect(() => {
    const id = setTimeout(() => setBusca(buscaInput.trim()), 350);
    return () => clearTimeout(id);
  }, [buscaInput]);

  // Auto-scroll horizontal durante drag
  const { containerRef, containerProps, stopScroll } = useDragAutoscroll();

  // Aplica uma alteração de lead direto no cache (atualização otimista).
  const patchCache = useCallback(
    (id: string, mudanca: Partial<BoardLead> & { stage?: StageId }) => {
      queryClient.setQueryData<Board>(chave, (old) => {
        if (!old) return old;
        let atual: BoardLead | null = null;
        const colunas = {} as Record<StageId, BoardLead[]>;
        for (const [stage, lista] of Object.entries(old.colunas) as [StageId, BoardLead[]][]) {
          colunas[stage] = lista.filter((l) => {
            if (l.id !== id) return true;
            atual = l;
            return false;
          });
        }
        if (!atual) return old;
        const novo = { ...(atual as BoardLead), ...mudanca };
        colunas[novo.stage] = [novo, ...(colunas[novo.stage] ?? [])];
        const anteriorStage = (atual as BoardLead).stage;
        const resumo = old.resumo.map((r) => {
          if (r.stage === anteriorStage && anteriorStage !== novo.stage)
            return { ...r, total: Math.max(0, r.total - 1), soma: r.soma - (atual as BoardLead).valor };
          if (r.stage === novo.stage && anteriorStage !== novo.stage)
            return { ...r, total: r.total + 1, soma: r.soma + novo.valor };
          if (r.stage === novo.stage) return { ...r, soma: r.soma - (atual as BoardLead).valor + novo.valor };
          return r;
        });
        if (anteriorStage !== novo.stage && !resumo.some((r) => r.stage === novo.stage))
          resumo.push({ stage: novo.stage, total: 1, soma: novo.valor });
        return { ...old, colunas, resumo };
      });
      setExtras((prev) => {
        const copia: Partial<Record<StageId, BoardLead[]>> = {};
        for (const [stage, lista] of Object.entries(prev) as [StageId, BoardLead[]][])
          copia[stage] = lista.filter((l) => l.id !== id);
        return copia;
      });
    },
    [queryClient, chave],
  );

  const moveMutation = useMutation({
    mutationFn: (vars: { id: string; stage: StageId }) => move({ data: vars }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: chave });
      const anterior = queryClient.getQueryData<Board>(chave);
      patchCache(vars.id, { stage: vars.stage, stage_since: new Date().toISOString() });
      return { anterior };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(chave, ctx.anterior);
      toast.error(e.message);
    },
  });

  const saveMutation = useMutation({
    mutationFn: (values: LeadFormValues) =>
      persist({
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
        },
      }),
    onMutate: async (values) => {
      setDialogOpen(false);
      if (!values.id) return { anterior: undefined };
      await queryClient.cancelQueries({ queryKey: chave });
      const anterior = queryClient.getQueryData<Board>(chave);
      const stageFinal: StageId = values.forcar_stage ? values.stage : resolverEtapa(values, values.stage);
      patchCache(values.id, {
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
        stage_since: new Date().toISOString(),
      });
      return { anterior };
    },
    onSuccess: (_r, values) => {
      toast.success("Lead salvo");
      if (!values.id) queryClient.invalidateQueries({ queryKey: ["board"] });
    },
    onError: (e: Error, _values, ctx) => {
      if (ctx?.anterior) queryClient.setQueryData(chave, ctx.anterior);
      toast.error(e.message);
    },
  });

  const corretores = data?.corretores ?? [];
  const nomePorCorretor = useMemo(
    () => new Map(corretores.map((c) => [c.id, c.nome])),
    [corretores],
  );

  const meuCorretorId = data?.meuCorretorId ?? null;

  const resumoPorEtapa = useMemo(() => {
    const mapa = {} as Record<StageId, { total: number; soma: number }>;
    for (const stage of STAGES) mapa[stage.id] = { total: 0, soma: 0 };
    for (const r of data?.resumo ?? []) if (mapa[r.stage]) mapa[r.stage] = { total: r.total, soma: r.soma };
    return mapa;
  }, [data?.resumo]);

  const colunas = useMemo(() => {
    const mapa = {} as Record<StageId, BoardLead[]>;
    for (const stage of STAGES) {
      const base = data?.colunas?.[stage.id] ?? [];
      const extra = extras[stage.id] ?? [];
      mapa[stage.id] = extra.length ? [...base, ...extra] : base;
    }
    return mapa;
  }, [data?.colunas, extras]);

  const totalLeads = useMemo(
    () => STAGES.reduce((acc, s) => acc + (resumoPorEtapa[s.id]?.total ?? 0), 0),
    [resumoPorEtapa],
  );
  const totalGeral = useMemo(
    () => STAGES.reduce((acc, s) => acc + (resumoPorEtapa[s.id]?.soma ?? 0), 0),
    [resumoPorEtapa],
  );
  const emAndamento = useMemo(
    () =>
      STAGES.filter((s) => s.id !== "fechamento").reduce((acc, s) => acc + (resumoPorEtapa[s.id]?.soma ?? 0), 0),
    [resumoPorEtapa],
  );

  async function carregarMais(stage: StageId) {
    setCarregandoMais(stage);
    try {
      const novos = await fetchCards({
        data: { ...filtros, stage, offset: colunas[stage].length, limit: PAGINA_COLUNA },
      });
      setExtras((prev) => ({ ...prev, [stage]: [...(prev[stage] ?? []), ...novos] }));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCarregandoMais(null);
    }
  }

  const abrirLead = useCallback((l: BoardLead) => {
    if (l.agenda_record) {
      toast.info("Este registro é controlado pela Agenda e não pode ser editado aqui.");
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
    if (dragging.agenda_record) {
      toast.error("Agendamentos e visitas realizadas devem ser alterados no projeto Agenda.");
      return setDragging(null);
    }
    // Trava: sem indicador preenchido o lead não sai das colunas frias.
    if (!podeMoverPara(stage, dragging)) {
      toast.error(MENSAGEM_TRAVA);
      abrirLead(dragging);
      return setDragging(null);
    }
    moveMutation.mutate({ id: dragging.id, stage });
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
                {(dataInicio || dataFim) && (
                  <Button
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => {
                      setDataInicio("");
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
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                      {leadsColuna.length}
                    </span>
                  </div>

                  <div className="scroll-slim mt-3 flex max-h-[62vh] flex-col gap-2 overflow-y-auto pr-0.5">
                    {mostrados.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        corretorNome={lead.corretor_id ? nomePorCorretor.get(lead.corretor_id) : undefined}
                        showCorretor={corretorFiltro === "todos"}
                        agora={agora}
                        onDragStart={setDragging}
                        onDragEnd={handleDragEnd}
                        onOpen={abrirLead}
                      />
                    ))}
                    {leadsColuna.length > mostrados.length && (
                      <Button
                        variant="secondary"
                        className="h-8 text-xs"
                        onClick={() =>
                          setVisiveis((v) => ({ ...v, [stage.id]: (v[stage.id] ?? PAGINA_COLUNA) + PAGINA_COLUNA }))
                        }
                      >
                        Carregar mais ({leadsColuna.length - mostrados.length} restantes)
                      </Button>
                    )}
                    {leadsColuna.length === 0 && (
                      <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                        Arraste um lead para cá
                      </p>
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
        defaultCorretorId={corretorFiltro !== "todos" ? corretorFiltro : null}
        saving={saveMutation.isPending}
        onOpenChange={setDialogOpen}
        onSave={(values) => saveMutation.mutate(values)}
      />
    </div>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
}

function FunnelSummaryCard({
  total,
  colunas,
}: {
  total: number;
  colunas: Record<StageId, BoardLead[]>;
}) {
  return (
    <div className="panel p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Leads no funil</p>
      <p className="mt-1 text-2xl font-semibold">{total}</p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {STAGES.map((stage) => {
          const count = colunas[stage.id].length;
          if (count === 0) return null;
          return (
            <span
              key={stage.id}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: stage.color }}
              />
              {stage.label}: <span className="font-medium text-foreground">{count}</span>
            </span>
          );
        })}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Após filtros aplicados</p>
    </div>
  );
}
