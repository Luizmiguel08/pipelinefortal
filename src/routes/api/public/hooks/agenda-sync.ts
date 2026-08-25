import { createFileRoute } from "@tanstack/react-router";

/**
 * Sincronização agendada com o app de agendamentos.
 * Protegido pela apikey do projeto (usada pelo pg_cron).
 * Também aceita chamadas do próprio app de agenda via webhook (POST com x-sync-secret).
 */
export const Route = createFileRoute("/api/public/hooks/agenda-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Aceita autenticação via apikey (pg_cron) OU via x-sync-secret / Authorization (webhook do app de agenda)
        const apikey = request.headers.get("apikey");
        const syncSecret = request.headers.get("x-sync-secret");
        const authHeader = request.headers.get("authorization");
        const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

        const expectedApikey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        const expectedSecret = process.env["AGENDA_SYNC_SECRET"];

        const autenticado =
          (expectedApikey && apikey === expectedApikey) ||
          (expectedSecret && syncSecret === expectedSecret) ||
          (expectedSecret && bearerToken === expectedSecret);

        if (!autenticado) {
          return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let desde: string | undefined;
        try {
          const body = (await request.clone().json()) as { desde?: string; de?: string } | null;
          if (body?.desde) desde = body.desde;
          else if (body?.de) desde = body.de;
        } catch {
          desde = undefined;
        }

        try {
          const { runAgendaSync } = await import("@/lib/agenda-sync.server");
          const result = await runAgendaSync("automatico", desde);
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("Falha na sincronização da agenda", error);
          return new Response(
            JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Erro" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
