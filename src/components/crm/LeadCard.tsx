import { memo } from "react";
import { alertaSLA, formatBRL, formatRestante, relativeTime } from "@/lib/stages";
import type { BoardLead } from "@/lib/crm.functions";

type Props = {
  lead: BoardLead;
  corretorNome?: string | undefined;
  showCorretor: boolean;
  agora: number;
  onOpen: (lead: BoardLead) => void;
  onDragStart: (lead: BoardLead) => void;
};

function LeadCardBase({ lead, corretorNome, showCorretor, agora, onOpen, onDragStart }: Props) {
  const sla = alertaSLA(lead.stage, lead.stage_since, lead.ultima_interacao, agora);
  const emAlerta = sla?.alerta ?? false;
  return (
    <article
      draggable
      onDragStart={() => onDragStart(lead)}
      onClick={() => onOpen(lead)}
      className={`group cursor-grab rounded-lg border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] active:cursor-grabbing ${
        emAlerta ? "lead-alerta border-destructive" : "border-border hover:border-primary/50"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-tight">{lead.nome}</h4>
        <span className="shrink-0 text-sm font-semibold text-primary">{formatBRL(lead.valor)}</span>
      </div>
      {sla && emAlerta && (
        <p className="mt-1 text-[11px] font-semibold text-destructive">
          ⚠ {formatRestante(sla.restanteMs)} nesta etapa
        </p>
      )}

      {lead.imovel && <p className="mt-1 text-xs text-muted-foreground">{lead.imovel}</p>}

      {(lead.entrada > 0 ||
        lead.finalidade ||
        lead.estagio_imovel ||
        lead.documentacao_ok ||
        lead.visita_em ||
        lead.visita_realizada) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {lead.entrada > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              Entrada {formatBRL(lead.entrada)}
            </span>
          )}
          {lead.finalidade && (
            <span className="rounded-full bg-muted px-2 py-0.5 capitalize text-muted-foreground">
              {lead.finalidade}
            </span>
          )}
          {lead.estagio_imovel && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {lead.estagio_imovel === "pronto" ? "Pronto" : "Na planta"}
            </span>
          )}
          {lead.visita_em && !lead.visita_realizada && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              Visita {new Date(lead.visita_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {lead.visita_realizada && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              Visita realizada
            </span>
          )}
          {lead.documentacao_ok && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
              Documentação OK
            </span>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {showCorretor && corretorNome && (
          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
            {corretorNome}
          </span>
        )}
        {lead.origem && <span className="rounded-full bg-muted px-2 py-0.5">{lead.origem}</span>}
        <span className="ml-auto">{relativeTime(lead.ultima_interacao)}</span>
      </div>
    </article>
  );
}

export const LeadCard = memo(LeadCardBase);

