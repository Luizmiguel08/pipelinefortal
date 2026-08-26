/**
 * Cofre interno de configurações da integração (tabela public.integration_settings).
 * Só o servidor lê/escreve, sempre via supabaseAdmin — o navegador nunca recebe os valores.
 */

export const AGENDA_SECRET_KEY = "agenda_sync_secret";
export const AGENDA_BASE_URL_KEY = "agenda_base_url";
export const AGENDA_PATH_KEY = "agenda_path";

export async function lerConfig(chave: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("integration_settings")
    .select("valor")
    .eq("chave", chave)
    .maybeSingle();
  if (error) return null;
  const valor = (data as { valor?: string } | null)?.valor?.trim();
  return valor ? valor : null;
}

export async function gravarConfig(chave: string, valor: string, userId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("integration_settings")
    .upsert(
      {
        chave,
        valor,
        atualizado_em: new Date().toISOString(),
        atualizado_por: userId ?? null,
      },
      { onConflict: "chave" },
    );
  if (error) throw new Error(`Não consegui salvar a configuração: ${error.message}`);
}

export async function apagarConfig(chave: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("integration_settings").delete().eq("chave", chave);
}

/** Mostra só o começo e o fim do segredo. */
export function mascarar(valor: string | null): string | null {
  if (!valor) return null;
  if (valor.length <= 8) return `${valor.slice(0, 2)}••••`;
  return `${valor.slice(0, 4)}••••${valor.slice(-4)}`;
}

/** Segredo efetivo: o salvo na tela vence o que estiver no ambiente. */
export async function segredoAgenda(): Promise<{ valor: string | null; origem: "tela" | "ambiente" | null }> {
  const doBanco = await lerConfig(AGENDA_SECRET_KEY);
  if (doBanco) return { valor: doBanco, origem: "tela" };
  const doEnv = process.env["AGENDA_SYNC_SECRET"]?.trim();
  return doEnv ? { valor: doEnv, origem: "ambiente" } : { valor: null, origem: null };
}

/**
 * Chaves candidatas para leitura da agenda. A configuração da tela continua
 * sendo testada primeiro, mas uma edição incorreta não interrompe a rotina se
 * a chave segura do ambiente ainda estiver válida.
 */
export async function segredosAgenda(): Promise<string[]> {
  const doBanco = await lerConfig(AGENDA_SECRET_KEY);
  const doEnv = process.env["AGENDA_SYNC_SECRET"]?.trim() ?? null;
  return [...new Set([doBanco, doEnv].filter((valor): valor is string => Boolean(valor)))];
}
