/** Owned by Backend-Session. JSON sessions live in data/sessions. */
export const OWNER = "Backend-Session" as const;

export {
  assertSessionId,
  audioDir,
  createSession,
  emptyCoverage,
  getPlaybook,
  getSession,
  savePlaybook,
  updateSession,
} from "./store";
export type { CreateSessionInput, SessionPatch } from "./store";
