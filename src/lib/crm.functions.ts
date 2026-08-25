import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { STAGE_IDS, resolverEtapa, type StageId } from "./stages";

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
  created_at: string | null;
  data_c2s: string | null;
  entrada: number;
  finalidade: "moradia" | "investimento" | null;
  estagio_imovel: "pronto" | "planta" | null;
  documentacao_ok: boolean;
  stage_since: string | null;
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
  meuCorretorId: string | null;
  corretores: BoardCorretor[];
  leads: BoardLead[];
};

export const getBoard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Board> => {
    const { supabase, userId } = context;

    // O PostgREST devolve no máximo 1000 linhas por requisição: paginamos para trazer todos os leads.
    const carregarLeads = async () => {
      const pagina = 1000;
      const todos: BoardLead[] = [];
      for (let inicio = 0; ; inicio += pagina) {
        const { data, error } = await supabase
          .from("leads")
          .select(
            "id, nome, telefone, email, imovel, valor, stage, corretor_id, origem, observacoes, ultima_interacao, c2s_contact_id, created_at, data_c2s, entrada, finalidade, estagio_imovel, documentacao_ok, stage_since",
          )
          .order("updated_at", { ascending: false })
          .range(inicio, inicio + pagina - 1);
        if (error) throw new Error(error.message);
        const lote = (data ?? []) as BoardLead[];
        todos.push(...lote);
        if (lote.length < pagina) break;
      }
      return todos;
    };

    const [{ data: roles }, { data: profile }, { data: corretores }, leads] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
      supabase.from("corretores").select("id, nome, email, c2s_agent_id, user_id").order("nome"),
      carregarLeads(),
    ]);

    const lista = (corretores ?? []) as (BoardCorretor & { user_id: string | null })[];

    return {
      isGestor: (roles ?? []).some((r) => r.role === "gestor"),
      nome: profile?.nome ?? "",
      meuCorretorId: lista.find((c) => c.user_id === userId)?.id ?? null,
      corretores: lista.map(({ user_id: _u, ...c }) => c),
      leads: ((leads ?? []) as BoardLead[]).map((l) => ({
        ...l,
        valor: Number(l.valor),
        entrada: Number(l.entrada ?? 0),
        documentacao_ok: Boolean(l.documentacao_ok),
      })),
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
      entrada?: number | undefined;
      finalidade?: "moradia" | "investimento" | null | undefined;
      estagio_imovel?: "pronto" | "planta" | null | undefined;
      documentacao_ok?: boolean | undefined;
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
      corretor_id: data.corretor_id,
      observacoes: data.observacoes ?? null,
      entrada: Number(data.entrada) || 0,
      finalidade: data.finalidade ?? null,
      estagio_imovel: data.estagio_imovel ?? null,
      documentacao_ok: Boolean(data.documentacao_ok),
      // Ao marcar, vai para Documentação; ao desmarcar nessa etapa, volta para Negociação.
      stage:
        data.documentacao_ok && data.stage !== "documentacao" && data.stage !== "fechamento"
          ? ("documentacao" as StageId)
          : !data.documentacao_ok && data.stage === "documentacao"
            ? ("negociacao" as StageId)
          : data.stage,
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

    const baseUrl = process.env["C2S_API_BASE_URL"] ?? "";
    let host: string | null = null;
    try {
      host = baseUrl ? new URL(baseUrl).host : null;
    } catch {
      host = null;
    }

    return {
      isGestor: !!isGestor,
      configurado: !!baseUrl && !!process.env["C2S_API_TOKEN"],
      baseUrlHost: host,
      tokenMascarado: process.env["C2S_API_TOKEN"] ? "••••••••••••" : null,
      ultimaSincronizacao: ultimo?.last_synced_at ?? null,
    };
  });

export const testC2SConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Error("Apenas gestores podem testar a conexão.");
    if (!process.env["C2S_API_BASE_URL"] || !process.env["C2S_API_TOKEN"]) {
      throw new Error("Credenciais do C2S ainda não foram informadas.");
    }
    const { fetchC2SContacts } = await import("./c2s.server");
    const contatos = await fetchC2SContacts({ maxPaginas: 1 });
    return { ok: true as const, contatos: contatos.length };
  });

export const getSyncHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (!isGestor) return { isGestor: false, execucoes: [] };

    const { data, error } = await context.supabase
      .from("sync_runs")
      .select(
        "id, started_at, finished_at, duracao_ms, status, origem, total, criados, atualizados, movidos, corretores_criados, erro",
      )
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);

    return {
      isGestor: true,
      execucoes: (data ?? []).map((r) => ({
        id: r.id,
        startedAt: r.started_at,
        duracaoMs: r.duracao_ms,
        status: r.status,
        origem: r.origem,
        total: r.total,
        criados: r.criados,
        atualizados: r.atualizados,
        movidos: r.movidos,
        corretoresCriados: r.corretores_criados,
        erro: r.erro,
      })),
    };
  });


export const syncNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { reconciliarMes?: boolean } | undefined) => ({
    reconciliarMes: input?.reconciliarMes === true,
  }))
  .handler(async ({ data, context }) => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Error("Apenas gestores podem disparar a sincronização.");
    const { runC2SSync } = await import("./c2s-sync.server");
    if (!data.reconciliarMes) return await runC2SSync();

    // Reconciliação manual desde o início do mês no fuso de São Paulo.
    const agora = new Date();
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(agora);
    const ano = partes.find((p) => p.type === "year")?.value;
    const mes = partes.find((p) => p.type === "month")?.value;
    if (!ano || !mes) throw new Error("Não foi possível calcular o período mensal.");
    return await runC2SSync("reconciliacao_mensal", `${ano}-${mes}-01T00:00:00-03:00`);
  });

export const importC2SCorretores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isGestor } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "gestor",
    });
    if (!isGestor) throw new Error("Apenas gestores podem importar corretores do C2S.");

    const { fetchC2SSellers } = await import("./c2s.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sellers = await fetchC2SSellers();
    const { data: existentes } = await supabaseAdmin
      .from("corretores")
      .select("id, nome, email, c2s_agent_id");

    const porAgent = new Map(
      (existentes ?? []).filter((c) => c.c2s_agent_id).map((c) => [c.c2s_agent_id!, c]),
    );
    const porEmail = new Map(
      (existentes ?? []).filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c]),
    );

    let criados = 0;
    let atualizados = 0;

    for (const s of sellers) {
      const atual =
        porAgent.get(s.c2s_agent_id) ?? (s.email ? porEmail.get(s.email.toLowerCase()) : undefined);
      if (atual) {
        await supabaseAdmin
          .from("corretores")
          .update({
            nome: s.nome,
            email: s.email ?? atual.email,
            telefone: s.telefone,
            c2s_agent_id: s.c2s_agent_id,
            ativo: s.ativo,
          })
          .eq("id", atual.id);
        atualizados += 1;
      } else {
        await supabaseAdmin.from("corretores").insert({
          nome: s.nome,
          email: s.email,
          telefone: s.telefone,
          c2s_agent_id: s.c2s_agent_id,
          ativo: s.ativo,
        });
        criados += 1;
      }
    }

    return { ok: true as const, total: sellers.length, criados, atualizados };
  });
