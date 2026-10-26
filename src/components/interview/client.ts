import { COVERAGE_SLOTS, type CoverageMap, type Playbook, type TranscriptTurn } from "@/lib/types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function emptyCoverage(): CoverageMap {
  return {
    owners: 0,
    decision_rules: 0,
    landmines: 0,
    sops: 0,
    people_map: 0,
    on_call_escalation: 0,
    tribal_knowledge: 0,
  };
}

export function fullCoverage(): CoverageMap {
  return {
    owners: 1,
    decision_rules: 1,
    landmines: 1,
    sops: 1,
    people_map: 1,
    on_call_escalation: 1,
    tribal_knowledge: 1,
  };
}

export type QaView =
  | { kind: "answer"; text: string; source_turn_ids: string[] }
  | { kind: "abstain"; text: "not covered in handoff"; source_turn_ids: [] };

const ABSTAIN: QaView = {
  kind: "abstain",
  text: "not covered in handoff",
  source_turn_ids: [],
};

function detailFrom(parsed: unknown, raw: string): string {
  if (typeof parsed === "string") return parsed.trim();
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (typeof record.error === "string") return record.error.trim();
    if (typeof record.error_description === "string") return record.error_description.trim();
    if (typeof record.message === "string") return record.message.trim();
  }
  return raw.trim();
}

function formatError(status: number, parsed: unknown, raw: string): string {
  const detail = detailFrom(parsed, raw);
  if (status === 401) {
    return detail.includes("401") ? detail : `401 ${detail || "Unauthorized"}`;
  }
  if (status === 429) {
    return detail.includes("429") ? detail : `429 ${detail || "Too many requests"}`;
  }
  return detail ? `${status} ${detail}` : `Request failed (${status})`;
}

async function readResponse(res: Response): Promise<unknown> {
  const raw = await res.text();
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, formatError(res.status, parsed, raw));
  }
  return parsed;
}

export async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readResponse(res);
}

export async function patchJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readResponse(res);
}

export async function postForm(path: string, body: FormData): Promise<unknown> {
  const res = await fetch(path, { method: "POST", body });
  return readResponse(res);
}

export function sessionIdOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  for (const key of ["id", "session_id", "sessionId"] as const) {
    const found = root[key];
    if (typeof found === "string" && found) return found;
  }
  if (root.session && typeof root.session === "object") {
    return sessionIdOf(root.session);
  }
  return null;
}

export function requireSessionId(value: unknown): string {
  const id = sessionIdOf(value);
  if (!id) throw new Error("Session response did not include an id.");
  return id;
}

function coverageFrom(value: unknown): CoverageMap | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const next = emptyCoverage();
  let found = false;
  for (const slot of COVERAGE_SLOTS) {
    const score = record[slot];
    if (typeof score === "number" && Number.isFinite(score)) {
      next[slot] = Math.min(1, Math.max(0, score));
      found = true;
    }
  }
  return found ? next : null;
}

export function readCoverage(value: unknown): CoverageMap | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const direct = coverageFrom(root.coverage);
  if (direct) return direct;
  if (root.session && typeof root.session === "object") {
    const nested = coverageFrom((root.session as Record<string, unknown>).coverage);
    if (nested) return nested;
  }
  return null;
}

function normalizeTurns(value: unknown[]): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") return;
    const turn = item as Record<string, unknown>;
    const text = typeof turn.text === "string" ? turn.text.trim() : "";
    if (!text) return;
    turns.push({
      id: typeof turn.id === "string" && turn.id ? turn.id : `t${String(index + 1).padStart(2, "0")}`,
      speaker: turn.speaker === "interviewer" ? "interviewer" : "leader",
      text,
      ...(typeof turn.timestamp === "string" ? { timestamp: turn.timestamp } : {}),
    });
  });
  return turns;
}

export function readTurns(value: unknown): TranscriptTurn[] | null {
  if (typeof value === "string" && value.trim()) {
    return [{ id: "voice-01", speaker: "leader", text: value.trim() }];
  }
  if (Array.isArray(value)) {
    const turns = normalizeTurns(value);
    return turns.length ? turns : null;
  }
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  if (typeof root.transcript === "string" && root.transcript.trim()) {
    return [{ id: "voice-01", speaker: "leader", text: root.transcript.trim() }];
  }
  if (Array.isArray(root.transcript)) return readTurns(root.transcript);
  if (Array.isArray(root.turns)) return readTurns(root.turns);
  if (root.session && typeof root.session === "object") {
    const session = root.session as Record<string, unknown>;
    return readTurns(session.transcript);
  }
  return null;
}

export function readQuestion(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const question = root.question ?? root.nextQuestion ?? root.next_question;
  return typeof question === "string" && question.trim() ? question.trim() : null;
}

export function readDone(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const root = value as Record<string, unknown>;
  if (root.done === true) return true;
  if (root.session && typeof root.session === "object") {
    const status = (root.session as Record<string, unknown>).status;
    return status === "ready_to_synthesize" || status === "synthesized";
  }
  return false;
}

function isPlaybook(value: unknown): value is Playbook {
  if (!value || typeof value !== "object") return false;
  const playbook = value as Partial<Playbook>;
  return (
    typeof playbook.id === "string" &&
    Boolean(playbook.subject) &&
    Array.isArray(playbook.role_map) &&
    Array.isArray(playbook.decision_log) &&
    Array.isArray(playbook.landmines) &&
    Array.isArray(playbook.sops) &&
    Array.isArray(playbook.day_one_checklist) &&
    Array.isArray(playbook.people_map) &&
    Array.isArray(playbook.open_questions)
  );
}

export function readPlaybook(value: unknown): Playbook | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  if (isPlaybook(root.playbook)) return root.playbook;
  if (isPlaybook(root)) return root;
  return null;
}

export function readQa(value: unknown): QaView {
  if (!value || typeof value !== "object") return ABSTAIN;
  const root = value as Record<string, unknown>;
  const source =
    root.result && typeof root.result === "object"
      ? (root.result as Record<string, unknown>)
      : root.answer && typeof root.answer === "object"
        ? (root.answer as Record<string, unknown>)
        : root;
  if (source.kind === "abstain" || source.abstain === true) return ABSTAIN;
  const text =
    typeof source.text === "string"
      ? source.text.trim()
      : typeof source.answer === "string"
        ? source.answer.trim()
        : "";
  if (!text || /not covered in handoff/i.test(text)) return ABSTAIN;
  const ids = Array.isArray(source.source_turn_ids)
    ? source.source_turn_ids.filter((id): id is string => typeof id === "string")
    : [];
  return { kind: "answer", text, source_turn_ids: ids };
}

export function readImageUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const candidate = root.imageUrl ?? root.image_url ?? root.url;
  if (typeof candidate !== "string") return null;
  if (
    candidate.startsWith("https://") ||
    candidate.startsWith("http://") ||
    candidate.startsWith("/") ||
    candidate.startsWith("data:image/")
  ) {
    return candidate;
  }
  return null;
}

export function sessionBody(id: string, extra?: Record<string, unknown>) {
  return { session_id: id, sessionId: id, ...extra };
}
