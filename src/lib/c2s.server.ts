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
  if (/fechad|ganho|vendid|assinad|conclu/.test(value)) return "fechamento";
  if (/document|dossi|cr[eé]dito|an[aá]lise/.test(value)) return "documentacao";
  if (/negocia|propost|contra.?propost|valores/.test(value)) return "negociacao";
  if (/atendiment|respond|contato|em.?andamento|qualific/.test(value)) return "atendimento";
  return "novo";
}

export function normalizeContact(raw: Record<string, unknown>): C2SContact | null {
  const id = pick(raw, ["id", "contact_id", "uuid", "codigo", "contact.id"]);
  if (id === undefined) return null;
  const nome = pick(raw, ["name", "nome", "contact_name", "cliente", "contact.name"]);
  return {
    c2s_contact_id: String(id),
    nome: String(nome ?? "Contato sem nome"),
    telefone: (pick(raw, ["phone", "telefone", "celular", "whatsapp", "contact.phone"]) as string) ?? null,
    email: (pick(raw, ["email", "e_mail", "contact.email"]) as string) ?? null,
    imovel: (pick(raw, ["property", "imovel", "empreendimento", "interest", "property.title"]) as string) ?? null,
    valor: toNumber(pick(raw, ["value", "valor", "price", "preco", "property_value", "property.price"])),
    origem: (pick(raw, ["source", "origem", "channel", "midia"]) as string) ?? "C2S",
    stage: mapStage(pick(raw, ["stage", "status", "funnel_stage", "etapa", "situacao"])),
    ultima_interacao:
      (pick(raw, ["last_interaction_at", "updated_at", "last_message_at", "atualizado_em"]) as string) ?? null,
    c2s_agent_id: (pick(raw, ["agent_id", "broker_id", "user_id", "corretor_id", "agent.id"]) as string)
      ? String(pick(raw, ["agent_id", "broker_id", "user_id", "corretor_id", "agent.id"]))
      : null,
    corretor_nome: (pick(raw, ["agent_name", "broker_name", "corretor", "agent.name"]) as string) ?? null,
    corretor_email: (pick(raw, ["agent_email", "broker_email", "agent.email"]) as string) ?? null,
  };
}

export async function fetchC2SContacts(): Promise<C2SContact[]> {
  const baseUrl = process.env["C2S_API_BASE_URL"];
  const token = process.env["C2S_API_TOKEN"];
  if (!baseUrl || !token) {
    throw new Error(
      "Integração C2S não configurada: informe a URL da API e o token de acesso nas configurações.",
    );
  }

  const url = `${baseUrl.replace(/\/$/, "")}/contacts`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`O C2S respondeu com erro ${response.status}. Verifique a URL e o token.`);
  }

  const payload = (await response.json()) as unknown;
  const list: unknown[] = Array.isArray(payload)
    ? payload
    : ((payload as Record<string, unknown>)?.["data"] as unknown[]) ??
      ((payload as Record<string, unknown>)?.["contacts"] as unknown[]) ??
      ((payload as Record<string, unknown>)?.["results"] as unknown[]) ??
      [];

  return list
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
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
