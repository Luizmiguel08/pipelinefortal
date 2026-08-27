import { memo } from "react";
import { alertaSLA, formatBRL, formatRestante, origemCard, progressoSLA, relativeTime, whatsappLink } from "@/lib/stages";
import type { BoardLead } from "@/lib/crm.functions";

function WhatsappIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

type Props = {
  lead: BoardLead;
  corretorNome?: string | undefined;
  showCorretor: boolean;
  agora: number;
  onOpen: (lead: BoardLead) => void;
  onDragStart: (lead: BoardLead) => void;
  onDragEnd?: () => void;
};

function LeadCardBase({ lead, corretorNome, showCorretor, agora, onOpen, onDragStart, onDragEnd }: Props) {
  const sla = alertaSLA(lead.stage, lead.stage_since, lead.ultima_interacao, agora);
  const emAlerta = sla?.alerta ?? false;
  const termometro = progressoSLA(lead.stage, lead.stage_since, lead.ultima_interacao, agora);
  const origem = origemCard(lead);
  const waLink = whatsappLink(lead.telefone);
  return (
    <article
      draggable
      onDragStart={() => onDragStart(lead)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(lead)}
      className={`group cursor-grab rounded-lg border bg-card p-3 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] active:cursor-grabbing ${
        emAlerta ? "lead-alerta border-destructive" : "border-border hover:border-primary/50"
      }`}
    >
      {termometro && (
        <div
          className="mb-2 h-1 w-full overflow-hidden rounded-full bg-muted"
          title={sla ? `SLA da etapa · ${formatRestante(sla.restanteMs)}` : undefined}
        >
          <div
            className={`h-full rounded-full transition-all ${
              termometro.nivel === "critico"
                ? "bg-destructive"
                : termometro.nivel === "atencao"
                  ? "bg-[oklch(0.78_0.16_75)]"
                  : "bg-[oklch(0.7_0.15_150)]"
            }`}
            style={{ width: `${Math.max(4, termometro.pct * 100)}%` }}
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
          <span>{lead.nome}</span>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir conversa no WhatsApp"
              aria-label={`Conversar com ${lead.nome} no WhatsApp`}
              onClick={(e) => e.stopPropagation()}
              onDragStart={(e) => e.preventDefault()}
              className="shrink-0 text-[oklch(0.7_0.18_150)] opacity-70 transition-opacity hover:opacity-100"
            >
              <WhatsappIcon size={15} />
            </a>
          )}
        </h4>
        <span className="shrink-0 text-sm font-semibold text-primary">{formatBRL(lead.valor)}</span>
      </div>
      {sla && emAlerta && (
        <p className="mt-1 text-[11px] font-semibold text-destructive">
          ⚠ {formatRestante(sla.restanteMs)} nesta etapa
        </p>
      )}

      {lead.imovel && <p className="mt-1 text-xs text-muted-foreground">{lead.imovel}</p>}
      {lead.agenda_record && (
        <p className={`mt-1 text-[11px] font-medium ${lead.encontrado_c2s ? "text-primary" : "text-destructive"}`}>
          {lead.encontrado_c2s ? "Contato encontrado no C2S" : "Não encontrado no C2S"}
        </p>
      )}
      {lead.agenda_record && !lead.corretor_id && (
        <p className="mt-1 text-[11px] font-medium text-destructive">
          Corretor não vinculado{lead.corretor_agenda_nome ? ` · ${lead.corretor_agenda_nome}` : ""}
        </p>
      )}

      {(lead.entrada > 0 ||
        lead.finalidade ||
        lead.estagio_imovel ||
        lead.documentacao_ok ||
        lead.visita_em ||
        lead.visita_realizada ||
        lead.visita_status) && (
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
          {lead.visita_status === "desmarcado" && (
            <span
              className="rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
              title={lead.visita_motivo ?? undefined}
            >
              Desmarcou{lead.visita_motivo ? ` · ${lead.visita_motivo}` : ""}
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
        <span
          className={`rounded-full px-2 py-0.5 font-medium ${
            origem.tone === "agenda"
              ? "bg-[oklch(0.95_0.05_260)] text-[oklch(0.45_0.15_260)]"
              : origem.tone === "c2s"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
          }`}
          title={lead.origem ? `Origem: ${lead.origem}` : `Registro vindo de ${origem.label}`}
        >
          {origem.label}
        </span>
        {lead.origem && <span className="rounded-full bg-muted px-2 py-0.5">{lead.origem}</span>}
        <span className="ml-auto">{relativeTime(lead.ultima_interacao)}</span>
      </div>
    </article>
  );
}

export const LeadCard = memo(LeadCardBase);
