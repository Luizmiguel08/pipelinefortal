import { useEffect, useMemo, useState } from "react";
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
import {
  STAGES,
  formatBRL,
  indicadoresPreenchidos,
  podeMoverPara,
  resolverEtapa,
  stageLabel,
  type StageId,
} from "@/lib/stages";
import { cn } from "@/lib/utils";
import type { BoardCorretor, BoardLead } from "@/lib/crm.functions";

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
  visita_em: string | null;
  visita_realizada: boolean;
  /** Salva exatamente na etapa escolhida, ignorando a automação por indicadores. */
  forcar_stage?: boolean;
  /** Card espelhado da Agenda: salva os indicadores sem alterar a etapa. */
  preservar_stage?: boolean;
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
  visita_em: null,
  visita_realizada: false,
};

/** timestamp ISO -> valor aceito por <input type="datetime-local"> (hora local). */
function paraInputLocal(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ATALHOS_VALOR = [200_000, 300_000, 500_000, 800_000, 1_000_000];
const ATALHOS_ENTRADA = [20_000, 50_000, 100_000, 200_000];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CampoValor({
  id,
  label,
  value,
  atalhos,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  atalhos: number[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1000}
        value={value || ""}
        placeholder="0"
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
      <div className="flex flex-wrap gap-1.5">
        {atalhos.map((v) => (
          <Chip key={v} active={value === v} onClick={() => onChange(value === v ? 0 : v)}>
            {formatBRL(v)}
          </Chip>
        ))}
      </div>
    </div>
  );
}

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
  const [maisCampos, setMaisCampos] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMaisCampos(false);
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
            visita_em: lead.visita_em ?? null,
            visita_realizada: Boolean(lead.visita_realizada),
          }
        : { ...empty, corretor_id: defaultCorretorId },
    );
  }, [open, lead, defaultCorretorId]);

  // Registro espelhado da Agenda: os campos ficam liberados, mas a etapa é da Agenda.
  const daAgenda = Boolean(lead?.agenda_record);
  const etapaFinal = useMemo(
    () => (daAgenda ? values.stage : resolverEtapa(values, values.stage)),
    [values, daAgenda],
  );
  const qualificado = indicadoresPreenchidos(values);
  const travado = daAgenda ? false : !podeMoverPara(etapaFinal, values);
  const set = (patch: Partial<LeadFormValues>) => setValues((v) => ({ ...v, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? lead.nome : "Novo lead"}</DialogTitle>
          <DialogDescription>
            {lead?.telefone ? `${lead.telefone} · ` : ""}
            {lead?.c2s_contact_id ? "Lead sincronizado do C2S." : "Cadastro manual."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          {/* Qualificação: preencher qualquer indicador já move o lead para Em atendimento */}
          <section className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Qualificação do lead</h3>
                <p className="text-xs text-muted-foreground">
                  Preencha pelo menos um indicador para mover o lead de etapa.
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                  qualificado
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {stageLabel(etapaFinal)}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <CampoValor
                id="lead-valor"
                label="Valor da negociação"
                value={values.valor}
                atalhos={ATALHOS_VALOR}
                onChange={(valor) => set({ valor })}
              />
              <CampoValor
                id="lead-entrada"
                label="Valor de entrada"
                value={values.entrada}
                atalhos={ATALHOS_ENTRADA}
                onChange={(entrada) => set({ entrada })}
              />
            </div>

            <div className="space-y-2">
              <Label>Finalidade</Label>
              <div className="flex flex-wrap gap-2">
                {(["moradia", "investimento"] as const).map((op) => (
                  <Chip
                    key={op}
                    active={values.finalidade === op}
                    onClick={() => set({ finalidade: values.finalidade === op ? null : op })}
                  >
                    {op === "moradia" ? "Moradia" : "Investimento"}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Imóvel</Label>
              <div className="flex flex-wrap gap-2">
                {(["pronto", "planta"] as const).map((op) => (
                  <Chip
                    key={op}
                    active={values.estagio_imovel === op}
                    onClick={() =>
                      set({ estagio_imovel: values.estagio_imovel === op ? null : op })
                    }
                  >
                    {op === "pronto" ? "Pronto" : "Na planta"}
                  </Chip>
                ))}
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
              <Label>Visita ao imóvel</Label>
              <p className="text-sm">
                {values.visita_realizada
                  ? "Visita realizada (Agenda)"
                  : values.visita_em
                    ? `Agendada para ${new Date(values.visita_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                    : "Sem agendamento na Agenda"}
              </p>
              <p className="text-xs text-muted-foreground">
                As colunas Agendado e Visita realizada são espelhadas do projeto Agenda. Faça o
                agendamento lá e o lead aparece aqui automaticamente.
              </p>
            </div>

            <label
              htmlFor="lead-doc"
              className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
            >
              <input
                id="lead-doc"
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]"
                checked={values.documentacao_ok}
                onChange={(e) => set({ documentacao_ok: e.target.checked })}
              />
              <span className="text-sm">
                <span className="font-medium">Documentação recebida</span>
                <span className="block text-xs text-muted-foreground">
                  Ao marcar, o lead vai para Documentação. Ao desmarcar, volta para Negociação.
                </span>
              </span>
            </label>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="lead-stage">Etapa</Label>
              <select
                id="lead-stage"
                disabled={daAgenda}
                value={values.stage}
                onChange={(e) => set({ stage: e.target.value as StageId })}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              {daAgenda && (
                <p className="text-xs text-muted-foreground">
                  Etapa controlada pelo projeto Agenda.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lead-corretor">Corretor responsável</Label>
              <select
                id="lead-corretor"
                value={values.corretor_id ?? ""}
                onChange={(e) => set({ corretor_id: e.target.value || null })}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="lead-obs">Observações</Label>
            <Textarea
              id="lead-obs"
              rows={3}
              placeholder="O que o cliente falou nessa conversa?"
              value={values.observacoes}
              onChange={(e) => set({ observacoes: e.target.value })}
            />
          </div>

          {/* Dados de cadastro ficam recolhidos: raramente mudam no dia a dia */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setMaisCampos((v) => !v)}
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              {maisCampos ? "Ocultar dados de cadastro" : "Editar dados de cadastro"}
            </button>
            {maisCampos && (
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lead-nome">Cliente</Label>
                  <Input
                    id="lead-nome"
                    value={values.nome}
                    onChange={(e) => set({ nome: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="lead-tel">Telefone</Label>
                    <Input
                      id="lead-tel"
                      value={values.telefone}
                      onChange={(e) => set({ telefone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lead-email">E-mail</Label>
                    <Input
                      id="lead-email"
                      value={values.email}
                      onChange={(e) => set({ email: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-imovel">Imóvel de interesse</Label>
                  <Input
                    id="lead-imovel"
                    value={values.imovel}
                    onChange={(e) => set({ imovel: e.target.value })}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={saving}
            onClick={() =>
              onSave({
                ...values,
                stage: "lista_fria",
                forcar_stage: true,
                observacoes: values.observacoes
                  ? `${values.observacoes}\nNúmero incorreto.`
                  : "Número incorreto.",
              })
            }
          >
            Número incorreto · Lista fria
          </Button>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            {travado && (
              <span className="text-xs text-destructive">
                Preencha um indicador para avançar este lead.
              </span>
            )}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSave(daAgenda ? { ...values, preservar_stage: true } : values)}
            disabled={saving || travado}
          >
            {saving ? "Salvando..." : `Salvar · ${stageLabel(etapaFinal)}`}
          </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
