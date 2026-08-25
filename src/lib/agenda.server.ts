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
      texto(raw["corretor_nome"]) ?? texto(raw["broker_name"]) ?? texto(raw["fonte_nome"]),
    corretor_email: texto(raw["corretor_email"]) ?? texto(raw["broker_email"]),
    empreendimento:
      texto(raw["empreendimento"]) ?? texto(raw["project_name"]) ?? texto(raw["projeto"]),
    visita_em:
      texto(raw["visita_em"]) ??
      combinarDataHora(raw["visit_date"], raw["visit_time"]) ??
      texto(raw["data_visita"]),
    status: normalizarStatus(raw["status"]),
    motivo: texto(raw["motivo"]) ?? texto(raw["cancellation_reason"]),
    atualizado_em: texto(raw["atualizado_em"]) ?? texto(raw["updated_at"]),
  };
}

export async function fetchAgendamentos(desde?: string): Promise<AgendaAppointment[]> {
  const secret = process.env["AGENDA_SYNC_SECRET"];
  if (!secret) throw new Error("AGENDA_SYNC_SECRET não configurado");
  const base = (process.env["AGENDA_API_BASE_URL"] ?? BASE_PADRAO).replace(/\/+$/, "");

  const url = new URL(`${base}/api/public/export-agendamentos`);
  if (desde) url.searchParams.set("desde", desde);

  const resposta = await fetch(url.toString(), {
    method: "GET",
    headers: { "x-sync-secret": secret, Accept: "application/json" },
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    throw new Error(`Agenda respondeu ${resposta.status}: ${corpo.slice(0, 200)}`);
  }

  const json = (await resposta.json()) as unknown;
  const lista = Array.isArray(json)
    ? json
    : Array.isArray((json as { registros?: unknown[] })?.registros)
      ? (json as { registros: unknown[] }).registros
      : Array.isArray((json as { data?: unknown[] })?.data)
        ? (json as { data: unknown[] }).data
        : [];

  return lista
    .map((item) => mapear(item as Record<string, unknown>))
    .filter((a): a is AgendaAppointment => a !== null);
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
