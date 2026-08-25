import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STAGES, type StageId } from "@/lib/stages";
import type { BoardCorretor, BoardLead } from "@/lib/crm.functions";
import {
  getLigacoesDoLead,
  registrarLigacao,
  type CallPeriodo,
  type CallResultado,
} from "@/lib/calls.functions";

const RESULTADOS: { value: CallResultado; label: string }[] = [
  { value: "nao_atendeu", label: "Não atendeu" },
  { value: "atendeu", label: "Atendeu" },
  { value: "caixa_postal", label: "Caixa postal" },
  { value: "numero_invalido", label: "Número inválido" },
  { value: "whatsapp", label: "Respondeu no WhatsApp" },
];

function periodoAtual(): CallPeriodo {
  return new Date().getHours() < 12 ? "manha" : "tarde";
}

function LigacoesLead({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const listar = useServerFn(getLigacoesDoLead);
  const registrar = useServerFn(registrarLigacao);

  const [periodo, setPeriodo] = useState<CallPeriodo>(periodoAtual);
  const [resultado, setResultado] = useState<CallResultado>("nao_atendeu");
  const [interessado, setInteressado] = useState<"" | "sim" | "nao">("");
  const [observacao, setObservacao] = useState("");

  const { data: ligacoes = [], isLoading } = useQuery({
    queryKey: ["ligacoes", leadId],
    queryFn: () => listar({ data: { leadId } }),
    staleTime: 30_000,
  });

  const salvar = useMutation({
    mutationFn: () =>
      registrar({
        data: {
          leadId,
          periodo,
          resultado,
          interessado: interessado === "" ? null : interessado === "sim",
          observacao,
        },
      }),
    onSuccess: () => {
      toast.success("Ligação registrada");
      setObservacao("");
      setInteressado("");
      queryClient.invalidateQueries({ queryKey: ["ligacoes", leadId] });
      queryClient.invalidateQueries({ queryKey: ["ligacoes-hoje"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hoje = new Date().toDateString();
  const deHoje = ligacoes.filter((l) => new Date(l.called_at).toDateString() === hoje);
  const manha = deHoje.some((l) => l.periodo === "manha");
  const tarde = deHoje.some((l) => l.periodo === "tarde");
  const atendeu = deHoje.some((l) => l.resultado === "atendeu");

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Ligações de hoje</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${manha ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
        >
          {manha ? "✓" : "○"} Manhã
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tarde ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}
        >
          {tarde ? "✓" : "○"} Tarde
        </span>
        {!atendeu && (!manha || !tarde) && (
          <span className="text-[11px] font-semibold text-destructive">
            Meta: 2 ligações por dia até o cliente atender
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <select
          aria-label="Período da ligação"
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value as CallPeriodo)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="manha">Manhã</option>
          <option value="tarde">Tarde</option>
        </select>
        <select
          aria-label="Resultado da ligação"
          value={resultado}
          onChange={(e) => setResultado(e.target.value as CallResultado)}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {RESULTADOS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Interesse do cliente"
          value={interessado}
          onChange={(e) => setInteressado(e.target.value as "" | "sim" | "nao")}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">Interesse: não informado</option>
          <option value="sim">Tem interesse</option>
          <option value="nao">Sem interesse</option>
        </select>
      </div>

      <Input
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        placeholder="Observação da ligação (opcional)"
        className="h-9"
      />

      <Button
        size="sm"
        className="w-full"
        onClick={() => salvar.mutate()}
        disabled={salvar.isPending}
      >
        {salvar.isPending ? "Registrando..." : "Registrar ligação"}
      </Button>

      <div className="space-y-1">
        {isLoading && <p className="text-xs text-muted-foreground">Carregando histórico...</p>}
        {!isLoading && ligacoes.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma ligação registrada ainda.</p>
        )}
        {ligacoes.slice(0, 8).map((l) => (
          <p key={l.id} className="text-[11px] text-muted-foreground">
            {new Date(l.called_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ·{" "}
            {l.periodo === "manha" ? "Manhã" : "Tarde"} ·{" "}
            {RESULTADOS.find((r) => r.value === l.resultado)?.label ?? l.resultado}
            {l.interessado === true && " · com interesse"}
            {l.interessado === false && " · sem interesse"}
            {l.observacao ? ` · ${l.observacao}` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}


export type LeadFormValues = {
  id?: string;
  nome: string;
  telefone: string;
  email: string;
  imovel: string;
  valor: number;
  stage: StageId;
  corretor_id: string | null;
  observacoes: string;
  entrada: number;
  finalidade: "moradia" | "investimento" | null;
  estagio_imovel: "pronto" | "planta" | null;
  documentacao_ok: boolean;
};

const empty: LeadFormValues = {
  nome: "",
  telefone: "",
  email: "",
  imovel: "",
  valor: 0,
  stage: "novo",
  corretor_id: null,
  observacoes: "",
  entrada: 0,
  finalidade: null,
  estagio_imovel: null,
  documentacao_ok: false,
};

export function LeadDialog({
  open,
  lead,
  corretores,
  defaultCorretorId,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  lead: BoardLead | null;
  corretores: BoardCorretor[];
  defaultCorretorId: string | null;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (values: LeadFormValues) => void;
}) {
  const [values, setValues] = useState<LeadFormValues>(empty);

  useEffect(() => {
    if (!open) return;
    setValues(
      lead
        ? {
            id: lead.id,
            nome: lead.nome,
            telefone: lead.telefone ?? "",
            email: lead.email ?? "",
            imovel: lead.imovel ?? "",
            valor: lead.valor,
            stage: lead.stage,
            corretor_id: lead.corretor_id,
            observacoes: lead.observacoes ?? "",
            entrada: lead.entrada ?? 0,
            finalidade: lead.finalidade ?? null,
            estagio_imovel: lead.estagio_imovel ?? null,
            documentacao_ok: Boolean(lead.documentacao_ok),
          }
        : { ...empty, corretor_id: defaultCorretorId },
    );
  }, [open, lead, defaultCorretorId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? "Editar lead" : "Novo lead"}</DialogTitle>
          <DialogDescription>
            {lead?.c2s_contact_id
              ? `Sincronizado com o C2S (contato ${lead.c2s_contact_id}).`
              : "Cadastro manual — leads do C2S entram automaticamente."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="lead-nome">Cliente</Label>
            <Input
              id="lead-nome"
              value={values.nome}
              onChange={(e) => setValues({ ...values, nome: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-tel">Telefone</Label>
              <Input
                id="lead-tel"
                value={values.telefone}
                onChange={(e) => setValues({ ...values, telefone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-email">E-mail</Label>
              <Input
                id="lead-email"
                value={values.email}
                onChange={(e) => setValues({ ...values, email: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-imovel">Imóvel de interesse</Label>
            <Input
              id="lead-imovel"
              value={values.imovel}
              onChange={(e) => setValues({ ...values, imovel: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-valor">Valor da negociação (R$)</Label>
              <Input
                id="lead-valor"
                type="number"
                min={0}
                step={1000}
                value={values.valor}
                onChange={(e) => setValues({ ...values, valor: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-stage">Etapa</Label>
              <select
                id="lead-stage"
                value={values.stage}
                onChange={(e) => setValues({ ...values, stage: e.target.value as StageId })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-entrada">Valor de entrada (R$)</Label>
              <Input
                id="lead-entrada"
                type="number"
                min={0}
                step={1000}
                value={values.entrada}
                onChange={(e) => setValues({ ...values, entrada: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-finalidade">Finalidade</Label>
              <select
                id="lead-finalidade"
                value={values.finalidade ?? ""}
                onChange={(e) =>
                  setValues({
                    ...values,
                    finalidade: (e.target.value || null) as LeadFormValues["finalidade"],
                  })
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Não informado</option>
                <option value="moradia">Moradia</option>
                <option value="investimento">Investimento</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-estagio-imovel">Imóvel pronto ou na planta</Label>
            <select
              id="lead-estagio-imovel"
              value={values.estagio_imovel ?? ""}
              onChange={(e) =>
                setValues({
                  ...values,
                  estagio_imovel: (e.target.value || null) as LeadFormValues["estagio_imovel"],
                })
              }
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Não informado</option>
              <option value="pronto">Pronto</option>
              <option value="planta">Na planta</option>
            </select>
          </div>

          <label
            htmlFor="lead-doc"
            className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3"
          >
            <input
              id="lead-doc"
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
              checked={values.documentacao_ok}
              onChange={(e) =>
                setValues({
                  ...values,
                  documentacao_ok: e.target.checked,
                  stage:
                    e.target.checked && values.stage !== "documentacao" && values.stage !== "fechamento"
                      ? "documentacao"
                      : values.stage,
                })
              }
            />
            <span className="text-sm">
              <span className="font-medium">Documentação recebida</span>
              <span className="block text-xs text-muted-foreground">
                Ao marcar, o lead é movido automaticamente para a coluna Documentação.
              </span>
            </span>
          </label>

          <div className="space-y-2">
            <Label htmlFor="lead-corretor">Corretor responsável</Label>
            <select
              id="lead-corretor"
              value={values.corretor_id ?? ""}
              onChange={(e) => setValues({ ...values, corretor_id: e.target.value || null })}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Sem responsável</option>
              {corretores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="lead-obs">Observações</Label>
            <Textarea
              id="lead-obs"
              rows={3}
              value={values.observacoes}
              onChange={(e) => setValues({ ...values, observacoes: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => onSave(values)} disabled={saving}>
            {saving ? "Salvando..." : "Salvar lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
