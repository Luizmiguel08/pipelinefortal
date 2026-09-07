import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ResumoSync = {
  started_at: string;
  finished_at: string | null;
  status: string;
  origem: string;
  total: number;
  criados: number;
  atualizados: number;
  movidos?: number;
  vinculados_c2s?: number;
  nao_encontrados_c2s?: number;
  erro: string | null;
} | null;

export type Saude = {
  isGestor: boolean;
  c2s: ResumoSync;
  c2s_falhas_24h: number;
  agenda: ResumoSync;
  agenda_falhas_24h: number;
  leads_total: number;
  leads_sem_corretor: number;
  leads_sem_valor: number;
  leads_sem_telefone: number;
  leads_novos_parados: number;
  telefones_duplicados: number;
  movimentacoes_24h: number;
};

export const getSaude = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Saude> => {
    const { supabase, userId } = context;

    const { data: gestor } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "gestor",
    });
    if (!gestor) throw new Error("Somente gestores podem ver o painel de saúde.");

    const { data, error } = await supabase.rpc("saude_sistema");
    if (error) throw new Error(error.message);

    const bruto = (data ?? {}) as Record<string, unknown>;
    const num = (k: string) => Number(bruto[k] ?? 0);

    return {
      isGestor: true,
      c2s: (bruto["c2s"] ?? null) as ResumoSync,
      agenda: (bruto["agenda"] ?? null) as ResumoSync,
      c2s_falhas_24h: num("c2s_falhas_24h"),
      agenda_falhas_24h: num("agenda_falhas_24h"),
      leads_total: num("leads_total"),
      leads_sem_corretor: num("leads_sem_corretor"),
      leads_sem_valor: num("leads_sem_valor"),
      leads_sem_telefone: num("leads_sem_telefone"),
      leads_novos_parados: num("leads_novos_parados"),
      telefones_duplicados: num("telefones_duplicados"),
      movimentacoes_24h: num("movimentacoes_24h"),
    };
  });
