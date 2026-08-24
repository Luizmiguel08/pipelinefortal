import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STAGE_IDS, type StageId } from "./stages";

export type BoardLead = {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  imovel: string | null;
  valor: number;
  stage: StageId;
  corretor_id: string | null;
  origem: string | null;
  observacoes: string | null;
  ultima_interacao: string | null;
  c2s_contact_id: string | null;
};

export type BoardCorretor = {
  id: string;
  nome: string;
  email: string | null;
  c2s_agent_id: string | null;
};

export type Board = {
  isGestor: boolean;
  nome: string;
  corretores: BoardCorretor[];
  leads: BoardLead[];
};

export const getBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Board> => {
    const { supabase, userId } = context;

    const [{ data: roles }, { data: profile }, { data: corretores }, { data: leads }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
      supabase.from("corretores").select("id, nome, email, c2s_agent_id").order("nome"),
      supabase
        .from("leads")
        .select(
          "id, nome, telefone, email, imovel, valor, stage, corretor_id, origem, observacoes, ultima_interacao, c2s_contact_id",
        )
        .order("updated_at", { ascending: false }),
    ]);

    return {
      isGestor: (roles ?? []).some((r) => r.role === "gestor"),
      nome: profile?.nome ?? "",
      corretores: (corretores ?? []) as BoardCorretor[],
      leads: ((leads ?? []) as BoardLead[]).map((l) => ({ ...l, valor: Number(l.valor) })),
    };
  });

export const moveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; stage: StageId }) => {
    if (!input?.id || !STAGE_IDS.includes(input.stage)) throw new Error("Dados inválidos");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ stage: data.stage, ultima_interacao: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string | undefined;
      nome: string;
      telefone?: string | undefined;
      email?: string | undefined;
      imovel?: string | undefined;
      valor: number;
      stage: StageId;
      corretor_id: string | null;
      observacoes?: string | undefined;
    }) => {

      if (!input?.nome?.trim()) throw new Error("Informe o nome do cliente");
      if (!STAGE_IDS.includes(input.stage)) throw new Error("Etapa inválida");
      return input;
    },
  )
  .handler(async ({ data, context }) => {
    const payload = {
      nome: data.nome.trim(),
      telefone: data.telefone ?? null,
      email: data.email ?? null,
      imovel: data.imovel ?? null,
      valor: Number(data.valor) || 0,
      stage: data.stage,
      corretor_id: data.corretor_id,
      observacoes: data.observacoes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase.from("leads").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: created, error } = await context.supabase
      .from("leads")
      .insert({ ...payload, origem: "Manual", ultima_interacao: new Date().toISOString() })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: created.id };
  });

export const getIntegrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    const { data: ultimo } = await context.supabase
      .from("leads")
      .select("last_synced_at")
      .not("last_synced_at", "is", null)
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      isGestor: !!isGestor,
      configurado: !!process.env["C2S_API_BASE_URL"] && !!process.env["C2S_API_TOKEN"],
      ultimaSincronizacao: ultimo?.last_synced_at ?? null,
    };
  });

export const syncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Error("Apenas gestores podem disparar a sincronização.");
    const { runC2SSync } = await import("./c2s-sync.server");
    return await runC2SSync();
  });
