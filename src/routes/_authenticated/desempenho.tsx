import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGES } from "@/lib/stages";
import { getDesempenho, type DesempenhoCorretor } from "@/lib/desempenho.functions";
import { getMetas, salvarMeta, type Meta } from "@/lib/metas.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/desempenho")({
  head: () => ({
    meta: [
      { title: "Desempenho por corretor | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Veja por corretor quantos leads ele tem, o valor total em andamento, a distribuição por coluna do funil e o que ainda falta preencher.",
      },
      { property: "og:title", content: "Desempenho por corretor | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Leads, valor total e informações pendentes de cada corretor no Fortal Pipeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DesempenhoPage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-3xl px-5 py-16 text-center">
      <h1 className="text-xl font-semibold">Não foi possível carregar o desempenho</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button className="mt-6" asChild>
        <Link to="/pipeline">Voltar ao funil</Link>
      </Button>
    </main>
  ),
  notFoundComponent: () => <p className="p-8">Página não encontrada.</p>,
});

const INICIO_PADRAO = "2026-08-01";

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function quando(iso: string | null) {
  if (!iso) return "Sem movimento";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  const dias = Math.floor(min / 1440);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

function Pendencia({ rotulo, valor, total }: { rotulo: string; valor: number; total: number }) {
  const pct = total > 0 ? Math.round((valor / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("text-sm font-semibold", valor > 0 ? "text-destructive" : "text-foreground")}>
        {valor} {total > 0 && <span className="text-xs font-normal text-muted-foreground">({pct}%)</span>}
      </p>
    </div>
  );
}

function Metas({
  c,
  meta,
  gestor,
  onSalvar,
  salvando,
}: {
  c: DesempenhoCorretor;
  meta: Meta | undefined;
  gestor: boolean;
  onSalvar: (leads: number, valor: number) => void;
  salvando: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [leads, setLeads] = useState(String(meta?.meta_leads ?? 0));
  const [valor, setValor] = useState(String(meta?.meta_valor ?? 0));

  const metaLeads = meta?.meta_leads ?? 0;
  const metaValor = meta?.meta_valor ?? 0;
  const pctLeads = metaLeads > 0 ? Math.min(100, Math.round((c.leads_total / metaLeads) * 100)) : 0;
  const pctValor = metaValor > 0 ? Math.min(100, Math.round((c.valor_total / metaValor) * 100)) : 0;

  if (editando) {
    return (
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-border p-3">
        <label className="text-xs text-muted-foreground">
          Meta de leads
          <Input
            className="mt-1 h-9 w-32"
            inputMode="numeric"
            value={leads}
            onChange={(e) => setLeads(e.target.value)}
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Meta de valor (R$)
          <Input
            className="mt-1 h-9 w-40"
            inputMode="numeric"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </label>
        <Button
          size="sm"
          disabled={salvando}
          onClick={() => {
            onSalvar(Number(leads) || 0, Number(valor) || 0);
            setEditando(false);
          }}
        >
          Salvar meta
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </div>
    );
  }

  if (metaLeads === 0 && metaValor === 0) {
    return gestor ? (
      <Button size="sm" variant="outline" className="mt-4" onClick={() => setEditando(true)}>
        Definir meta do mês
      </Button>
    ) : null;
  }

  return (
    <div className="mt-4 grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2">
      <div>
        <p className="text-xs text-muted-foreground">
          Meta de leads: {c.leads_total}/{metaLeads} ({pctLeads}%)
        </p>
        <div className="mt-1 h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${pctLeads}%` }} />
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">
          Meta de valor: {dinheiro(c.valor_total)}/{dinheiro(metaValor)} ({pctValor}%)
        </p>
        <div className="mt-1 h-2 rounded-full bg-muted">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${pctValor}%` }} />
        </div>
      </div>
      {gestor && (
        <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setEditando(true)}>
          Alterar meta
        </Button>
      )}
    </div>
  );
}

function CardCorretor({
  c,
  meta,
  gestor,
  onSalvarMeta,
  salvandoMeta,
}: {
  c: DesempenhoCorretor;
  meta: Meta | undefined;
  gestor: boolean;
  onSalvarMeta: (corretorId: string, leads: number, valor: number) => void;
  salvandoMeta: boolean;
}) {
  const stagesComLeads = STAGES.filter((s) => (c.por_stage?.[s.id] ?? 0) > 0);

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">{c.nome}</h2>
          <p className="text-xs text-muted-foreground">
            Última atualização de lead: {quando(c.ultima_atualizacao)}
            {!c.ativo && " · inativo"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground">
            {c.leads_total} {c.leads_total === 1 ? "lead" : "leads"}
          </p>
          <p className="text-lg font-semibold">{dinheiro(c.valor_total)}</p>
        </div>
      </header>

      <Metas
        c={c}
        meta={meta}
        gestor={gestor}
        salvando={salvandoMeta}
        onSalvar={(leads, valor) => onSalvarMeta(c.corretor_id, leads, valor)}
      />

      {c.leads_total === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Nenhum lead no período selecionado.</p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            {stagesComLeads.map((s) => (
              <span
                key={s.id}
                className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                  aria-hidden
                />
                {s.label}
                <strong className="font-semibold">{c.por_stage[s.id]}</strong>
              </span>
            ))}
          </div>

          <div className="mt-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">Falta preencher</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Pendencia rotulo="Sem telefone" valor={c.sem_telefone} total={c.leads_total} />
              <Pendencia rotulo="Sem valor" valor={c.sem_valor} total={c.leads_total} />
              <Pendencia rotulo="Sem entrada" valor={c.sem_entrada} total={c.leads_total} />
              <Pendencia rotulo="Sem finalidade" valor={c.sem_finalidade} total={c.leads_total} />
              <Pendencia rotulo="Sem tipo do imóvel" valor={c.sem_estagio_imovel} total={c.leads_total} />
              <Pendencia rotulo="Nada preenchido" valor={c.sem_nenhum_indicador} total={c.leads_total} />
            </div>
          </div>
        </>
      )}
    </article>
  );
}

function DesempenhoPage() {
  const buscar = useServerFn(getDesempenho);
  const buscarMetas = useServerFn(getMetas);
  const gravarMeta = useServerFn(salvarMeta);
  const queryClient = useQueryClient();
  const [inicio, setInicio] = useState(INICIO_PADRAO);
  const [fim, setFim] = useState("");
  const [busca, setBusca] = useState("");
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));

  const filtro = useMemo(
    () => ({
      inicio: inicio ? new Date(`${inicio}T00:00:00`).toISOString() : null,
      fim: fim ? new Date(`${fim}T23:59:59`).toISOString() : null,
    }),
    [inicio, fim],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["desempenho", filtro.inicio, filtro.fim],
    queryFn: () => buscar({ data: filtro }),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: metasData } = useQuery({
    queryKey: ["metas", mes],
    queryFn: () => buscarMetas({ data: { mes } }),
  });

  const metaPorCorretor = useMemo(
    () => new Map((metasData?.metas ?? []).map((m) => [m.corretor_id, m])),
    [metasData],
  );

  const mutarMeta = useMutation({
    mutationFn: (v: { corretor_id: string; meta_leads: number; meta_valor: number }) =>
      gravarMeta({ data: { ...v, mes } }),
    onSuccess: () => {
      toast.success("Meta salva.");
      void queryClient.invalidateQueries({ queryKey: ["metas", mes] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const corretores = (data?.corretores ?? []).filter((c) =>
    c.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  const totalLeads = corretores.reduce((s, c) => s + c.leads_total, 0);
  const totalValor = corretores.reduce((s, c) => s + c.valor_total, 0);

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Desempenho por corretor</h1>
          <p className="text-sm text-muted-foreground">
            Leads, valor em andamento, distribuição por coluna e informações que ainda faltam.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link to="/pipeline">Voltar ao funil</Link>
        </Button>
      </header>

      <section className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-border p-4">
        <label className="text-xs text-muted-foreground">
          De
          <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="mt-1 h-9 w-44" />
        </label>
        <label className="text-xs text-muted-foreground">
          Até
          <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="mt-1 h-9 w-44" />
        </label>
        <label className="text-xs text-muted-foreground">
          Corretor
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar corretor"
            className="mt-1 h-9 w-56"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Metas do mês
          <Input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="mt-1 h-9 w-40"
          />
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            setInicio(INICIO_PADRAO);
            setFim("");
            setBusca("");
          }}
        >
          Limpar filtros
        </Button>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">
            {corretores.length} corretores · {totalLeads} leads
          </p>
          <p className="text-lg font-semibold">{dinheiro(totalValor)}</p>
        </div>
      </section>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && isFetching && (
        <p className="mt-4 text-xs text-muted-foreground">Atualizando...</p>
      )}

      <section className="mt-4 grid gap-4">
        {corretores.map((c) => (
          <CardCorretor
            key={c.corretor_id}
            c={c}
            meta={metaPorCorretor.get(c.corretor_id)}
            gestor={data?.isGestor ?? false}
            salvandoMeta={mutarMeta.isPending}
            onSalvarMeta={(corretor_id, meta_leads, meta_valor) =>
              mutarMeta.mutate({ corretor_id, meta_leads, meta_valor })
            }
          />
        ))}
        {!isLoading && corretores.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum corretor encontrado.</p>
        )}
      </section>
    </main>
  );
}
