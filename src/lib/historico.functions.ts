import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Alteracao = {
  id: string;
  created_at: string;
  campo: string;
  de: string | null;
  para: string | null;
  lead_id: string;
  lead_nome: string;
  autor: string;
};

export const getHistoricoAlteracoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dias?: number; lead_id?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<Alteracao[]> => {
    const { supabase } = context;
    const dias = Math.min(Math.max(Number(data.dias) || 7, 1), 90);
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

    let consulta = supabase
      .from("lead_audit")
      .select("id, created_at, campo, de, para, lead_id, user_id")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.lead_id) consulta = consulta.eq("lead_id", data.lead_id);

    const { data: linhas, error } = await consulta;
    if (error) throw new Error(error.message);
    if (!linhas || linhas.length === 0) return [];

    const leadIds = [...new Set(linhas.map((l) => l.lead_id))];
    const userIds = [...new Set(linhas.map((l) => l.user_id).filter(Boolean))] as string[];

    const [leads, perfis] = await Promise.all([
      supabase.from("leads").select("id, nome").in("id", leadIds),
      userIds.length
        ? supabase.from("profiles").select("id, nome, email").in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; nome: string; email: string | null }[] }),
    ]);

    const nomeLead = new Map((leads.data ?? []).map((l) => [l.id, l.nome]));
    const nomeAutor = new Map(
      ((perfis.data ?? []) as { id: string; nome: string; email: string | null }[]).map((p) => [
        p.id,
        p.nome || p.email || "Usuário",
      ]),
    );

    return linhas.map((l) => ({
      id: l.id,
      created_at: l.created_at,
      campo: l.campo,
      de: l.de,
      para: l.para,
      lead_id: l.lead_id,
      lead_nome: nomeLead.get(l.lead_id) ?? "Lead",
      autor: l.user_id ? (nomeAutor.get(l.user_id) ?? "Usuário") : "Sistema",
    }));
  });
