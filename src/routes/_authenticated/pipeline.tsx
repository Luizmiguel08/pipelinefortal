import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadCard } from "@/components/crm/LeadCard";
import { LeadDialog, type LeadFormValues } from "@/components/crm/LeadDialog";
import { getBoard, moveLead, saveLead, type BoardLead } from "@/lib/crm.functions";
import { STAGES, formatBRL, formatCompactBRL, type StageId } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline de Leads por Corretor | CRM Imobiliário" },
      {
        name: "description",
        content:
          "Kanban de leads por corretor com totais em R$ por etapa, sincronizado com o C2S - Gestão de Contatos.",
      },
      { property: "og:title", content: "Pipeline de Leads por Corretor" },
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
  const move = useServerFn(moveLead);
  const persist = useServerFn(saveLead);

  const { data, isLoading } = useQuery({ queryKey: ["board"], queryFn: () => fetchBoard() });

  const [corretorFiltro, setCorretorFiltro] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [dragging, setDragging] = useState<BoardLead | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [leadAtual, setLeadAtual] = useState<BoardLead | null>(null);

  const moveMutation = useMutation({
    mutationFn: (vars: { id: string; stage: StageId }) => move({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["board"] }),
    onError: (e: Error) => toast.error(e.message),
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
        },
      }),
    onSuccess: () => {
      toast.success("Lead salvo");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["board"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const corretores = data?.corretores ?? [];
  const nomePorCorretor = useMemo(
    () => new Map(corretores.map((c) => [c.id, c.nome])),
    [corretores],
  );

  const leadsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return (data?.leads ?? []).filter((l) => {
      if (corretorFiltro !== "todos" && l.corretor_id !== corretorFiltro) return false;
      if (!termo) return true;
      return `${l.nome} ${l.imovel ?? ""} ${l.email ?? ""}`.toLowerCase().includes(termo);
    });
  }, [data?.leads, corretorFiltro, busca]);

  const totalGeral = leadsFiltrados.reduce((acc, l) => acc + l.valor, 0);
  const emAndamento = leadsFiltrados
    .filter((l) => l.stage !== "fechamento")
    .reduce((acc, l) => acc + l.valor, 0);

  function handleDrop(stage: StageId) {
    if (!dragging || dragging.stage === stage) return setDragging(null);
    moveMutation.mutate({ id: dragging.id, stage });
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
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-5 py-3.5">
          <div className="mr-auto">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">CRM Imobiliário</p>
            <h1 className="text-lg font-semibold">Pipeline de leads</h1>
          </div>
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cliente ou imóvel"
            className="h-9 w-56"
          />
          {data?.isGestor && (
            <select
              value={corretorFiltro}
              onChange={(e) => setCorretorFiltro(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="todos">Todos os corretores</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
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
          <Button variant="ghost" onClick={sair}>
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-5 py-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <SummaryCard label="Leads no funil" value={String(leadsFiltrados.length)} hint="Após filtros aplicados" />
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
          <div className="scroll-slim mt-5 flex gap-4 overflow-x-auto pb-6">
            {STAGES.map((stage) => {
              const leadsColuna = leadsFiltrados.filter((l) => l.stage === stage.id);
              const totalColuna = leadsColuna.reduce((acc, l) => acc + l.valor, 0);
              return (
                <section
                  key={stage.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(stage.id)}
                  className="panel flex w-[300px] shrink-0 flex-col p-3"
                >
                  <div className="stage-rail mb-3" style={{ backgroundColor: stage.color }} />
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-semibold">{stage.label}</h2>
                      <p className="text-[11px] text-muted-foreground">{stage.hint}</p>
                    </div>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                      {leadsColuna.length}
                    </span>
                  </div>
                  <p className="mt-2 text-base font-semibold" style={{ color: stage.color }}>
                    {formatBRL(totalColuna)}
                  </p>

                  <div className="scroll-slim mt-3 flex max-h-[62vh] flex-col gap-2 overflow-y-auto pr-0.5">
                    {leadsColuna.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        corretorNome={lead.corretor_id ? nomePorCorretor.get(lead.corretor_id) : undefined}
                        showCorretor={corretorFiltro === "todos"}
                        onDragStart={setDragging}
                        onOpen={(l) => {
                          setLeadAtual(l);
                          setDialogOpen(true);
                        }}
                      />
                    ))}
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
