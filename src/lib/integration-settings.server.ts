/**
 * Gerencia configurações de integração armazenadas na tabela integration_settings.
 * Todas as funções aqui usam o supabaseAdmin (service role) para leitura/escrita.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ─── Chaves de configuração ────────────────────────────────────────────────────
export const AGENDA_SECRET_KEY = "AGENDA_SYNC_SECRET";
export const AGENDA_BASE_URL_KEY = "AGENDA_BASE_URL";
export const AGENDA_PATH_KEY = "AGENDA_PATH";

// ─── Leitura genérica ──────────────────────────────────────────────────────────
export async function lerConfig(chave: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("integration_settings")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { valor: string }).valor || null;
}

// ─── Gravação genérica ─────────────────────────────────────────────────────────
export async function gravarConfig(
  chave: string,
  valor: string,
  userId?: string,
): Promise<void> {
  const { error } = await supabaseAdmin.from("integration_settings").upsert(
    {
      chave,
      valor,
      atualizado_em: new Date().toISOString(),
      atualizado_por: userId ?? null,
    },
    { onConflict: "chave" },
  );
  if (error) throw new Error(`Falha ao gravar config "${chave}": ${error.message}`);
}

// ─── Apagar configuração ───────────────────────────────────────────────────────
export async function apagarConfig(chave: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("integration_settings")
    .delete()
    .eq("chave", chave);
  if (error) throw new Error(`Falha ao apagar config "${chave}": ${error.message}`);
}

// ─── Segredo da agenda (singular) — retorna valor + origem ─────────────────────
export async function segredoAgenda(): Promise<{
  valor: string | null;
  origem: "tela" | "ambiente" | null;
}> {
  const valorBanco = await lerConfig(AGENDA_SECRET_KEY);
  if (valorBanco) return { valor: valorBanco, origem: "tela" };

  const valorEnv = process.env["AGENDA_SYNC_SECRET"]?.trim() || null;
  if (valorEnv) return { valor: valorEnv, origem: "ambiente" };

  return { valor: null, origem: null };
}

// ─── Segredos da agenda (plural) — lista de segredos válidos ───────────────────
// Retorna todos os segredos configurados (banco + env) para tentar múltiplas
// autenticações contra o app de agenda.
export async function segredosAgenda(): Promise<string[]> {
  const resultado: string[] = [];

  const valorBanco = await lerConfig(AGENDA_SECRET_KEY);
  if (valorBanco) resultado.push(valorBanco);

  const valorEnv = process.env["AGENDA_SYNC_SECRET"]?.trim();
  if (valorEnv && !resultado.includes(valorEnv)) resultado.push(valorEnv);

  return resultado;
}

// ─── Mascarar segredo para exibição ────────────────────────────────────────────
export function mascarar(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (valor.length <= 6) return "••••••";
  return valor.slice(0, 3) + "•".repeat(Math.min(valor.length - 6, 20)) + valor.slice(-3);
}
