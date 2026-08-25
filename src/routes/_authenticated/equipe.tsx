import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getEquipe, setCorretorEmail, vincularContas } from "@/lib/equipe.functions";

const URL_PUBLICA = "https://pipelinefortal.lovable.app";

export const Route = createFileRoute("/_authenticated/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe e convites | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Cadastre o e-mail de cada corretor e envie o link de convite para que ele crie a conta e veja apenas os próprios leads no Fortal Pipeline.",
      },
      { property: "og:title", content: "Equipe e convites | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Convide corretores por link e acompanhe quais contas já estão vinculadas ao funil.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EquipePage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-3xl px-5 py-16 text-center">
      <h1 className="text-xl font-semibold">Não foi possível carregar a equipe</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button className="mt-6" asChild>
        <Link to="/pipeline">Voltar ao funil</Link>
      </Button>
    </main>
  ),
  notFoundComponent: () => <p className="p-8">Página não encontrada.</p>,
});

function EquipePage() {
  const queryClient = useQueryClient();
  const buscar = useServerFn(getEquipe);
  const salvarEmail = useServerFn(setCorretorEmail);
  const vincular = useServerFn(vincularContas);

  const [busca, setBusca] = useState("");
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({ queryKey: ["equipe"], queryFn: () => buscar() });

  const mutSalvar = useMutation({
    mutationFn: (vars: { id: string; email: string }) => salvarEmail({ data: vars }),
    onSuccess: (r) => {
      toast.success(r.vinculado ? "E-mail salvo e conta vinculada" : "E-mail salvo");
      queryClient.invalidateQueries({ queryKey: ["equipe"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mutVincular = useMutation({
    mutationFn: () => vincular(),
    onSuccess: (r) => {
      toast.success(`${r.vinculados} conta(s) vinculada(s)`);
      queryClient.invalidateQueries({ queryKey: ["equipe"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const corretores = data?.corretores ?? [];
  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return corretores;
    return corretores.filter(
      (c) => c.nome.toLowerCase().includes(termo) || (c.email ?? "").toLowerCase().includes(termo),
    );
  }, [corretores, busca]);

  const linkConvite = (email: string | null) =>
    `${URL_PUBLICA}/auth?convite=1${email ? `&email=${encodeURIComponent(email)}` : ""}`;

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  const vinculados = corretores.filter((c) => c.user_id).length;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 px-5 py-4">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Equipe e convites</h1>
            <p className="text-sm text-muted-foreground">
              {vinculados} de {corretores.length} corretores já com conta ativa
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => mutVincular.mutate()} disabled={mutVincular.isPending}>
              {mutVincular.isPending ? "Vinculando..." : "Vincular contas existentes"}
            </Button>
            <Button variant="secondary" onClick={() => copiar(linkConvite(null))}>
              Copiar link geral
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/pipeline">Voltar ao funil</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        <div className="panel p-4 text-sm text-muted-foreground">
          Cadastre o e-mail exatamente como o corretor vai usar para criar a conta. Ao se cadastrar pelo link, ele entra
          com perfil <strong className="text-foreground">corretor</strong> e enxerga apenas os leads dele.
        </div>

        <div className="mt-4">
          <Input placeholder="Buscar corretor..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        {isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Carregando equipe...</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {lista.map((c) => {
              const valor = rascunho[c.id] ?? c.email ?? "";
              return (
                <li key={c.id} className="panel flex flex-wrap items-center gap-3 p-3">
                  <div className="min-w-[180px] flex-1">
                    <p className="font-medium">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">{c.leads} leads no funil</p>
                  </div>
                  <Input
                    className="w-full sm:w-72"
                    type="email"
                    placeholder="email@imobiliaria.com.br"
                    value={valor}
                    onChange={(e) => setRascunho((r) => ({ ...r, [c.id]: e.target.value }))}
                  />
                  <span
                    className={`rounded-full px-2 py-1 text-xs ${
                      c.user_id ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {c.user_id ? "Conta ativa" : "Sem conta"}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={!valor || valor === c.email || mutSalvar.isPending}
                    onClick={() => mutSalvar.mutate({ id: c.id, email: valor })}
                  >
                    Salvar e-mail
                  </Button>
                  <Button variant="ghost" disabled={!valor} onClick={() => copiar(linkConvite(valor))}>
                    Copiar convite
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
