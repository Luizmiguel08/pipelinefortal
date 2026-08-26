import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AgendaRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  origem: string;
  total: number;
  criados: number;
  atualizados: number;
  erro: string | null;
};

export const getAgendaRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgendaRun[]> => {
    const { data, error } = await context.supabase
      .from("agenda_sync_runs")
      .select("id, started_at, finished_at, status, origem, total, criados, atualizados, erro")
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) return [];
    return (data ?? []) as AgendaRun[];
  });

export const syncAgenda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Error("Apenas gestores podem sincronizar a agenda");

    const { runAgendaSync } = await import("./agenda-sync.server");
    // A execução manual reprocessa o dia inteiro em São Paulo. Isso recupera
    // mudanças de status ocorridas durante uma falha temporária da rotina.
    const agora = new Date();
    const dataLocal = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora);
    return await runAgendaSync("manual", `${dataLocal}T00:00:00-03:00`);
  });
