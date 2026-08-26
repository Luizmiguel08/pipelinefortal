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
  vinculados_c2s: number;
  nao_encontrados_c2s: number;
  corretores_nao_reconhecidos: number;
};

export const getAgendaRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgendaRun[]> => {
    const { data, error } = await context.supabase
      .from("agenda_sync_runs")
      .select("id, started_at, finished_at, status, origem, total, criados, atualizados, erro, vinculados_c2s, nao_encontrados_c2s, corretores_nao_reconhecidos")
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
    // A execução manual relê todo o histórico. O endpoint da agenda interpreta
    // o parâmetro de data como "alterado desde", não como data da visita.
    return await runAgendaSync("manual", null, true);
  });
