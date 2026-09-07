import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DesempenhoCorretor = {
  corretor_id: string;
  nome: string;
  ativo: boolean;
  leads_total: number;
  valor_total: number;
  por_stage: Record<string, number>;
  sem_telefone: number;
  sem_valor: number;
  sem_entrada: number;
  sem_finalidade: number;
  sem_estagio_imovel: number;
  sem_nenhum_indicador: number;
  ultima_atualizacao: string | null;
};

export type Desempenho = {
  isGestor: boolean;
  corretores: DesempenhoCorretor[];
};

export const getDesempenho = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { inicio?: string | null; fim?: string | null } | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<Desempenho> => {
    const { supabase, userId } = context;

    const [{ data: gestor }, resumo] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "gestor" }),
      supabase.rpc("desempenho_corretores", {
        ...(data.inicio ? { p_inicio: data.inicio } : {}),
        ...(data.fim ? { p_fim: data.fim } : {}),
      } as { p_inicio: string; p_fim: string }),
    ]);

    if (resumo.error) throw new Error(resumo.error.message);

    const corretores = ((resumo.data ?? []) as DesempenhoCorretor[]).map((c) => ({
      ...c,
      leads_total: Number(c.leads_total ?? 0),
      valor_total: Number(c.valor_total ?? 0),
      por_stage: (c.por_stage ?? {}) as Record<string, number>,
    }));

    return { isGestor: Boolean(gestor), corretores };
  });
