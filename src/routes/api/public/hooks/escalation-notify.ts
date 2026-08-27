import { createFileRoute } from "@tanstack/react-router";

/**
 * Dispara os avisos de leads escalonados para "Não Respondeu" e "Dia 1".
 * Protegido pela apikey do projeto (usada pelo pg_cron).
 */
export const Route = createFileRoute("/api/public/hooks/escalation-notify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const esperada =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        if (!esperada || apikey !== esperada) {
          return new Response(JSON.stringify({ error: "Não autorizado" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        try {
          const { notificarEscalonamentos } = await import("@/lib/escalation-notify.server");
          return Response.json(await notificarEscalonamentos());
        } catch (error) {
          console.error("Falha ao notificar escalonamentos", error);
          return new Response(
            JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Erro" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
