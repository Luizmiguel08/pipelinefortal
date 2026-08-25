/**
 * Leitura dos agendamentos no app "Agendamento Pro" (crmfortal.lovable.app).
 * O app de agenda expõe uma rota pública protegida por segredo compartilhado.
 */

export type AgendaAppointment = {
  id: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  corretor_nome: string | null;
  corretor_email: string | null;
  empreendimento: string | null;
  visita_em: string | null;
  status: "agendado" | "realizado" | "desmarcado";
  motivo: string | null;
  atualizado_em: string | null;
};

const BASE_PADRAO = "https://crmfortal.lovable.app";

function texto(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v);
  return s ? s : null;
}

function combinarDataHora(data: unknown, hora: unknown): string | null {
  const d = texto(data);
  if (!d) return null;
  if (d.includes("T")) return d;
  const h = texto(hora) ?? "00:00:00";
  // Agenda opera em America/Sao_Paulo (UTC-3).
  return `${d}T${h.length === 5 ? `${h}:00` : h}-03:00`;
}

function normalizarStatus(v: unknown): AgendaAppointment["status"] {
  const s = (texto(v) ?? "").toLowerCase();
  if (s.startsWith("realiz")) return "realizado";
  if (s.startsWith("desmarc") || s.startsWith("cancel")) return "desmarcado";
  return "agendado";
}

function mapear(raw: Record<string, unknown>): AgendaAppointment | null {
  const id = texto(raw["id"]) ?? texto(raw["appointment_id"]);
  const nome =
    texto(raw["cliente_nome"]) ?? texto(raw["client_name"]) ?? texto(raw["nome"]);
  if (!id || !nome) return null;
  return {
    id,
    cliente_nome: nome,
    cliente_telefone:
      texto(raw["cliente_telefone"]) ?? texto(raw["client_phone"]) ?? texto(raw["telefone"]),
    corretor_nome:
      texto(raw["corretor_nome"]) ?? texto(raw["broker_name"]) ?? texto(raw["fonte_nome"]) ?? texto(raw["agent_name"]),
    corretor_email: texto(raw["corretor_email"]) ?? texto(raw["broker_email"]) ?? texto(raw["agent_email"]),
    empreendimento:
      texto(raw["empreendimento"]) ?? texto(raw["project_name"]) ?? texto(raw["projeto"]),
    visita_em:
      texto(raw["visita_em"]) ??
      combinarDataHora(raw["visit_date"], raw["visit_time"]) ??
      combinarDataHora(raw["data_visita"], raw["hora_visita"]) ??
      texto(raw["data_visita"]),
    status: normalizarStatus(raw["status"]),
    motivo: texto(raw["motivo"]) ?? texto(raw["cancellation_reason"]),
    atualizado_em: texto(raw["atualizado_em"]) ?? texto(raw["updated_at"]),
  };
}

function extrairLista(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  const obj = (json ?? {}) as Record<string, unknown>;
  for (const chave of ["registros", "agendamentos", "data", "items", "results", "appointments"]) {
    const v = obj[chave];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/**
 * Busca os agendamentos individuais no app de agenda.
 * Tenta os formatos de rota/autenticação já usados pelas integrações existentes lá:
 * POST + Authorization: Bearer <segredo> e GET + x-sync-secret.
 */
export async function fetchAgendamentos(desde?: string): Promise<AgendaAppointment[]> {
  const secret = process.env["AGENDA_SYNC_SECRET"];
  if (!secret) throw new Error("AGENDA_SYNC_SECRET não configurado");
  const base = (process.env["AGENDA_API_BASE_URL"] ?? BASE_PADRAO).replace(/\/+$/, "");
  const caminho =
    process.env["AGENDA_API_PATH"] ?? "/api/public/export-agendamentos";
  const alvo = `${base}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;

  const tentativas: Array<{ url: string; init: RequestInit }> = [
    {
      url: alvo,
      init: {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(desde ? { de: desde, desde } : {}),
      },
    },
    {
      url: desde ? `${alvo}?desde=${encodeURIComponent(desde)}` : alvo,
      init: {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
          "x-sync-secret": secret,
          Accept: "application/json",
        },
      },
    },
  ];

  let ultimoErro = "";
  for (const tentativa of tentativas) {
    let resposta: Response;
    try {
      resposta = await fetch(tentativa.url, tentativa.init);
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (!resposta.ok) {
      const corpo = await resposta.text().catch(() => "");
      ultimoErro = `${resposta.status}: ${corpo.slice(0, 160)}`;
      continue;
    }
    const json = (await resposta.json()) as unknown;
    const lista = extrairLista(json);
    return lista
      .map((item) => mapear(item as Record<string, unknown>))
      .filter((a): a is AgendaAppointment => a !== null);
  }

  throw new Error(
    `Não consegui ler os agendamentos em ${alvo} (${ultimoErro}). ` +
      "Para sincronizar lead a lead é preciso que o projeto de agendamentos publique a rota export-agendamentos. " +
      "Configure AGENDA_API_BASE_URL e AGENDA_API_PATH se a URL for diferente.",
  );
}

/** Últimos 11 dígitos — tolera DDI e máscaras diferentes entre os dois sistemas. */
export function normalizarTelefone(valor: string | null | undefined) {
  const digitos = (valor ?? "").replace(/\D/g, "");
  return digitos.length >= 8 ? digitos.slice(-11) : "";
}

export function normalizarNome(valor: string | null | undefined) {
  return (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
