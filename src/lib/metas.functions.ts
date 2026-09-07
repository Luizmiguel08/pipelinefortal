import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Meta = {
  corretor_id: string;
  mes: string;
  meta_leads: number;
  meta_valor: number;
};

/** Primeiro dia do mês (YYYY-MM-01) a partir de "YYYY-MM" ou de uma data ISO. */
export function primeiroDiaDoMes(valor?: string | null): string {
  const base = valor && valor.length >= 7 ? valor.slice(0, 7) : new Date().toISOString().slice(0, 7);
  return `${base}-01`;
}

export const getMetas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { mes?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<{ mes: string; metas: Meta[] }> => {
    const mes = primeiroDiaDoMes(data.mes);
    const { data: linhas, error } = await context.supabase
      .from("metas_corretores")
      .select("corretor_id, mes, meta_leads, meta_valor")
      .eq("mes", mes);
    if (error) throw new Error(error.message);
    return {
      mes,
      metas: (linhas ?? []).map((m) => ({
        corretor_id: m.corretor_id,
        mes: m.mes,
        meta_leads: Number(m.meta_leads ?? 0),
        meta_valor: Number(m.meta_valor ?? 0),
      })),
    };
  });

export const salvarMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { corretor_id: string; mes: string; meta_leads: number; meta_valor: number }) => input,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("metas_corretores").upsert(
      {
        corretor_id: data.corretor_id,
        mes: primeiroDiaDoMes(data.mes),
        meta_leads: Math.max(0, Math.round(Number(data.meta_leads) || 0)),
        meta_valor: Math.max(0, Number(data.meta_valor) || 0),
      },
      { onConflict: "corretor_id,mes" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
