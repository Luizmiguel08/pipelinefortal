import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runAgendaReconciliacao, type ReconResultado } from "@/lib/agenda-reconciliacao.functions";

const PERIODOS = [1, 7, 15, 30] as const;

export const Route = createFileRoute("/_authenticated/reconciliacao-agenda")({
  head: () => ({
    meta: [
      { title: "Reconciliação da agenda | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Relatório diário que compara os agendamentos da Agenda com a coluna Agendado do funil, por data e por corretor, apontando as causas das divergências.",
      },
      { property: "og:title", content: "Reconciliação da agenda | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Divergências diárias entre a Agenda e a coluna Agendado, por data e por corretor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReconciliacaoAgendaPage,
});

function formatarData(data: string) {
  if (data === "sem-data") return "Sem data";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function ReconciliacaoAgendaPage() {
  const executar = useServerFn(runAgendaReconciliacao);
  const [dias, setDias] = useState<number>(7);
  const [resultado, setResultado] = useState<ReconResultado | null>(null);

  const rodar = useMutation({
    mutationFn: (d: number) => executar({ data: { dias: d } }),
    onSuccess: (r) => {
      setResultado(r);
      toast.success(`Agenda ${r.agendaTotal} x funil ${r.funilTotal}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link to="/pipeline" className="text-sm text-muted-foreground hover:text-foreground">
        ← Voltar ao pipeline
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Reconciliação da agenda</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Compara, dia a dia e corretor a corretor, os agendamentos que existem na Agenda com os que aparecem na
        coluna <strong>Agendado</strong> do funil.
      </p>

      <div className="panel mt-6 flex flex-wrap items-center gap-3 p-5">
        <div className="flex gap-2">
          {PERIODOS.map((p) => (
            <button
              key={p}
              onClick={() => setDias(p)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                dias === p
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === 1 ? "Hoje (24h)" : `${p} dias`}
            </button>
          ))}
        </div>
        <Button className="ml-auto" disabled={rodar.isPending} onClick={() => rodar.mutate(dias)}>
          {rodar.isPending ? "Comparando..." : "Rodar reconciliação"}
        </Button>
      </div>

      {rodar.isPending && (
        <p className="mt-6 text-sm text-muted-foreground">
          Lendo a Agenda e comparando com a coluna Agendado. Isso pode levar alguns segundos.
        </p>
      )}

      {resultado && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Resumo titulo="Agendamentos na Agenda" valor={resultado.agendaTotal} />
            <Resumo titulo="Na coluna Agendado" valor={resultado.funilTotal} />
            <Resumo
              titulo="Faltando no funil"
              valor={resultado.faltandoNoFunil}
              alerta={resultado.faltandoNoFunil > 0}
            />
            <Resumo
              titulo="Sobrando no funil"
              valor={resultado.sobrandoNoFunil}
              alerta={resultado.sobrandoNoFunil > 0}
            />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Período desde {new Date(resultado.desde).toLocaleString("pt-BR")} · gerado em{" "}
            {new Date(resultado.geradoEm).toLocaleString("pt-BR")}. As datas seguem a data de criação do
            agendamento na Agenda (fuso de Brasília).
          </p>

          <div className="panel mt-5 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3 text-right">Agenda</th>
                  <th className="px-4 py-3 text-right">Funil</th>
                  <th className="px-4 py-3 text-right">Diferença</th>
                </tr>
              </thead>
              <tbody>
                {resultado.datas.map((d) => (
                  <tr key={d.data} className="border-b border-border/60">
                    <td className="px-4 py-3 font-medium">{formatarData(d.data)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.agendaTotal}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.funilTotal}</td>
                    <td
                      className="px-4 py-3 text-right font-semibold tabular-nums"
                      style={{ color: d.diferenca === 0 ? "var(--muted-foreground)" : "var(--destructive)" }}
                    >
                      {d.diferenca > 0 ? `+${d.diferenca}` : d.diferenca}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-8 text-sm font-semibold">Detalhe por data e corretor</h2>
          <div className="panel mt-3 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Corretor</th>
                  <th className="px-4 py-3 text-right">Agenda</th>
                  <th className="px-4 py-3 text-right">Funil</th>
                  <th className="px-4 py-3 text-right">Diferença</th>
                  <th className="px-4 py-3">Possíveis causas</th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l) => (
                  <tr key={`${l.data}|${l.corretor}`} className="border-b border-border/60">
                    <td className="px-4 py-3 whitespace-nowrap">{formatarData(l.data)}</td>
                    <td className="px-4 py-3 font-medium">{l.corretor}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.agendaTotal}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.funilTotal}</td>
                    <td
                      className="px-4 py-3 text-right font-semibold tabular-nums"
                      style={{ color: l.diferenca === 0 ? "var(--muted-foreground)" : "var(--destructive)" }}
                    >
                      {l.diferenca > 0 ? `+${l.diferenca}` : l.diferenca}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <ul className="space-y-1">
                        {l.causas.map((c) => (
                          <li key={c}>• {c}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Divergências de sincronização somem depois de rodar a sincronização em{" "}
            <Link to="/configuracoes-agenda" className="underline">
              Configurações da agenda
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

function Resumo({ titulo, valor, alerta }: { titulo: string; valor: number; alerta?: boolean }) {
  return (
    <div className="panel p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={alerta ? { color: "var(--destructive)" } : undefined}
      >
        {valor.toLocaleString("pt-BR")}
      </p>
    </div>
  );
}
