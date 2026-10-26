import * as interviewer from "@/lib/agents/interviewer";
import * as qaAgent from "@/lib/agents/qa";
import * as synthesizer from "@/lib/agents/synthesizer";

import {
  COVERAGE_SLOTS,
  type CoverageMap,
  type Playbook,
  type Session,
  type Transcript,
  type TranscriptTurn,
} from "@/lib/types";

import { emptyCoverage } from "@/lib/session/store";

type InterviewResult = {
  question: string | null;
  coverage: CoverageMap;
  done: boolean;
};

type InterviewTurn = (input: { session: Session; userAnswer?: string }) => Promise<InterviewResult> | InterviewResult;

type Synthesize = (input: { transcript: Transcript; coverage: CoverageMap }) => Promise<Playbook> | Playbook;

type SuccessorAnswer = {
  kind: "answer" | "abstain";
  text: string;
  source_turn_ids: string[];
};

type SuccessorQuestion = (input: {
  playbook: Playbook;
  transcript: Transcript;
  question: string;
}) => Promise<SuccessorAnswer> | SuccessorAnswer;

const TURN_CAP = 12;

/**
 * Agent folders already contain non-empty owner stubs. Those files stay untouched.
 * When the specialist exports land, these calls use them. Until then, the fallbacks typecheck.
 */
export async function nextInterviewTurn(input: { session: Session; userAnswer?: string }): Promise<InterviewResult> {
  const exported = (interviewer as { nextInterviewTurn?: InterviewTurn }).nextInterviewTurn;
  if (typeof exported === "function") {
    const result = await exported(input);
    return normalizeInterview(result, input.session.coverage);
  }
  return fallbackInterview(input);
}

export async function synthesizePlaybook(input: { transcript: Transcript; coverage: CoverageMap }): Promise<Playbook> {
  const exported = (synthesizer as { synthesizePlaybook?: Synthesize }).synthesizePlaybook;
  if (typeof exported === "function") {
    return exported(input);
  }
  return fallbackPlaybook(input.transcript);
}

export async function answerSuccessorQuestion(input: {
  playbook: Playbook;
  transcript: Transcript;
  question: string;
}): Promise<SuccessorAnswer> {
  const exported = (qaAgent as { answerSuccessorQuestion?: SuccessorQuestion }).answerSuccessorQuestion;
  if (typeof exported === "function") {
    const result = await exported(input);
    return normalizeQa(result);
  }
  return {
    kind: "abstain",
    text: "This was not covered in handoff.",
    source_turn_ids: [],
  };
}

function fallbackInterview(input: { session: Session; userAnswer?: string }): InterviewResult {
  const coverage = input.session.coverage ?? emptyCoverage();
  const answered = input.userAnswer?.trim() ? 1 : 0;
  const turnCount = input.session.transcript.length + answered;
  if (turnCount >= TURN_CAP) {
    return { question: null, coverage, done: true };
  }
  const vague = Boolean(input.userAnswer && /it depends/i.test(input.userAnswer));
  const opening = input.session.transcript.length === 0 && !input.userAnswer?.trim();
  const question = vague
    ? "Name the specific case it depends on, and who makes that call."
    : opening
      ? "Who owns the work you are handing off, and what does each person decide?"
      : "What is still easy to get wrong on the first day?";
  return { question, coverage, done: false };
}

function fallbackPlaybook(transcript: Transcript): Playbook {
  const cited = transcript.turns[0]?.id;
  const source_turn_ids = cited ? [cited] : [];
  return {
    id: `playbook-${transcript.id}`,
    transcript_id: transcript.id,
    subject: {
      company: transcript.company || "Northline Labs",
      role: transcript.role || "eng_manager",
      departing_leader: "Unknown",
      source_turn_ids,
    },
    role_map: [],
    decision_log: [],
    landmines: [],
    sops: [],
    day_one_checklist: [],
    people_map: [],
    open_questions: [
      {
        id: "oq-pending-synthesizer",
        question: "What should the successor know that this interview has not captured yet?",
        reason: "The synthesizer export is not loaded, so no claims were written.",
        source_turn_ids,
      },
    ],
  };
}

function normalizeInterview(result: InterviewResult, fallback: CoverageMap): InterviewResult {
  const coverage = isCoverage(result?.coverage) ? result.coverage : fallback;
  const question = typeof result?.question === "string" ? result.question : null;
  return { question, coverage, done: Boolean(result?.done) };
}

function normalizeQa(result: SuccessorAnswer): SuccessorAnswer {
  const text = typeof result?.text === "string" && result.text.trim() ? result.text : "This was not covered in handoff.";
  if (result?.kind === "abstain") {
    return { kind: "abstain", text, source_turn_ids: [] };
  }
  const source_turn_ids = Array.isArray(result?.source_turn_ids)
    ? result.source_turn_ids.filter((id): id is string => typeof id === "string")
    : [];
  return { kind: "answer", text, source_turn_ids };
}

function isCoverage(value: unknown): value is CoverageMap {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CoverageMap>;
  return COVERAGE_SLOTS.every((slot) => typeof record[slot] === "number" && Number.isFinite(record[slot]));
}

export function transcriptFromSession(session: Session, company?: string): Transcript {
  return {
    id: session.id,
    company: company?.trim() || "Northline Labs",
    role: session.role,
    turns: session.transcript,
  };
}

export function leaderTurn(text: string): TranscriptTurn {
  return {
    id: `t-${crypto.randomUUID()}`,
    speaker: "leader",
    text,
  };
}
