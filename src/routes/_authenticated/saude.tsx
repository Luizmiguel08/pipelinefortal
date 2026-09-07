import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSaude, type ResumoSync } from "@/lib/saude.functions";

export const Route = createFileRoute("/_authenticated/saude")({
  head: () => ({
    meta: [
      { title: "Saúde do sistema | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Acompanhe a última sincronização do C2S e da agenda, falhas recentes e leads sem corretor, sem valor ou parados.",
      },
      { property: "og:title", content: "Saúde do sistema | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Painel único com o estado das sincronizações e a qualidade dos dados do funil.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SaudePage,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-3xl px-5 py-16 text-center">
      <h1 className="text-xl font-semibold">Não foi possível abrir o painel</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Button className="mt-6" asChild>
        <Link to="/pipeline">Voltar ao funil</Link>
      </Button>
    </main>
  ),
  notFoundComponent: () => <p className="p-8">Página não encontrada.</p>,
});

function quando(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)} h`;
  return `há ${Math.floor(min / 1440)} dias`;
}

function Indicador({
  rotulo,
  valor,
  alerta = false,
  detalhe,
}: {
  rotulo: string;
  valor: number | string;
  alerta?: boolean;
  detalhe?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className={cn("text-2xl font-semibold", alerta && "text-destructive")}>{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

function CardSync({ titulo, s, falhas }: { titulo: string; s: ResumoSync; falhas: number }) {
  const ok = s?.status === "sucesso";
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium",
            ok ? "bg-emerald-500/15 text-emerald-600" : "bg-destructive/15 text-destructive",
          )}
        >
          {s ? (ok ? "Funcionando" : s.status) : "Sem registro"}
        </span>
      </header>
      <p className="mt-2 text-sm text-muted-foreground">
        Última execução {quando(s?.started_at)} · origem {s?.origem ?? "-"}
      </p>
      <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Processados</p>
          <p className="font-semibold">{s?.total ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Novos</p>
          <p className="font-semibold">{s?.criados ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Atualizados</p>
          <p className="font-semibold">{s?.atualizados ?? 0}</p>
        </div>
      </div>
      <p className={cn("mt-3 text-xs", falhas > 0 ? "text-destructive" : "text-muted-foreground")}>
        {falhas > 0 ? `${falhas} falha(s) nas últimas 24 h` : "Sem falhas nas últimas 24 h"}
      </p>
      {s?.erro && <p className="mt-2 text-xs text-destructive">{s.erro}</p>}
    </article>
  );
}

function SaudePage() {
  const buscar = useServerFn(getSaude);
  const { data, isLoading } = useQuery({
    queryKey: ["saude"],
    queryFn: () => buscar(),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Saúde do sistema</h1>
          <p className="text-sm text-muted-foreground">
            Estado das sincronizações e qualidade das informações do funil.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" asChild>
            <Link to="/precos">Valores por empreendimento</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link to="/pipeline">Voltar ao funil</Link>
          </Button>
        </div>
      </header>

      {isLoading && <p className="mt-8 text-sm text-muted-foreground">Carregando...</p>}

      {data && (
        <>
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <CardSync titulo="Sincronização C2S" s={data.c2s} falhas={data.c2s_falhas_24h} />
            <CardSync titulo="Sincronização da agenda" s={data.agenda} falhas={data.agenda_falhas_24h} />
          </section>

          <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador rotulo="Leads no sistema" valor={data.leads_total} />
            <Indicador rotulo="Movimentações (24 h)" valor={data.movimentacoes_24h} />
            <Indicador
              rotulo="Sem corretor"
              valor={data.leads_sem_corretor}
              alerta={data.leads_sem_corretor > 0}
            />
            <Indicador
              rotulo="Sem valor"
              valor={data.leads_sem_valor}
              alerta={data.leads_sem_valor > 0}
              detalhe="Cadastre o valor do empreendimento"
            />
            <Indicador
              rotulo="Sem telefone"
              valor={data.leads_sem_telefone}
              alerta={data.leads_sem_telefone > 0}
            />
            <Indicador
              rotulo="Lead novo parado (+1 dia)"
              valor={data.leads_novos_parados}
              alerta={data.leads_novos_parados > 0}
            />
            <Indicador
              rotulo="Telefones repetidos"
              valor={data.telefones_duplicados}
              alerta={data.telefones_duplicados > 0}
              detalhe="Mesmo número em mais de um lead"
            />
          </section>
        </>
      )}
    </main>
  );
}
