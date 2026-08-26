import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ETAPAS_AGENDA, MENSAGEM_AGENDA, MENSAGEM_TRAVA, STAGE_IDS, podeMoverPara, resolverEtapa, type StageId } from "./stages";

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
  visita_em: string | null;
  visita_realizada: boolean;
  visita_status: "agendado" | "realizado" | "desmarcado" | null;
  visita_motivo: string | null;
  visita_projeto: string | null;
  stage_since: string | null;
  agenda_record?: boolean;
  encontrado_c2s?: boolean;
  corretor_agenda_nome?: string | null;
};

export type BoardCorretor = {
  id: string;
  nome: string;
  email: string | null;
  c2s_agent_id: string | null;
};

export type BoardResumoLinha = { stage: StageId; total: number; soma: number };
export type BoardResumoCorretor = { corretor_id: string | null; total: number; soma: number };

export type Board = {
  isGestor: boolean;
  nome: string;
  meuCorretorId: string | null;
  corretores: BoardCorretor[];
  resumo: BoardResumoLinha[];
  porCorretor: BoardResumoCorretor[];
  colunas: Record<StageId, BoardLead[]>;
};

export type BoardFiltros = {
  corretor?: string | null;
  inicio?: string | null;
  fim?: string | null;
  busca?: string | null;
};

// Quantos cards cada coluna traz na primeira carga (o resto vem sob demanda).
export const PAGINA_COLUNA = 25;

type CardRow = Record<string, unknown>;

function paraLead(r: CardRow): BoardLead {
  return {
    id: String(r['id']),
    nome: String(r['nome'] ?? ""),
    telefone: (r['telefone'] as string) ?? null,
    email: (r['email'] as string) ?? null,
    imovel: (r['imovel'] as string) ?? null,
    valor: Number(r['valor'] ?? 0),
    stage: r['stage'] as StageId,
    corretor_id: (r['corretor_id'] as string) ?? null,
    origem: (r['origem'] as string) ?? null,
    observacoes: (r['observacoes'] as string) ?? null,
    ultima_interacao: (r['ultima_interacao'] as string) ?? null,
    c2s_contact_id: (r['c2s_contact_id'] as string) ?? null,
    created_at: (r['created_at'] as string) ?? null,
    data_c2s: (r['data_c2s'] as string) ?? null,
    entrada: Number(r['entrada'] ?? 0),
    finalidade: (r['finalidade'] as BoardLead["finalidade"]) ?? null,
    estagio_imovel: (r['estagio_imovel'] as BoardLead["estagio_imovel"]) ?? null,
    documentacao_ok: Boolean(r['documentacao_ok']),
    visita_em: (r['visita_em'] as string) ?? null,
    visita_realizada: Boolean(r['visita_realizada']),
    visita_status: (r['visita_status'] as BoardLead["visita_status"]) ?? null,
    visita_motivo: (r['visita_motivo'] as string) ?? null,
    visita_projeto: (r['visita_projeto'] as string) ?? null,
    stage_since: (r['stage_since'] as string) ?? null,
    agenda_record: Boolean(r['agenda_record']),
    encontrado_c2s: Boolean(r['encontrado_c2s']),
    corretor_agenda_nome: (r['corretor_agenda_nome'] as string) ?? null,
  };
}

function argsFiltro(f: BoardFiltros) {
  return {
    p_corretor: f.corretor && f.corretor !== "todos" ? f.corretor : null,
    p_inicio: f.inicio || null,
    p_fim: f.fim || null,
    p_busca: f.busca?.trim() || null,
  };
}

// Carrega apenas o que a tela mostra: totais agregados no banco + os primeiros
// cards de cada coluna. Antes trafegávamos os milhares de leads inteiros.
export const getBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input?: BoardFiltros) => input ?? {})
  .handler(async ({ data, context }): Promise<Board> => {
    const { supabase, userId } = context;
    const rpc = supabase.rpc.bind(supabase) as unknown as (
      nome: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    const filtros = argsFiltro(data);

    const [roles, profile, corretores, resumo, porCorretor, ...paginas] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("nome").eq("id", userId).maybeSingle(),
      supabase.from("corretores").select("id, nome, email, c2s_agent_id, user_id").order("nome"),
      rpc("board_resumo", filtros),
      rpc("board_resumo_corretor", filtros),
      ...STAGE_IDS.map((stage) =>
        rpc("board_cards_page", { ...filtros, p_stage: stage, p_limit: PAGINA_COLUNA, p_offset: 0 }),
      ),
    ]);

    for (const r of [resumo, porCorretor, ...paginas]) {
      if (r.error) throw new Error(r.error.message);
    }

    const lista = (corretores.data ?? []) as (BoardCorretor & { user_id: string | null })[];
    const colunas = {} as Record<StageId, BoardLead[]>;
    STAGE_IDS.forEach((stage, i) => {
      colunas[stage] = ((paginas[i]?.data ?? []) as CardRow[]).map(paraLead);
    });

    return {
      isGestor: (roles.data ?? []).some((r) => r.role === "gestor"),
      nome: profile.data?.nome ?? "",
      meuCorretorId: lista.find((c) => c.user_id === userId)?.id ?? null,
      corretores: lista.map(({ user_id: _u, ...c }) => c),
      resumo: ((resumo.data ?? []) as CardRow[]).map((r) => ({
        stage: r['stage'] as StageId,
        total: Number(r['total'] ?? 0),
        soma: Number(r['soma'] ?? 0),
      })),
      porCorretor: ((porCorretor.data ?? []) as CardRow[]).map((r) => ({
        corretor_id: (r['corretor_id'] as string) ?? null,
        total: Number(r['total'] ?? 0),
        soma: Number(r['soma'] ?? 0),
      })),
      colunas,
    };
  });

// Paginação por coluna ("Carregar mais").
export const getBoardCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: BoardFiltros & { stage: StageId; offset: number; limit?: number }) => {
    if (!STAGE_IDS.includes(input.stage)) throw new Error("Etapa inválida");
    return input;
  })
  .handler(async ({ data, context }): Promise<BoardLead[]> => {
    const rpc = context.supabase.rpc.bind(context.supabase) as unknown as (
      nome: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    const { data: linhas, error } = await rpc("board_cards_page", {
      ...argsFiltro(data),
      p_stage: data.stage,
      p_limit: data.limit ?? PAGINA_COLUNA,
      p_offset: data.offset,
    });
    if (error) throw new Error(error.message);
    return ((linhas ?? []) as CardRow[]).map(paraLead);
  });



export const moveLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; stage: StageId }) => {
    if (!input?.id || !STAGE_IDS.includes(input.stage)) throw new Error("Dados inválidos");
    return input;
  })
  .handler(async ({ data, context }) => {
    if (ETAPAS_AGENDA.includes(data.stage)) throw new Error(MENSAGEM_AGENDA);
    // Trava do funil: o lead só sai das etapas frias com algum indicador preenchido.
    const { data: atual, error: erroLead } = await context.supabase
      .from("leads")
      .select("valor, entrada, finalidade, estagio_imovel, documentacao_ok, visita_em, visita_realizada")
      .eq("id", data.id)
      .maybeSingle();
    if (erroLead) throw new Error(erroLead.message);
    if (atual && !podeMoverPara(data.stage, atual)) throw new Error(MENSAGEM_TRAVA);

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
      visita_em?: string | null | undefined;
      visita_realizada?: boolean | undefined;
      forcar_stage?: boolean | undefined;
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
      visita_em: data.visita_em || null,
      visita_realizada: Boolean(data.visita_realizada),
      // Documentação move para a coluna correspondente; qualquer indicador tira o lead das colunas frias.
      // forcar_stage respeita a etapa enviada (ex.: número incorreto -> lista fria).
      stage: data.forcar_stage
        ? data.stage
        : resolverEtapa(
            {
              valor: data.valor,
              entrada: data.entrada,
              finalidade: data.finalidade,
              estagio_imovel: data.estagio_imovel,
              documentacao_ok: data.documentacao_ok,
              visita_em: data.visita_em,
              visita_realizada: data.visita_realizada,
            },
            data.stage,
          ),
    };
    if (ETAPAS_AGENDA.includes(payload.stage as StageId)) throw new Error(MENSAGEM_AGENDA);
    if (!podeMoverPara(payload.stage as StageId, payload)) throw new Error(MENSAGEM_TRAVA);

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
