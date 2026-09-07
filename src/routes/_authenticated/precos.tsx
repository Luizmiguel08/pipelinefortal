import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getPrecos,
  salvarPreco,
  excluirPreco,
  type PrecoProjeto,
} from "@/lib/precos.functions";

export const Route = createFileRoute("/_authenticated/precos")({
  head: () => ({
    meta: [
      { title: "Valores por empreendimento | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Cadastre o valor de tabela de cada empreendimento para o CRM preencher automaticamente o valor dos leads.",
      },
      { property: "og:title", content: "Valores por empreendimento | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Tabela de preços dos empreendimentos usada no preenchimento automático dos leads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrecosPage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-3xl px-5 py-16 text-center">
      <h1 className="text-xl font-semibold">Não foi possível abrir os valores</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button className="mt-6" asChild>
        <Link to="/pipeline">Voltar ao funil</Link>
      </Button>
    </main>
  ),
  notFoundComponent: () => <p className="p-8">Página não encontrada.</p>,
});

const dinheiro = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type Rascunho = {
  id?: string | null;
  projeto: string;
  padroes: string;
  valor: string;
  exato: boolean;
  ordem: string;
};

const vazio: Rascunho = { id: null, projeto: "", padroes: "", valor: "", exato: false, ordem: "100" };

function paraRascunho(p: PrecoProjeto): Rascunho {
  return {
    id: p.id,
    projeto: p.projeto,
    padroes: p.padroes.join(", "),
    valor: String(p.valor),
    exato: p.exato,
    ordem: String(p.ordem),
  };
}

function PrecosPage() {
  const buscar = useServerFn(getPrecos);
  const gravar = useServerFn(salvarPreco);
  const remover = useServerFn(excluirPreco);
  const queryClient = useQueryClient();
  const [rascunho, setRascunho] = useState<Rascunho>(vazio);

  const { data, isLoading } = useQuery({
    queryKey: ["precos"],
    queryFn: () => buscar(),
  });

  const salvar = useMutation({
    mutationFn: () =>
      gravar({
        data: {
          id: rascunho.id ?? null,
          projeto: rascunho.projeto,
          padroes: rascunho.padroes.split(",").map((p) => p.trim()).filter(Boolean),
          exato: rascunho.exato,
          valor: Number(rascunho.valor.replace(/\./g, "").replace(",", ".")) || 0,
          ordem: Number(rascunho.ordem) || 100,
        },
      }),
    onSuccess: () => {
      toast.success("Valor salvo. Os próximos leads desse empreendimento já usam esse valor.");
      setRascunho(vazio);
      void queryClient.invalidateQueries({ queryKey: ["precos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => remover({ data: { id } }),
    onSuccess: () => {
      toast.success("Empreendimento removido da tabela.");
      void queryClient.invalidateQueries({ queryKey: ["precos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const gestor = data?.isGestor ?? false;

  return (
    <main className="mx-auto max-w-[1100px] px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Valores por empreendimento</h1>
          <p className="text-sm text-muted-foreground">
            Quando o lead chega sem valor, o sistema usa o valor cadastrado aqui. O valor digitado
            pelo corretor nunca é substituído.
          </p>
        </div>
        <Button variant="secondary" asChild>
          <Link to="/pipeline">Voltar ao funil</Link>
        </Button>
      </header>

      {gestor && (
        <section className="mt-6 rounded-xl border border-border p-4">
          <h2 className="text-sm font-semibold">
            {rascunho.id ? "Editar empreendimento" : "Novo empreendimento"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs text-muted-foreground">
              Empreendimento
              <Input
                className="mt-1 h-9"
                value={rascunho.projeto}
                onChange={(e) => setRascunho({ ...rascunho, projeto: e.target.value })}
                placeholder="Ex.: Vértice"
              />
            </label>
            <label className="text-xs text-muted-foreground lg:col-span-2">
              Nomes que identificam (separados por vírgula)
              <Input
                className="mt-1 h-9"
                value={rascunho.padroes}
                onChange={(e) => setRascunho({ ...rascunho, padroes: e.target.value })}
                placeholder="VERTICE, ON VERTICE"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Valor (R$)
              <Input
                className="mt-1 h-9"
                inputMode="numeric"
                value={rascunho.valor}
                onChange={(e) => setRascunho({ ...rascunho, valor: e.target.value })}
                placeholder="211000"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Ordem
              <Input
                className="mt-1 h-9"
                inputMode="numeric"
                value={rascunho.ordem}
                onChange={(e) => setRascunho({ ...rascunho, ordem: e.target.value })}
              />
            </label>
          </div>
          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={rascunho.exato}
              onChange={(e) => setRascunho({ ...rascunho, exato: e.target.checked })}
            />
            Só aplicar quando o nome for exatamente igual
          </label>
          <div className="mt-3 flex gap-2">
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
            {rascunho.id && (
              <Button variant="ghost" onClick={() => setRascunho(vazio)}>
                Cancelar
              </Button>
            )}
          </div>
        </section>
      )}

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Carregando...</p>}

      <section className="mt-6 grid gap-2">
        {(data?.precos ?? []).map((p) => (
          <article
            key={p.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
          >
            <div>
              <p className="font-medium">{p.projeto}</p>
              <p className="text-xs text-muted-foreground">
                {p.padroes.join(" · ")}
                {p.exato && " · nome exato"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{dinheiro(p.valor)}</span>
              {gestor && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setRascunho(paraRascunho(p))}>
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => apagar.mutate(p.id)}
                    disabled={apagar.isPending}
                  >
                    Excluir
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </section>

      {(data?.semPreco.length ?? 0) > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">Empreendimentos sem valor cadastrado</h2>
          <p className="text-xs text-muted-foreground">
            Aparecem nos leads com valor zerado. Cadastre acima para preencher automaticamente.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data?.semPreco.map((s) => (
              <button
                key={s.imovel}
                type="button"
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
                onClick={() =>
                  setRascunho({ ...vazio, projeto: s.imovel, padroes: s.imovel.toUpperCase() })
                }
              >
                {s.imovel} <strong>{s.leads}</strong>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
