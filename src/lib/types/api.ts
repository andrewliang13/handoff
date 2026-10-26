import type { CoverageMap } from "./coverage";
import type { Playbook } from "./playbook";
import type { Session } from "./session";
import type { TranscriptTurn } from "./transcript";

/** POST /api/synthesize — Backend-API route, Agent-Synthesizer implementation. */
export type SynthesizeRequest = {
  session_id: string;
};

export type SynthesizeResponse = {
  playbook: Playbook;
};

/**
 * POST /api/interview/step — Backend-API route, Agent-Interviewer implementation.
 * Omit `answer` on the first call to receive the opening question.
 */
export type InterviewStepRequest = {
  session_id: string;
  answer?: string;
};

export type InterviewStepResponse = {
  session: Session;
  /** Next question. Null when `done` is true. */
  question: string | null;
  coverage: CoverageMap;
  done: boolean;
};

/** POST /api/qa — Backend-API route, Agent-QA implementation. */
export type QaRequest = {
  session_id: string;
  question: string;
};

export type QaAnswer = {
  kind: "answer";
  text: string;
  source_turn_ids: string[];
};

/** Abstain carries no citations. The interview did not cover the question. */
export type QaAbstain = {
  kind: "abstain";
  text: string;
  source_turn_ids: [];
};

export type QaResponse = QaAnswer | QaAbstain;

/**
 * POST /api/voice/upload — Backend-Voice.
 * The body is multipart/form-data. `file` is the audio. Other fields are text.
 */
export type VoiceUploadRequest = {
  file: Blob;
  session_id?: string;
  role?: string;
};

export type VoiceUploadResponse = {
  session_id: string;
  transcript: TranscriptTurn[];
};
