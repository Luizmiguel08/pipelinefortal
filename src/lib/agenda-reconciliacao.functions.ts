import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ReconResultado } from "./agenda-reconciliacao.server";

export type { ReconLinha, ReconResultado } from "./agenda-reconciliacao.server";

export const runAgendaReconciliacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dias?: number } | undefined) => ({
    dias: Math.min(Math.max(Math.round(input?.dias ?? 7), 1), 90),
  }))
  .handler(async ({ data, context }): Promise<ReconResultado> => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Error("Apenas gestores podem rodar a reconciliação da agenda.");

    const { reconciliarAgenda } = await import("./agenda-reconciliacao.server");
    return reconciliarAgenda(data.dias);
  });
