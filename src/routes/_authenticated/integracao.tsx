import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getIntegrationStatus,
  getSyncHistory,
  syncNow,
  testC2SConnection,
  importC2SCorretores,
} from "@/lib/crm.functions";

import { STAGES } from "@/lib/stages";

export const Route = createFileRoute("/_authenticated/integracao")({
  head: () => ({
    meta: [
      { title: "Integração C2S | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Configure e execute a sincronização de contatos do C2S - Gestão de Contatos com o funil dos corretores no Fortal Pipeline.",
      },
      { property: "og:title", content: "Integração C2S | Fortal Pipeline" },
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
  const runTest = useServerFn(testC2SConnection);
  const fetchHistory = useServerFn(getSyncHistory);
  const runImportCorretores = useServerFn(importC2SCorretores);

  const importar = useMutation({
    mutationFn: () => runImportCorretores(),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["board"] }),
    onSuccess: (r) =>
      toast.success(
        `${r.total} corretores do C2S sincronizados (${r.criados} novos, ${r.atualizados} atualizados)`,
      ),
    onError: (e: Error) => toast.error(e.message),
  });


  const test = useMutation({
    mutationFn: () => runTest(),
    onSuccess: (r) => toast.success(`Conexão OK — ${r.contatos} contatos encontrados no C2S`),
    onError: (e: Error) => toast.error(e.message),
  });


  const { data } = useQuery({ queryKey: ["c2s-status"], queryFn: () => fetchStatus() });
  const { data: history } = useQuery({
    queryKey: ["c2s-history"],
    queryFn: () => fetchHistory(),
  });


  const sync = useMutation({
    mutationFn: () => runSync({ data: { reconciliarMes: true } }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["board"] });
      queryClient.invalidateQueries({ queryKey: ["c2s-status"] });
      queryClient.invalidateQueries({ queryKey: ["c2s-history"] });
    },
    onSuccess: (r) => {
      toast.success(`Mês reconciliado: ${r.total} contatos conferidos, ${r.criados} novos e ${r.atualizados} atualizados`);
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
            disabled={!data?.isGestor || !data?.configurado || sync.isPending}
            onClick={() => sync.mutate()}
          >
            {sync.isPending ? "Reconciliando o mês..." : "Reconciliar mês atual"}
          </Button>
        </div>
      </div>

      <div className="panel mt-4 p-5">
        <h2 className="text-sm font-semibold">Credenciais da API do C2S</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A URL base e o token ficam guardados criptografados no cofre de segredos do backend. Eles
          nunca são exibidos por completo, nunca trafegam para o navegador e só são lidos pelo
          servidor no momento da sincronização.
        </p>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              C2S_API_BASE_URL
            </dt>
            <dd className="mt-1 truncate font-mono text-sm">
              {data?.baseUrlHost ?? "não informada"}
            </dd>
          </div>
          <div className="rounded-lg border border-border p-3">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">C2S_API_TOKEN</dt>
            <dd className="mt-1 truncate font-mono text-sm">
              {data?.tokenMascarado ?? "não informado"}
            </dd>
          </div>
        </dl>

        <ol className="mt-4 space-y-1 text-sm text-muted-foreground">
          <li>1. No C2S, acesse Configurações → Integrações/API e gere um token de acesso.</li>
          <li>
            2. Peça no chat da Lovable para informar as credenciais do C2S: abre um formulário
            seguro onde você cola a URL base e o token direto no cofre.
          </li>
          <li>3. Volte aqui, use “Testar conexão” e depois “Sincronizar agora”.</li>
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            disabled={!data?.isGestor || test.isPending}
            onClick={() => test.mutate()}
          >
            {test.isPending ? "Testando..." : "Testar conexão"}
          </Button>
          <Button
            variant="secondary"
            disabled={!data?.isGestor || !data?.configurado || importar.isPending}
            onClick={() => importar.mutate()}
          >
            {importar.isPending ? "Importando..." : "Importar corretores do C2S"}
          </Button>
          {!data?.isGestor && (
            <span className="text-xs text-muted-foreground">
              Somente gestores podem alterar ou testar as credenciais.
            </span>
          )}
        </div>
      </div>

      <div className="panel mt-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold">Histórico de sincronizações</h2>
          <span className="text-xs text-muted-foreground">Últimas 20 execuções</span>
        </div>

        {!history?.isGestor ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Somente gestores visualizam o histórico de sincronizações.
          </p>
        ) : history.execucoes.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma sincronização executada até agora.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Data/hora</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Origem</th>
                  <th className="pb-2 pr-4 font-medium">Contatos</th>
                  <th className="pb-2 pr-4 font-medium">Novos</th>
                  <th className="pb-2 pr-4 font-medium">Atualizados</th>
                  <th className="pb-2 pr-4 font-medium">Movidos</th>
                  <th className="pb-2 font-medium">Duração</th>
                </tr>
              </thead>
              <tbody>
                {history.execucoes.map((e) => (
                  <tr key={e.id} className="border-t border-border align-top">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {new Date(e.startedAt).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-semibold"
                        style={{
                          backgroundColor:
                            e.status === "sucesso"
                              ? "var(--stage-fechamento)"
                              : e.status === "rodando"
                                ? "var(--stage-atendimento)"
                                : "var(--destructive)",
                          color: "var(--primary-foreground)",
                        }}
                      >
                        {e.status === "sucesso"
                          ? "Sucesso"
                          : e.status === "rodando"
                            ? "Em andamento"
                            : "Erro"}
                      </span>

                      {e.erro && (
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">{e.erro}</p>
                      )}
                    </td>
                    <td className="py-2 pr-4 capitalize">{e.origem}</td>
                    <td className="py-2 pr-4">{e.total}</td>
                    <td className="py-2 pr-4">{e.criados}</td>
                    <td className="py-2 pr-4">{e.atualizados}</td>
                    <td className="py-2 pr-4">{e.movidos}</td>
                    <td className="py-2 whitespace-nowrap">
                      {e.duracaoMs != null ? `${(e.duracaoMs / 1000).toFixed(1)}s` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
