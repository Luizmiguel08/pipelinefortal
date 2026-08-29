import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { stageLabel, type StageId } from "@/lib/stages";
import { getAtividade } from "@/lib/atividade.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/atividade")({
  head: () => ({
    meta: [
      { title: "Atividade dos corretores | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Acompanhe quem está movimentando o funil todos os dias: movimentações por corretor, última vez que mexeu no projeto e leads com informações preenchidas.",
      },
      { property: "og:title", content: "Atividade dos corretores | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Histórico diário de movimentação de cada corretor no funil Fortal Pipeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AtividadePage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-3xl px-5 py-16 text-center">
      <h1 className="text-xl font-semibold">Não foi possível carregar a atividade</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button className="mt-6" asChild>
        <Link to="/pipeline">Voltar ao funil</Link>
      </Button>
    </main>
  ),
  notFoundComponent: () => <p className="p-8">Página não encontrada.</p>,
});

const OPCOES_DIAS = [1, 7, 15, 30];

function quando(iso: string | null) {
  if (!iso) return "Nunca";
  const d = new Date(iso);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 60 * 24) return `há ${Math.floor(min / 60)} h`;
  const dias = Math.floor(min / 1440);
  return dias === 1 ? "ontem" : `há ${dias} dias`;
}

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rotulo(stage: string | null) {
  if (!stage) return "—";
  return stageLabel(stage as StageId);
}

function AtividadePage() {
  const buscar = useServerFn(getAtividade);
  const [dias, setDias] = useState(7);
  const [corretor, setCorretor] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["atividade", dias, corretor],
    queryFn: () => buscar({ data: { dias, corretor } }),
    refetchInterval: 60_000,
  });

  const corretores = data?.corretores ?? [];
  const eventos = data?.eventos ?? [];

  return (
    <main className="mx-auto max-w-[1400px] px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Atividade dos corretores</h1>
          <p className="text-sm text-muted-foreground">
            Quem está mexendo no funil, com que frequência e quando foi a última vez.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {OPCOES_DIAS.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={dias === d ? "default" : "outline"}
              onClick={() => setDias(d)}
            >
              {d === 1 ? "Hoje" : `${d} dias`}
            </Button>
          ))}
          <Button variant="secondary" asChild>
            <Link to="/pipeline">Voltar ao funil</Link>
          </Button>
        </div>
      </header>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Carregando...</p>}

      <section className="mt-6 overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Corretor</th>
              <th className="px-4 py-3">Movimentações</th>
              <th className="px-4 py-3">Feitas pelo corretor</th>
              <th className="px-4 py-3">Automáticas</th>
              <th className="px-4 py-3">Hoje</th>
              <th className="px-4 py-3">Última movimentação</th>
              <th className="px-4 py-3">Última edição</th>
              <th className="px-4 py-3">Leads preenchidos</th>
            </tr>
          </thead>
          <tbody>
            {corretores.map((c) => {
              const pct = c.leads_total
                ? Math.round((c.leads_qualificados / c.leads_total) * 100)
                : 0;
              const parado = c.manuais === 0;
              return (
                <tr
                  key={c.corretor_id}
                  onClick={() => setCorretor(corretor === c.corretor_id ? null : c.corretor_id)}
                  className={cn(
                    "cursor-pointer border-t border-border transition-colors hover:bg-muted/40",
                    corretor === c.corretor_id && "bg-muted/60",
                  )}
                >
                  <td className="px-4 py-3 font-medium">
                    {c.nome}
                    {!c.ativo && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{c.movimentacoes}</td>
                  <td
                    className={cn(
                      "px-4 py-3 font-semibold",
                      parado ? "text-destructive" : "text-primary",
                    )}
                  >
                    {c.manuais}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.automaticas}</td>
                  <td className="px-4 py-3">{c.hoje}</td>
                  <td className="px-4 py-3">{quando(c.ultima_movimentacao)}</td>
                  <td className="px-4 py-3">{quando(c.ultima_edicao)}</td>
                  <td className="px-4 py-3">
                    {c.leads_qualificados}/{c.leads_total}
                    <span className="ml-2 text-xs text-muted-foreground">{pct}%</span>
                  </td>
                </tr>
              );
            })}
            {!isLoading && corretores.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                  Nenhum corretor encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Histórico de movimentações
            {corretor && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {corretores.find((c) => c.corretor_id === corretor)?.nome}
              </span>
            )}
          </h2>
          {corretor && (
            <Button size="sm" variant="outline" onClick={() => setCorretor(null)}>
              Ver todos
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Clique em um corretor na tabela acima para filtrar o histórico.
        </p>

        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {eventos.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <span className="w-28 shrink-0 text-xs text-muted-foreground">
                {dataHora(e.created_at)}
              </span>
              <span className="font-medium">{e.corretor_nome ?? "Sem responsável"}</span>
              <span className="text-muted-foreground">moveu</span>
              <span className="font-medium">{e.lead_nome}</span>
              <span className="text-muted-foreground">
                de {rotulo(e.de)} → {rotulo(e.para)}
              </span>
              <span
                className={cn(
                  "ml-auto rounded-full px-2 py-0.5 text-xs",
                  e.automatico
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/15 text-primary",
                )}
              >
                {e.automatico ? "Automático" : "Corretor"}
              </span>
            </li>
          ))}
          {!isLoading && eventos.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground">
              Nenhuma movimentação no período.
            </li>
          )}
        </ul>
      </section>
    </main>
  );
}
