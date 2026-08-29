import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AtividadeCorretor = {
  corretor_id: string;
  nome: string;
  ativo: boolean;
  movimentacoes: number;
  manuais: number;
  automaticas: number;
  hoje: number;
  ultima_movimentacao: string | null;
  ultima_edicao: string | null;
  leads_total: number;
  leads_qualificados: number;
};

export type AtividadeEvento = {
  id: string;
  created_at: string;
  lead_id: string;
  lead_nome: string;
  corretor_id: string | null;
  corretor_nome: string | null;
  de: string | null;
  para: string;
  automatico: boolean;
};

export type Atividade = {
  isGestor: boolean;
  dias: number;
  corretores: AtividadeCorretor[];
  eventos: AtividadeEvento[];
};

export const getAtividade = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { dias?: number; corretor?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<Atividade> => {
    const { supabase, userId } = context;
    const dias = Math.min(Math.max(Number(data.dias) || 7, 1), 90);

    const [{ data: gestor }, resumo, eventos] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "gestor" }),
      supabase.rpc("atividade_corretores", { p_dias: dias }),
      supabase.rpc("atividade_eventos", {
        p_dias: dias,
        p_corretor: data.corretor ?? null,
        p_limit: 200,
      }),
    ]);

    if (resumo.error) throw new Error(resumo.error.message);
    if (eventos.error) throw new Error(eventos.error.message);

    return {
      isGestor: Boolean(gestor),
      dias,
      corretores: (resumo.data ?? []) as AtividadeCorretor[],
      eventos: (eventos.data ?? []) as AtividadeEvento[],
    };
  });
