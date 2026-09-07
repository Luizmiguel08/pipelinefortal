import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PrecoProjeto = {
  id: string;
  projeto: string;
  padroes: string[];
  exato: boolean;
  valor: number;
  ordem: number;
  ativo: boolean;
};

export type PrecosResposta = {
  isGestor: boolean;
  precos: PrecoProjeto[];
  /** Empreendimentos que aparecem nos leads e ainda não têm valor cadastrado. */
  semPreco: { imovel: string; leads: number }[];
};

export const getPrecos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PrecosResposta> => {
    const { supabase, userId } = context;

    const [{ data: gestor }, lista, faltando] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "gestor" }),
      supabase
        .from("precos_projetos")
        .select("id, projeto, padroes, exato, valor, ordem, ativo")
        .order("ordem")
        .order("projeto"),
      supabase
        .from("leads")
        .select("imovel, valor")
        .not("imovel", "is", null)
        .eq("valor", 0)
        .limit(5000),
    ]);

    if (lista.error) throw new Error(lista.error.message);

    const contagem = new Map<string, number>();
    for (const l of faltando.data ?? []) {
      const nome = (l.imovel ?? "").trim();
      if (!nome) continue;
      contagem.set(nome, (contagem.get(nome) ?? 0) + 1);
    }

    return {
      isGestor: Boolean(gestor),
      precos: (lista.data ?? []).map((p) => ({
        ...p,
        padroes: p.padroes ?? [],
        valor: Number(p.valor ?? 0),
      })) as PrecoProjeto[],
      semPreco: [...contagem.entries()]
        .map(([imovel, leads]) => ({ imovel, leads }))
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 30),
    };
  });

export const salvarPreco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      id?: string | null;
      projeto: string;
      padroes: string[];
      exato: boolean;
      valor: number;
      ordem?: number;
      ativo?: boolean;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const linha = {
      projeto: data.projeto.trim(),
      padroes: data.padroes.map((p) => p.trim()).filter(Boolean),
      exato: Boolean(data.exato),
      valor: Number(data.valor) || 0,
      ordem: Number(data.ordem) || 100,
      ativo: data.ativo ?? true,
    };
    if (!linha.projeto) throw new Error("Informe o nome do empreendimento.");
    if (linha.padroes.length === 0) throw new Error("Informe ao menos um nome que identifique o projeto.");

    const resposta = data.id
      ? await supabase.from("precos_projetos").update(linha).eq("id", data.id)
      : await supabase.from("precos_projetos").insert(linha);

    if (resposta.error) throw new Error(resposta.error.message);
    return { ok: true };
  });

export const excluirPreco = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("precos_projetos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
