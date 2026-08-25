import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CallPeriodo = "manha" | "tarde";
export type CallResultado = "atendeu" | "nao_atendeu" | "caixa_postal" | "numero_invalido" | "whatsapp";

export type ResumoLigacoes = { manha: number; tarde: number; atendeu: boolean };
/** Mapa leadId -> resumo das ligações de hoje. */
export type LigacoesHoje = Record<string, ResumoLigacoes>;

export type LigacaoRegistro = {
  id: string;
  called_at: string;
  periodo: CallPeriodo;
  resultado: CallResultado;
  interessado: boolean | null;
  observacao: string | null;
};

/** Início do dia atual no fuso de São Paulo, em ISO. */
function inicioDoDiaSP() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = partes.find((p) => p.type === "year")?.value;
  const m = partes.find((p) => p.type === "month")?.value;
  const d = partes.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}T00:00:00-03:00`;
}

export const getLigacoesHoje = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LigacoesHoje> => {
    const inicio = inicioDoDiaSP();
    const resumo: LigacoesHoje = {};
    const pagina = 1000;
    for (let offset = 0; ; offset += pagina) {
      const { data, error } = await context.supabase
        .from("lead_calls")
        .select("lead_id, periodo, resultado")
        .gte("called_at", inicio)
        .range(offset, offset + pagina - 1);
      if (error) throw new Error(error.message);
      const lote = data ?? [];
      for (const c of lote) {
        const atual = (resumo[c.lead_id] ??= { manha: 0, tarde: 0, atendeu: false });
        if (c.periodo === "manha") atual.manha += 1;
        else atual.tarde += 1;
        if (c.resultado === "atendeu") atual.atendeu = true;
      }
      if (lote.length < pagina) break;
    }
    return resumo;
  });

export const getLigacoesDoLead = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { leadId: string }) => {
    if (!input?.leadId) throw new Error("Lead inválido");
    return input;
  })
  .handler(async ({ data, context }): Promise<LigacaoRegistro[]> => {
    const { data: rows, error } = await context.supabase
      .from("lead_calls")
      .select("id, called_at, periodo, resultado, interessado, observacao")
      .eq("lead_id", data.leadId)
      .order("called_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []) as LigacaoRegistro[];
  });

export const registrarLigacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      leadId: string;
      periodo: CallPeriodo;
      resultado: CallResultado;
      interessado?: boolean | null | undefined;
      observacao?: string | undefined;
    }) => {
      if (!input?.leadId) throw new Error("Lead inválido");
      if (input.periodo !== "manha" && input.periodo !== "tarde") throw new Error("Período inválido");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: lead, error: erroLead } = await context.supabase
      .from("leads")
      .select("id, corretor_id")
      .eq("id", data.leadId)
      .maybeSingle();
    if (erroLead) throw new Error(erroLead.message);
    if (!lead) throw new Error("Lead não encontrado");

    const { error } = await context.supabase.from("lead_calls").insert({
      lead_id: data.leadId,
      corretor_id: lead.corretor_id,
      created_by: context.userId,
      periodo: data.periodo,
      resultado: data.resultado,
      interessado: data.interessado ?? null,
      observacao: data.observacao?.trim() ? data.observacao.trim() : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
