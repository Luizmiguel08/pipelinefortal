import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAgendaConfig,
  salvarAgendaConfig,
  testarAgendaConfig,
  limparAgendaConfig,
} from "@/lib/agenda-config.functions";

export const Route = createFileRoute("/_authenticated/configuracoes-agenda")({
  head: () => ({
    meta: [
      { title: "Configurações da agenda | Fortal Pipeline" },
      {
        name: "description",
        content:
          "Defina e valide com segurança o segredo de sincronização com o Agendamento Pro usado pelo Fortal Pipeline.",
      },
      { property: "og:title", content: "Configurações da agenda | Fortal Pipeline" },
      {
        property: "og:description",
        content: "Segredo compartilhado, URL e validação da integração com a agenda de visitas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConfiguracoesAgendaPage,
});

function ConfiguracoesAgendaPage() {
  const queryClient = useQueryClient();
  const fetchConfig = useServerFn(getAgendaConfig);
  const salvar = useServerFn(salvarAgendaConfig);
  const testar = useServerFn(testarAgendaConfig);
  const limpar = useServerFn(limparAgendaConfig);

  const { data: config } = useQuery({
    queryKey: ["agenda-config"],
    queryFn: () => fetchConfig(),
  });

  const [segredo, setSegredo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [caminho, setCaminho] = useState("");

  const urlAtual = baseUrl || config?.baseUrl || "https://crmfortal.lovable.app";
  const caminhoAtual = caminho || config?.caminho || "/api/public/export-agendamentos";

  const divergente = confirmacao.length > 0 && segredo !== confirmacao;
  const curto = segredo.length > 0 && segredo.trim().length < 8;
  const podeSalvar =
    Boolean(config?.isGestor) && segredo.trim().length >= 8 && segredo === confirmacao;

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ["agenda-config"] });

  const salvarMut = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          segredo: segredo.trim(),
          confirmacao: confirmacao.trim(),
          baseUrl: urlAtual.trim(),
          caminho: caminhoAtual.trim(),
        },
      }),
    onSuccess: (r) => {
      setSegredo("");
      setConfirmacao("");
      invalidar();
      if (r.validado) toast.success(r.mensagem);
      else toast.warning(r.mensagem);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const testarMut = useMutation({
    mutationFn: () => testar(),
    onSuccess: (r) =>
      toast.success(`Conexão OK — ${r.total} agendamentos disponíveis no Agendamento Pro`),
    onError: (e: Error) => toast.error(e.message),
  });

  const limparMut = useMutation({
    mutationFn: () => limpar(),
    onSuccess: () => {
      invalidar();
      toast.success("Segredo removido do cofre");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link to="/integracao" className="text-sm text-muted-foreground hover:text-foreground">
        ← Voltar à integração
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Configurações da agenda</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        O segredo precisa ter exatamente o mesmo valor aqui e no campo{" "}
        <span className="font-mono">SYNC_SHARED_SECRET</span> do projeto Agendamento Pro. Ele fica
        guardado no servidor, nunca volta para o navegador e só é usado na hora da sincronização.
      </p>

      <div className="panel mt-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              backgroundColor: config?.configurado ? "var(--stage-fechamento)" : "var(--muted)",
              color: config?.configurado ? "var(--primary-foreground)" : "var(--muted-foreground)",
            }}
          >
            {config?.configurado ? "Segredo configurado" : "Segredo pendente"}
          </span>
          <span className="font-mono text-sm text-muted-foreground">
            {config?.segredoMascarado ?? "não informado"}
          </span>
          {config?.origem && (
            <span className="text-xs text-muted-foreground">
              origem: {config.origem === "tela" ? "salvo nesta tela" : "variável de ambiente"}
            </span>
          )}
          {config?.atualizadoEm && (
            <span className="text-xs text-muted-foreground">
              atualizado em {new Date(config.atualizadoEm).toLocaleString("pt-BR")}
            </span>
          )}
        </div>
      </div>

      <form
        className="panel mt-4 space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (podeSalvar) salvarMut.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">AGENDA_SYNC_SECRET</h2>

        <div className="space-y-1.5">
          <Label htmlFor="segredo">Segredo</Label>
          <Input
            id="segredo"
            type={mostrar ? "text" : "password"}
            autoComplete="new-password"
            placeholder="cole aqui o mesmo valor do Agendamento Pro"
            value={segredo}
            maxLength={512}
            onChange={(e) => setSegredo(e.target.value)}
          />
          {curto && (
            <p className="text-xs text-destructive">Use pelo menos 8 caracteres.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirmacao">Confirmar segredo</Label>
          <Input
            id="confirmacao"
            type={mostrar ? "text" : "password"}
            autoComplete="new-password"
            placeholder="repita o valor"
            value={confirmacao}
            maxLength={512}
            onChange={(e) => setConfirmacao(e.target.value)}
          />
          {divergente && (
            <p className="text-xs text-destructive">Os dois campos precisam ser idênticos.</p>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={mostrar}
            onChange={(e) => setMostrar(e.target.checked)}
          />
          Mostrar o que estou digitando
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="baseUrl">URL do Agendamento Pro</Label>
            <Input
              id="baseUrl"
              value={urlAtual}
              maxLength={300}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="caminho">Rota de exportação</Label>
            <Input
              id="caminho"
              value={caminhoAtual}
              maxLength={200}
              onChange={(e) => setCaminho(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!podeSalvar || salvarMut.isPending}>
            {salvarMut.isPending ? "Salvando e validando..." : "Salvar e validar"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!config?.isGestor || !config?.configurado || testarMut.isPending}
            onClick={() => testarMut.mutate()}
          >
            {testarMut.isPending ? "Testando..." : "Testar conexão"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!config?.isGestor || config?.origem !== "tela" || limparMut.isPending}
            onClick={() => limparMut.mutate()}
          >
            Remover segredo
          </Button>
        </div>

        {!config?.isGestor && (
          <p className="text-xs text-muted-foreground">
            Somente gestores podem alterar ou validar o segredo da agenda.
          </p>
        )}
      </form>

      <ol className="mt-4 space-y-1 text-sm text-muted-foreground">
        <li>1. No Agendamento Pro, defina o SYNC_SHARED_SECRET com um valor forte.</li>
        <li>2. Cole o mesmo valor nos dois campos acima e clique em “Salvar e validar”.</li>
        <li>3. Se a validação passar, a sincronização automática (a cada 1 minuto) volta a rodar.</li>
      </ol>
    </div>
  );
}
