import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuditResultado } from "./audit.server";

export type { AuditLinha, AuditResultado } from "./audit.server";

export const runAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dias?: number } | undefined) => {
    const dias = Math.min(Math.max(Math.round(input?.dias ?? 7), 1), 90);
    return { dias };
  })
  .handler(async ({ data, context }): Promise<AuditResultado> => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Error("Apenas gestores podem executar a auditoria.");

    const desde = new Date(Date.now() - data.dias * 24 * 60 * 60 * 1000).toISOString();
    const { auditarContagens } = await import("./audit.server");
    return auditarContagens(context.supabase, desde);
  });
