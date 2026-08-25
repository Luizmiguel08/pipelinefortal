import type { StageId } from "./stages";

/**
 * Integração com o CRM C2S - Gestão de Contatos.
 * Base URL e token são lidos das variáveis de ambiente do servidor.
 */
export type C2SContact = {
  c2s_contact_id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  imovel: string | null;
  valor: number;
  origem: string | null;
  stage: StageId;
  ultima_interacao: string | null;
  data_c2s: string | null;
  c2s_agent_id: string | null;
  corretor_nome: string | null;
  corretor_email: string | null;
};

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const parts = key.split(".");
    let cur: unknown = obj;
    for (const p of parts) {
      if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Traduz o status/etapa do C2S para as colunas do pipeline. */
export function mapStage(raw: unknown): StageId {
  const value = String(raw ?? "").toLowerCase();
  if (/fechad|ganho|vendid|assinad|conclu|done|won|closed|sold/.test(value)) return "fechamento";
  if (/document|dossi|cr[eé]dito|an[aá]lise|proposal_sent|contract/.test(value)) return "documentacao";
  if (/negocia|propost|contra.?propost|valores|negotiation|proposal/.test(value)) return "negociacao";
  if (/atendiment|respond|contato|em.?andamento|qualific|attendance|contacted|in_service|replied/.test(value))
    return "atendimento";
  return "novo";
}


export function normalizeContact(rawItem: Record<string, unknown>): C2SContact | null {
  // A API do C2S devolve { id, attributes: { customer, seller, product, lead_status ... } }.
  const attrs = (rawItem["attributes"] as Record<string, unknown> | undefined) ?? {};
  const raw: Record<string, unknown> = { ...attrs, ...rawItem };

  const id = pick(raw, ["id", "contact_id", "uuid", "codigo", "contact.id"]);
  if (id === undefined) return null;
  const nome = pick(raw, ["customer.name", "name", "nome", "contact_name", "cliente", "contact.name"]);
  const agentId = pick(raw, ["seller.id", "agent_id", "broker_id", "user_id", "corretor_id", "agent.id"]);
  const done = pick(raw, ["done_details.done"]) === true;
  const statusRaw =
    pick(raw, [
      "lead_status.alias",
      "lead_status.name",
      "funnel_status.status",
      "stage",
      "status",
      "funnel_stage",
      "etapa",
      "situacao",
    ]) ?? "";

  const valor = toNumber(
    pick(raw, ["product.price_float", "product.price", "value", "valor", "price", "preco", "property_value"]),
  );
  const respondido = Boolean(pick(raw, ["replied_at"])) || Boolean(pick(raw, ["done_details.replied_at"]));

  // Regras do funil (automação):
  // 1. Novo: contato ainda sem atendimento (o corretor não respondeu no C2S).
  // 2. Em atendimento: corretor respondeu o cliente.
  // 3. Negociação: houve proposta/valores (etapa de negociação no C2S + valor em R$).
  // 4. Documentação: status de documentos/contrato no C2S.
  // 5. Fechamento: contato finalizado/ganho no C2S.
  const doC2S = done ? ("fechamento" as StageId) : mapStage(statusRaw);
  let stage: StageId = "novo";
  if (doC2S === "fechamento" || doC2S === "documentacao") {
    stage = doC2S;
  } else if (respondido) {
    stage = doC2S === "negociacao" && valor > 0 ? "negociacao" : "atendimento";
  }


  return {
    c2s_contact_id: String(id),
    nome: String(nome ?? "Contato sem nome"),
    telefone:
      (pick(raw, ["customer.phone_global", "customer.phone", "phone", "telefone", "celular", "whatsapp"]) as string) ??
      null,
    email: (pick(raw, ["customer.email", "email", "e_mail", "contact.email"]) as string) ?? null,
    imovel:
      (pick(raw, [
        "product.description",
        "product.prop_ref",
        "description",
        "property",
        "imovel",
        "empreendimento",
        "interest",
        "property.title",
      ]) as string) ?? null,
    valor,
    origem:
      (pick(raw, ["lead_source.name", "channel.name", "source", "origem", "midia"]) as string) ?? "C2S",
    stage,
    ultima_interacao:
      (pick(raw, [
        "last_activity_date",
        "updated_at",
        "last_interaction_at",
        "last_message_at",
        "atualizado_em",
      ]) as string) ?? null,
    // Data real de entrada do contato no C2S (usada nos filtros por período).
    data_c2s:
      (pick(raw, ["created_at", "created_date", "criado_em", "date", "inserted_at"]) as string) ?? null,
    c2s_agent_id: agentId ? String(agentId) : null,
    corretor_nome: ((pick(raw, ["seller.name", "agent_name", "broker_name", "corretor"]) as string) ?? null)
      ? String(pick(raw, ["seller.name", "agent_name", "broker_name", "corretor"])).trim()
      : null,
    corretor_email: (pick(raw, ["seller.email", "agent_email", "broker_email"]) as string) ?? null,
  };
}


export type FetchContactsOptions = {
  /** Só traz contatos criados/atualizados a partir desta data (ISO). Padrão: últimos 7 dias. */
  desde?: string;
  /** Limite de segurança de páginas (25 contatos por página). */
  maxPaginas?: number;
};

type C2SPage = {
  items: Record<string, unknown>[];
  total: number | null;
};

async function fetchPage(root: string, token: string, page: number): Promise<C2SPage> {
  const response = await fetch(`${root}/contacts?page=${page}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`O C2S respondeu com erro ${response.status}. Verifique a URL e o token.`);
  }
  const payload = (await response.json()) as unknown;
  const p = payload as Record<string, unknown>;
  const list: unknown[] = Array.isArray(payload)
    ? payload
    : ((p?.["data"] as unknown[]) ??
      (p?.["contacts"] as unknown[]) ??
      (p?.["results"] as unknown[]) ??
      []);
  const totalRaw = p?.["meta"] && typeof p["meta"] === "object"
    ? (p["meta"] as Record<string, unknown>)["total"]
    : undefined;
  const total = typeof totalRaw === "number" ? totalRaw : Number(totalRaw);
  return {
    items: list.filter((item): item is Record<string, unknown> => !!item && typeof item === "object"),
    total: Number.isFinite(total) ? total : null,
  };
}

function contactCreatedDate(rawItem: Record<string, unknown>): number {
  const attrs = (rawItem["attributes"] as Record<string, unknown> | undefined) ?? {};
  const raw: Record<string, unknown> = { ...attrs, ...rawItem };
  const value = pick(raw, ["created_at", "created_date", "criado_em", "date", "inserted_at"]);
  const parsed = value ? Date.parse(String(value)) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export async function fetchC2SContacts(options: FetchContactsOptions = {}): Promise<C2SContact[]> {
  const baseUrl = process.env["C2S_API_BASE_URL"];
  const token = process.env["C2S_API_TOKEN"];
  if (!baseUrl || !token) {
    throw new Error(
      "Integração C2S não configurada: informe a URL da API e o token de acesso nas configurações.",
    );
  }

  const root = baseUrl.replace(/\/$/, "");
  const corte = options.desde
    ? Date.parse(options.desde)
    : Date.now() - 7 * 24 * 60 * 60 * 1000;
  const maxPaginas = options.maxPaginas ?? 80;

  const itens: Record<string, unknown>[] = [];
  const vistos = new Set<string>();
  let totalRemoto: number | null = null;

  // O C2S entrega somente 25 contatos por página. Lemos blocos em paralelo para que
  // a conferência mensal não leve vários minutos, mantendo concorrência moderada.
  const paginasPorBloco = 10;
  let encerrar = false;
  for (let inicio = 1; inicio <= maxPaginas && !encerrar; inicio += paginasPorBloco) {
    const numeros = Array.from(
      { length: Math.min(paginasPorBloco, maxPaginas - inicio + 1) },
      (_, indice) => inicio + indice,
    );
    const paginas = await Promise.all(numeros.map((numero) => fetchPage(root, token, numero)));

    for (let indice = 0; indice < paginas.length; indice += 1) {
      const pagina = paginas[indice];
      const numero = numeros[indice];
      if (!pagina || numero === undefined) continue;
      const lista = pagina.items;
      totalRemoto = pagina.total ?? totalRemoto;
      if (!lista.length) {
        encerrar = true;
        break;
      }

      let maisNovoQueCorte = 0;
      for (const item of lista) {
        const id = String(item["id"] ?? "");
        if (id && vistos.has(id)) continue;
        if (contactCreatedDate(item) < corte) continue;
        if (id) vistos.add(id);
        itens.push(item);
        maisNovoQueCorte += 1;
      }
      if (maisNovoQueCorte === 0) {
        encerrar = true;
        break;
      }
      if (totalRemoto !== null && numero * lista.length >= totalRemoto) {
        encerrar = true;
        break;
      }
    }
  }

  return itens
    .map(normalizeContact)
    .filter((c): c is C2SContact => c !== null);
}


export type C2SSeller = {
  c2s_agent_id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
};

function normalizeSeller(raw: Record<string, unknown>): C2SSeller | null {
  const id = pick(raw, ["id", "uuid", "seller_id", "user_id", "agent_id", "codigo"]);
  if (id === undefined) return null;
  // Preferimos o apelido/nome de exibição usado no próprio C2S.
  const nome = pick(raw, [
    "nickname",
    "apelido",
    "display_name",
    "nome_exibicao",
    "short_name",
    "name",
    "nome",
    "full_name",
    "user.name",
  ]);
  const ativo = pick(raw, ["active", "ativo", "is_active", "enabled", "status"]);
  return {
    c2s_agent_id: String(id),
    nome: String(nome ?? `Corretor ${id}`).trim(),
    email: (pick(raw, ["email", "e_mail", "user.email"]) as string) ?? null,
    telefone: (pick(raw, ["phone", "telefone", "celular", "whatsapp"]) as string) ?? null,
    ativo:
      ativo === undefined
        ? true
        : typeof ativo === "boolean"
          ? ativo
          : !/^(0|false|inactive|inativo|disabled|blocked)$/i.test(String(ativo)),
  };
}

/** Busca os corretores (sellers) cadastrados no C2S. */
export async function fetchC2SSellers(): Promise<C2SSeller[]> {
  const baseUrl = process.env["C2S_API_BASE_URL"];
  const token = process.env["C2S_API_TOKEN"];
  if (!baseUrl || !token) {
    throw new Error(
      "Integração C2S não configurada: informe a URL da API e o token de acesso nas configurações.",
    );
  }
  const root = baseUrl.replace(/\/$/, "");
  const caminhos = ["/sellers", "/users", "/agents", "/brokers"];
  let ultimoErro = "";

  for (const caminho of caminhos) {
    const response = await fetch(`${root}${caminho}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) {
      ultimoErro = `${caminho} → ${response.status} ${(await response.text()).slice(0, 200)}`;
      continue;
    }
    const payload = (await response.json()) as unknown;
    const p = payload as Record<string, unknown>;
    const list: unknown[] = Array.isArray(payload)
      ? payload
      : ((p?.["data"] as unknown[]) ??
        (p?.["sellers"] as unknown[]) ??
        (p?.["users"] as unknown[]) ??
        (p?.["results"] as unknown[]) ??
        []);
    const sellers = list
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map(normalizeSeller)
      .filter((s): s is C2SSeller => s !== null);
    if (sellers.length) return sellers;
    ultimoErro = `${caminho} → resposta sem corretores`;
  }

  throw new Error(
    `Não foi possível listar os corretores no C2S. Verifique se o token tem permissão de leitura de usuários. Detalhe: ${ultimoErro}`,
  );
}
