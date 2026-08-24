import { createFileRoute } from "@tanstack/react-router";

/**
 * Endpoint para sincronização agendada com o C2S.
 * Protegido pela apikey do projeto.
 */
export const Route = createFileRoute("/api/public/hooks/c2s-sync")({
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

        try {
          const { runC2SSync } = await import("@/lib/c2s-sync.server");
          const result = await runC2SSync("automatico");
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("Falha na sincronização C2S", error);
          return new Response(
            JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Erro" }),
            { status: 500, headers: { "content-type": "application/json" } },
          );
        }
      },
    },
  },
});
