import { memo } from "react";
import { formatBRL, relativeTime } from "@/lib/stages";
import type { BoardLead } from "@/lib/crm.functions";

type Props = {
  lead: BoardLead;
  corretorNome?: string | undefined;
  showCorretor: boolean;
  onOpen: (lead: BoardLead) => void;
  onDragStart: (lead: BoardLead) => void;
};

function LeadCardBase({ lead, corretorNome, showCorretor, onOpen, onDragStart }: Props) {
  return (
    <article
      draggable
      onDragStart={() => onDragStart(lead)}
      onClick={() => onOpen(lead)}
      className="group cursor-grab rounded-lg border border-border bg-card p-3 transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[var(--shadow-lift)] active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-tight">{lead.nome}</h4>
        <span className="shrink-0 text-sm font-semibold text-primary">{formatBRL(lead.valor)}</span>
      </div>
      {lead.imovel && <p className="mt-1 text-xs text-muted-foreground">{lead.imovel}</p>}
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
