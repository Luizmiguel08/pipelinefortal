import { useEffect, useState } from "react";
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
