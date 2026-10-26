import type { CoverageMap } from "./coverage";
import type { TranscriptTurn } from "./transcript";

export type SessionStatus =
  | "created"
  | "interviewing"
  | "ready_to_synthesize"
  | "synthesized"
  | "failed";

/**
 * One handoff interview.
 * `role` is a product role key such as "eng_manager", not a person's job title.
 */
export type Session = {
  id: string;
  role: string;
  transcript: TranscriptTurn[];
  coverage: CoverageMap;
  status: SessionStatus;
  playbook_id?: string;
};
