import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AgendaConfigStatus = {
  isGestor: boolean;
  configurado: boolean;
  origem: "tela" | "ambiente" | null;
  segredoMascarado: string | null;
  baseUrl: string;
  caminho: string;
  atualizadoEm: string | null;
};

export const getAgendaConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AgendaConfigStatus> => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });

    const {
      segredoAgenda,
      lerConfig,
      mascarar,
      AGENDA_BASE_URL_KEY,
      AGENDA_PATH_KEY,
      AGENDA_SECRET_KEY,
    } = await import("./integration-settings.server");

    const { valor, origem } = await segredoAgenda();
    const baseUrl = (await lerConfig(AGENDA_BASE_URL_KEY)) ?? "https://crmfortal.lovable.app";
    const caminho = (await lerConfig(AGENDA_PATH_KEY)) ?? "/api/public/export-agendamentos";

    let atualizadoEm: string | null = null;
    if (origem === "tela") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await supabaseAdmin
        .from("integration_settings")
        .select("atualizado_em")
        .eq("chave", AGENDA_SECRET_KEY)
        .maybeSingle();
      atualizadoEm = (data as { atualizado_em?: string } | null)?.atualizado_em ?? null;
    }

    return {
      isGestor: Boolean(isGestor),
      configurado: Boolean(valor),
      origem,
      segredoMascarado: mascarar(valor),
      baseUrl,
      caminho,
      atualizadoEm,
    };
  });

const salvarSchema = z
  .object({
    segredo: z.string().trim().min(8, "O segredo precisa ter pelo menos 8 caracteres").max(512),
    confirmacao: z.string().trim().min(1, "Confirme o segredo"),
    baseUrl: z
      .string()
      .trim()
      .url("URL base inválida")
      .max(300)
      .default("https://crmfortal.lovable.app"),
    caminho: z
      .string()
      .trim()
      .max(200)
      .regex(/^\/[\w\-./]*$/, "O caminho precisa começar com /")
      .default("/api/public/export-agendamentos"),
  })
  .refine((v) => v.segredo === v.confirmacao, {
    message: "Os dois campos do segredo não são iguais",
    path: ["confirmacao"],
  });

async function garantirGestor(context: { supabase: any; userId: string }) {
  const { data: isGestor } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "gestor",
  });
  if (!isGestor) throw new Error("Apenas gestores podem alterar a integração da agenda");
}

export const salvarAgendaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => salvarSchema.parse(data))
  .handler(async ({ data, context }) => {
    await garantirGestor(context);

    const { gravarConfig, AGENDA_SECRET_KEY, AGENDA_BASE_URL_KEY, AGENDA_PATH_KEY } = await import(
      "./integration-settings.server"
    );
    await gravarConfig(AGENDA_SECRET_KEY, data.segredo, context.userId);
    await gravarConfig(AGENDA_BASE_URL_KEY, data.baseUrl.replace(/\/+$/, ""), context.userId);
    await gravarConfig(AGENDA_PATH_KEY, data.caminho, context.userId);

    // Valida na hora contra o app de agendamentos.
    const { fetchAgendamentos } = await import("./agenda.server");
    try {
      const agendamentos = await fetchAgendamentos();
      return {
        ok: true as const,
        validado: true as const,
        total: agendamentos.length,
        mensagem: `Segredo salvo e validado — ${agendamentos.length} agendamentos visíveis.`,
      };
    } catch (e) {
      return {
        ok: true as const,
        validado: false as const,
        total: 0,
        mensagem: `Segredo salvo, mas a agenda recusou: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  });

export const testarAgendaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await garantirGestor(context);
    const { fetchAgendamentos } = await import("./agenda.server");
    const agendamentos = await fetchAgendamentos();
    return { total: agendamentos.length };
  });

export const limparAgendaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await garantirGestor(context);
    const { apagarConfig, AGENDA_SECRET_KEY } = await import("./integration-settings.server");
    await apagarConfig(AGENDA_SECRET_KEY);
    return { ok: true as const };
  });
