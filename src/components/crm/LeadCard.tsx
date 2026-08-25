import { memo } from "react";
import { alertaSLA, formatBRL, formatRestante, relativeTime } from "@/lib/stages";
import type { BoardLead } from "@/lib/crm.functions";
import type { ResumoLigacoes } from "@/lib/calls.functions";

type Props = {
  lead: BoardLead;
  corretorNome?: string | undefined;
  showCorretor: boolean;
  agora: number;
  ligacoes?: ResumoLigacoes | undefined;
  onOpen: (lead: BoardLead) => void;
  onDragStart: (lead: BoardLead) => void;
};

function LeadCardBase({ lead, corretorNome, showCorretor, agora, ligacoes, onOpen, onDragStart }: Props) {
  const sla = alertaSLA(lead.stage, lead.stage_since, lead.ultima_interacao, agora);
  const emAlerta = sla?.alerta ?? false;
  const manha = (ligacoes?.manha ?? 0) > 0;
  const tarde = (ligacoes?.tarde ?? 0) > 0;
  const atendeu = ligacoes?.atendeu ?? false;
  const metaLigacoes = !atendeu && (!manha || !tarde);
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

      {/* Meta de contato: 2 ligações por dia (manhã e tarde) até o cliente atender. */}
      <div className="mt-2 flex items-center gap-1.5 text-[11px]">
        <span className="text-muted-foreground">☎ hoje</span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            manha ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {manha ? "✓" : "○"} Manhã
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            tarde ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {tarde ? "✓" : "○"} Tarde
        </span>
        {atendeu ? (
          <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 font-medium text-primary">
            Atendeu
          </span>
        ) : (
          metaLigacoes && (
            <span className="ml-auto font-semibold text-destructive">
              {2 - (manha ? 1 : 0) - (tarde ? 1 : 0)} ligação(ões)
            </span>
          )
        )}
      </div>

      {lead.imovel && <p className="mt-1 text-xs text-muted-foreground">{lead.imovel}</p>}

      {(lead.entrada > 0 || lead.finalidade || lead.estagio_imovel || lead.documentacao_ok) && (
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

