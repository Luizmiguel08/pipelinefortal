import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getIntegrationStatus, syncNow } from "@/lib/crm.functions";
import { STAGES } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/integracao")({
  head: () => ({
    meta: [
      { title: "Integração C2S — Sincronização de Leads | CRM Imobiliário" },
      {
        name: "description",
        content:
          "Configure e execute a sincronização de contatos do C2S - Gestão de Contatos com o pipeline dos corretores.",
      },
      { property: "og:title", content: "Integração C2S — Sincronização de Leads" },
      {
        property: "og:description",
        content: "Traga os leads diários do C2S direto para o kanban de cada corretor.",
      },
    ],
  }),
  component: IntegracaoPage,
});

function IntegracaoPage() {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getIntegrationStatus);
  const runSync = useServerFn(syncNow);

  const { data } = useQuery({ queryKey: ["c2s-status"], queryFn: () => fetchStatus() });

  const sync = useMutation({
    mutationFn: () => runSync(),
    onSuccess: (r) => {
      toast.success(`Sincronizado: ${r.criados} novos, ${r.atualizados} atualizados, ${r.movidos} movidos`);
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["c2s-status"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link to="/pipeline" className="text-sm text-muted-foreground hover:text-foreground">
        ← Voltar ao pipeline
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Integração com o C2S</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Os contatos do C2S - Gestão de Contatos alimentam automaticamente o funil de cada corretor.
      </p>

      <div className="panel mt-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: data?.configurado ? "var(--stage-fechamento)" : "var(--muted)",
              color: data?.configurado ? "var(--primary-foreground)" : "var(--muted-foreground)",
            }}
          >
            {data?.configurado ? "Credenciais configuradas" : "Credenciais pendentes"}
          </span>
          <span className="text-sm text-muted-foreground">
            Última sincronização:{" "}
            {data?.ultimaSincronizacao
              ? new Date(data.ultimaSincronizacao).toLocaleString("pt-BR")
              : "nunca"}
          </span>
          <Button
            className="ml-auto"
            disabled={!data?.isGestor || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? "Sincronizando..." : "Sincronizar agora"}
          </Button>
        </div>
        {!data?.configurado && (
          <p className="mt-4 text-sm text-muted-foreground">
            Informe a URL base da API do C2S e o token de acesso para ativar a sincronização automática.
          </p>
        )}
      </div>

      <div className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold">Como os leads se movem sozinhos</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
          {STAGES.map((s, i) => (
            <li key={s.id} className="flex gap-3">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              <span>
                <strong className="text-foreground">
                  {i + 1}. {s.label}
                </strong>{" "}
                — {s.hint}. O lead nunca volta de etapa na sincronização: prevalece sempre a fase mais avançada.
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
