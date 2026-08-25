import { createFileRoute } from "@tanstack/react-router";

/**
 * Sincronização agendada com o app de agendamentos.
 * Protegido pela apikey do projeto (usada pelo pg_cron).
 */
export const Route = createFileRoute("/api/public/hooks/agenda-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!expected || apikey !== expected) {
          return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        let desde: string | undefined;
        try {
          const body = (await request.clone().json()) as { desde?: string } | null;
          if (body?.desde) desde = body.desde;
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
