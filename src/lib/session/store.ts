import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { COVERAGE_SLOTS, type CoverageMap, type Playbook, type Session, type SessionStatus, type TranscriptTurn } from "@/lib/types";

const SESSION_STATUSES: readonly SessionStatus[] = [
  "created",
  "interviewing",
  "ready_to_synthesize",
  "synthesized",
  "failed",
];

const locks = new Map<string, Promise<unknown>>();

export type CreateSessionInput = {
  role?: string;
  transcript?: TranscriptTurn[];
  coverage?: CoverageMap;
  status?: SessionStatus;
};

export type SessionPatch = Partial<Pick<Session, "role" | "transcript" | "coverage" | "status" | "playbook_id">>;

export function emptyCoverage(): CoverageMap {
  return Object.fromEntries(COVERAGE_SLOTS.map((slot) => [slot, 0])) as CoverageMap;
}

export function assertSessionId(id: string): string | null {
  return /^[A-Za-z0-9_-]{1,80}$/.test(id) ? id : null;
}

function sessionsRoot(): string {
  return path.join(process.cwd(), "data", "sessions");
}

function sessionDir(id: string): string {
  return path.join(sessionsRoot(), id);
}

function sessionPath(id: string): string {
  return path.join(sessionDir(id), "session.json");
}

function playbookPath(id: string): string {
  return path.join(sessionDir(id), "playbook.json");
}

function withLock<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const run = previous.then(task, task);
  locks.set(
    id,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function isCoverage(value: unknown): value is CoverageMap {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CoverageMap>;
  return COVERAGE_SLOTS.every((slot) => typeof record[slot] === "number" && Number.isFinite(record[slot]));
}

function isStatus(value: unknown): value is SessionStatus {
  return typeof value === "string" && SESSION_STATUSES.includes(value as SessionStatus);
}

function isTurn(value: unknown): value is TranscriptTurn {
  if (!value || typeof value !== "object") return false;
  const turn = value as TranscriptTurn;
  return (
    typeof turn.id === "string" &&
    (turn.speaker === "interviewer" || turn.speaker === "leader") &&
    typeof turn.text === "string"
  );
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const session = value as Session;
  return (
    typeof session.id === "string" &&
    typeof session.role === "string" &&
    Array.isArray(session.transcript) &&
    session.transcript.every(isTurn) &&
    isCoverage(session.coverage) &&
    isStatus(session.status)
  );
}

function mergeCoverage(current: CoverageMap, patch: unknown): CoverageMap {
  const next = { ...current };
  if (!patch || typeof patch !== "object") return next;
  const record = patch as Partial<CoverageMap>;
  for (const slot of COVERAGE_SLOTS) {
    const value = record[slot];
    if (typeof value === "number" && Number.isFinite(value)) {
      next[slot] = Math.min(1, Math.max(0, value));
    }
  }
  return next;
}

export async function createSession(input: CreateSessionInput = {}): Promise<Session> {
  const id = crypto.randomUUID();
  const transcript = input.transcript ?? [];
  const session: Session = {
    id,
    role: input.role?.trim() || "eng_manager",
    transcript,
    coverage: input.coverage ?? emptyCoverage(),
    status: input.status ?? (transcript.length > 0 ? "ready_to_synthesize" : "created"),
  };
  await withLock(id, () => writeJson(sessionPath(id), session));
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  const safeId = assertSessionId(id);
  if (!safeId) return null;
  try {
    const raw = await readFile(sessionPath(safeId), "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : null;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function updateSession(id: string, patch: SessionPatch): Promise<Session | null> {
  const safeId = assertSessionId(id);
  if (!safeId) return null;
  return withLock(safeId, async () => {
    const current = await getSession(safeId);
    if (!current) return null;
    const next: Session = {
      ...current,
      role: typeof patch.role === "string" && patch.role.trim() ? patch.role.trim() : current.role,
      transcript: patch.transcript ? patch.transcript.filter(isTurn) : current.transcript,
      coverage: patch.coverage ? mergeCoverage(current.coverage, patch.coverage) : current.coverage,
      status: patch.status && isStatus(patch.status) ? patch.status : current.status,
    };
    if (typeof patch.playbook_id === "string" && patch.playbook_id.trim()) {
      next.playbook_id = patch.playbook_id.trim();
    } else if (current.playbook_id) {
      next.playbook_id = current.playbook_id;
    }
    await writeJson(sessionPath(safeId), next);
    return next;
  });
}

export async function savePlaybook(sessionId: string, playbook: Playbook): Promise<void> {
  const safeId = assertSessionId(sessionId);
  if (!safeId) throw new Error("Invalid session id");
  await withLock(safeId, () => writeJson(playbookPath(safeId), playbook));
}

export async function getPlaybook(sessionId: string): Promise<Playbook | null> {
  const safeId = assertSessionId(sessionId);
  if (!safeId) return null;
  try {
    const raw = await readFile(playbookPath(safeId), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const playbook = parsed as Playbook;
    if (typeof playbook.id !== "string" || !playbook.subject) return null;
    return playbook;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function audioDir(sessionId: string): string {
  const safeId = assertSessionId(sessionId);
  if (!safeId) throw new Error("Invalid session id");
  return path.join(sessionDir(safeId), "audio");
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}
