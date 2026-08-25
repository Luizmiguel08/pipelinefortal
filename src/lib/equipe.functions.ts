import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EquipeCorretor = {
  id: string;
  nome: string;
  email: string | null;
  user_id: string | null;
  ativo: boolean;
  leads: number;
};

export type Equipe = {
  isGestor: boolean;
  corretores: EquipeCorretor[];
};

async function garantirGestor(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "gestor" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas gestores podem gerenciar a equipe.");
}

export const getEquipe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Equipe> => {
    const { supabase, userId } = context;
    await garantirGestor(supabase, userId);

    const { data: corretores, error } = await supabase
      .from("corretores")
      .select("id, nome, email, user_id, ativo")
      .order("nome");
    if (error) throw new Error(error.message);

    // Contagem de leads por corretor (paginada: o PostgREST devolve no máximo 1000 linhas).
    const contagem = new Map<string, number>();
    const pagina = 1000;
    for (let inicio = 0; ; inicio += pagina) {
      const { data: lote, error: erroLeads } = await supabase
        .from("leads")
        .select("corretor_id")
        .range(inicio, inicio + pagina - 1);
      if (erroLeads) throw new Error(erroLeads.message);
      for (const l of lote ?? []) {
        if (l.corretor_id) contagem.set(l.corretor_id, (contagem.get(l.corretor_id) ?? 0) + 1);
      }
      if ((lote ?? []).length < pagina) break;
    }

    return {
      isGestor: true,
      corretores: (corretores ?? []).map((c) => ({
        id: c.id,
        nome: c.nome,
        email: c.email,
        user_id: c.user_id,
        ativo: c.ativo,
        leads: contagem.get(c.id) ?? 0,
      })),
    };
  });

export const setCorretorEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; email: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await garantirGestor(supabase, userId);

    const email = data.email.trim().toLowerCase();
    if (!email || !email.includes("@")) throw new Error("Informe um e-mail válido.");

    const { error } = await supabase.from("corretores").update({ email }).eq("id", data.id);
    if (error) throw new Error(error.message);

    // Se o corretor já criou a conta antes do e-mail ser cadastrado, vinculamos na hora.
    const { data: perfil } = await supabase.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (perfil?.id) {
      await supabase.from("corretores").update({ user_id: perfil.id }).eq("id", data.id);
    }
    return { ok: true, vinculado: Boolean(perfil?.id) };
  });

/** Vincula contas já criadas aos corretores com o mesmo e-mail. */
export const vincularContas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await garantirGestor(supabase, userId);

    const { data: pendentes, error } = await supabase
      .from("corretores")
      .select("id, email")
      .is("user_id", null)
      .not("email", "is", null);
    if (error) throw new Error(error.message);

    const { data: perfis, error: erroPerfis } = await supabase.from("profiles").select("id, email");
    if (erroPerfis) throw new Error(erroPerfis.message);

    const porEmail = new Map<string, string>();
    for (const p of perfis ?? []) if (p.email) porEmail.set(p.email.toLowerCase(), p.id);

    let vinculados = 0;
    for (const c of pendentes ?? []) {
      const uid = c.email ? porEmail.get(c.email.toLowerCase()) : undefined;
      if (!uid) continue;
      const { error: erroUpdate } = await supabase.from("corretores").update({ user_id: uid }).eq("id", c.id);
      if (!erroUpdate) vinculados += 1;
    }
    return { vinculados };
  });
