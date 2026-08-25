import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runAudit, type AuditResultado } from "@/lib/audit.functions";

const PERIODOS = [1, 7, 15, 30] as const;

export const Route = createFileRoute("/_authenticated/auditoria")({
  head: () => ({
    meta: [
      { title: "Auditoria C2S x CRM | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Compare a quantidade de leads do C2S com a do Fortal Pipeline por corretor, veja as diferenças e as prováveis causas de divergência.",
      },
      { property: "og:title", content: "Auditoria C2S x CRM | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Diferenças de contagem de leads por corretor entre o C2S e o funil, com causas prováveis.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuditoriaPage,
});

function AuditoriaPage() {
  const executar = useServerFn(runAudit);
  const [dias, setDias] = useState<number>(7);
  const [resultado, setResultado] = useState<AuditResultado | null>(null);

  const auditar = useMutation({
    mutationFn: (d: number) => executar({ data: { dias: d } }),
    onSuccess: (r) => {
      setResultado(r);
      toast.success(`Auditoria concluída: ${r.c2sTotal} contatos no C2S x ${r.crmTotal} leads no CRM`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link to="/pipeline" className="text-sm text-muted-foreground hover:text-foreground">
        ← Voltar ao pipeline
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Auditoria C2S x CRM</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Compara, corretor por corretor, quantos contatos existem no C2S e quantos leads chegaram ao funil no
        período escolhido.
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
        <Button className="ml-auto" disabled={auditar.isPending} onClick={() => auditar.mutate(dias)}>
          {auditar.isPending ? "Comparando..." : "Rodar auditoria"}
        </Button>
      </div>

      {auditar.isPending && (
        <p className="mt-6 text-sm text-muted-foreground">
          Lendo os contatos do C2S e comparando com o funil. Isso pode levar alguns segundos.
        </p>
      )}

      {resultado && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Resumo titulo="Contatos no C2S" valor={resultado.c2sTotal} />
            <Resumo titulo="Leads no CRM" valor={resultado.crmTotal} />
            <Resumo
              titulo="Faltando no CRM"
              valor={resultado.faltandoNoCrm}
              alerta={resultado.faltandoNoCrm > 0}
            />
            <Resumo
              titulo="Agentes não vinculados"
              valor={resultado.agentesDesconhecidos}
              alerta={resultado.agentesDesconhecidos > 0}
            />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Período desde {new Date(resultado.desde).toLocaleString("pt-BR")} · gerado em{" "}
            {new Date(resultado.geradoEm).toLocaleString("pt-BR")} ·{" "}
            {resultado.contatosSemAgente} contato(s) sem corretor no C2S ·{" "}
            {resultado.semCorretorNoCrm} lead(s) sem corretor no CRM.
          </p>

          <div className="panel mt-5 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Corretor</th>
                  <th className="px-4 py-3 text-right">C2S</th>
                  <th className="px-4 py-3 text-right">CRM</th>
                  <th className="px-4 py-3 text-right">Diferença</th>
                  <th className="px-4 py-3">Possíveis causas</th>
                </tr>
              </thead>
              <tbody>
                {resultado.linhas.map((l) => (
                  <tr key={`${l.corretorId ?? l.c2sAgentId ?? l.nome}`} className="border-b border-border/60">
                    <td className="px-4 py-3">
                      <span className="font-medium">{l.nome}</span>
                      {l.c2sAgentId && (
                        <span className="ml-2 text-xs text-muted-foreground">#{l.c2sAgentId}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.c2sTotal}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{l.crmTotal}</td>
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

          {resultado.amostraFaltando.length > 0 && (
            <div className="panel mt-4 p-5">
              <h2 className="text-sm font-semibold">Exemplos de contatos que ainda não estão no CRM</h2>
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {resultado.amostraFaltando.map((c) => (
                  <li key={c.c2s_contact_id}>
                    #{c.c2s_contact_id} — {c.nome}
                    {c.corretor ? ` (${c.corretor})` : " (sem corretor)"}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Rode uma sincronização na tela de{" "}
                <Link to="/integracao" className="underline">
                  Integração C2S
                </Link>{" "}
                para trazer esses contatos.
              </p>
            </div>
          )}
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
