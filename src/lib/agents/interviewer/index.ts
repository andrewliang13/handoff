import { COVERAGE_SLOTS } from "../../types";
import type { CoverageMap, CoverageSlot, Session, TranscriptTurn } from "../../types";

/** Owned by Agent-Interviewer. */
export const OWNER = "Agent-Interviewer" as const;

/** Stop after this many transcript turns, including the answer just given. */
export const TURN_CAP = 12;

/** A slot at or above this score is strong enough to leave alone. */
export const COVERAGE_STRONG = 0.7;

export type EngManagerQuestion = {
  question: string;
  /** Sharper follow-up for a weak slot, including a vague "it depends". */
  probe: string;
};

/**
 * Engineering-manager exit interview. The interviewer asks only from this bank,
 * and only for slots that are still below `COVERAGE_STRONG`.
 */
export const ENG_MANAGER_QUESTION_BANK: Record<CoverageSlot, EngManagerQuestion> = {
  owners: {
    question:
      "Who owns each part of the team you are leaving, and which work do you still hold until your last day?",
    probe:
      "Be specific. Name each person and the area they own. A vague 'it depends' does not hand off ownership.",
  },
  decision_rules: {
    question:
      "Which decisions should the next manager leave closed, and what forced each one?",
    probe:
      "Be specific. State the decision, what triggered it, and who can reopen it. 'It depends' needs one concrete case.",
  },
  landmines: {
    question: "What blows up in the first month if the new manager is careless?",
    probe:
      "Be specific. Name the landmine, the time window or system, and what fails if they touch it.",
  },
  sops: {
    question:
      "Walk through the rituals the successor must run, in order. Include deploy, incident, and planning.",
    probe:
      "Be specific. Give the steps in order, with the cutoff and the person who approves or gets paged.",
  },
  people_map: {
    question:
      "Who else matters to the successor, and what should they know about each person?",
    probe:
      "Be specific. Name the person, their role, and the mistake the successor will make without that context.",
  },
  on_call_escalation: {
    question: "How do on-call and escalation work, including after hours?",
    probe:
      "Be specific. Who gets the page, on which service, and when do you escalate past them?",
  },
  tribal_knowledge: {
    question:
      "What is still unwritten: contracts, exceptions, or rules that live only in your head?",
    probe:
      "Be specific. State the unwritten rule, or say you do not know and name who to ask. 'It depends' is not a rule.",
  },
};

export type InterviewTurnInput = {
  session: Session;
  userAnswer?: string;
};

export type InterviewTurnResult = {
  /** Next question. Null when `done` is true. */
  question: string | null;
  coverage: CoverageMap;
  done: boolean;
};

const SLOT_SIGNALS: Record<Exclude<CoverageSlot, "people_map">, RegExp[]> = {
  owners: [/\bowns?\b/i, /\bdirector\b/i, /\bengineers?\b/i],
  decision_rules: [/\bfroze\b/i, /\bfrozen\b/i, /\bstopped\b/i, /\bno new\b/i, /\bpermanent\b/i],
  landmines: [/\blandmines?\b/i, /\bfreeze\b/i, /\bwebhook secret\b/i, /\brotate\b/i],
  sops: [/\bapprove\b/i, /\bmerges?\b/i, /\bbefore \d{1,2}:\d{2}\b/i, /\bchange list\b/i],
  on_call_escalation: [/\bpagerduty\b/i, /\bescalat/i, /\bpage\b/i, /\bslack\b/i],
  tribal_knowledge: [
    /\bdo not know\b/i,
    /\bnever wrote\b/i,
    /\bnever assigned\b/i,
    /\b1password\b/i,
    /\bi guessed\b/i,
  ],
};

const NOT_A_PERSON = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "Platform",
  "Pacific",
  "Northline",
  "Drive",
  "Labs",
]);

function blankCoverage(): CoverageMap {
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

function signalScore(text: string, patterns: RegExp[]): number {
  const hits = patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
  if (hits >= 2) return 1;
  if (hits === 1) return 0.75;
  return 0;
}

function introducedPersonNames(text: string): string[] {
  const names: string[] = [];
  const re = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
  for (const match of text.matchAll(re)) {
    const name = match[0];
    const [first, second] = name.split(" ");
    if (!first || !second || NOT_A_PERSON.has(first) || NOT_A_PERSON.has(second)) continue;
    const index = match.index ?? 0;
    const prefix = text.slice(0, index);
    const atSentenceStart = prefix.trim() === "" || /[.!?]\s*$/.test(prefix);
    const after = text.slice(index + name.length);
    const introduced = /^, you\b/.test(after) || /^\s+owns\b/.test(after);
    if (atSentenceStart && !introduced) continue;
    names.push(name);
  }
  return names;
}

function peopleScore(text: string): number {
  const people = new Set(introducedPersonNames(text));
  if (people.size >= 3) return 1;
  if (people.size === 2) return 0.75;
  if (people.size === 1) return 0.45;
  return 0;
}

function scoreCoverage(turns: TranscriptTurn[]): CoverageMap {
  const text = turns
    .filter((turn) => turn.speaker === "leader")
    .map((turn) => turn.text)
    .join("\n");
  if (!text.trim()) return blankCoverage();
  return {
    owners: signalScore(text, SLOT_SIGNALS.owners),
    decision_rules: signalScore(text, SLOT_SIGNALS.decision_rules),
    landmines: signalScore(text, SLOT_SIGNALS.landmines),
    sops: signalScore(text, SLOT_SIGNALS.sops),
    people_map: peopleScore(text),
    on_call_escalation: signalScore(text, SLOT_SIGNALS.on_call_escalation),
    tribal_knowledge: signalScore(text, SLOT_SIGNALS.tribal_knowledge),
  };
}

function coverageIsStrong(coverage: CoverageMap): boolean {
  return COVERAGE_SLOTS.every((slot) => coverage[slot] >= COVERAGE_STRONG);
}

/**
 * "It depends" without a named person or a clock time is not a handoff.
 * A longer answer that then names an owner or a time is concrete.
 */
function isVagueAnswer(answer: string): boolean {
  if (!/\bit depends\b/i.test(answer)) return false;
  if (/\b[A-Z][a-z]+ [A-Z][a-z]+\b/.test(answer)) return false;
  if (/\b\d{1,2}:\d{2}\b/.test(answer)) return false;
  return true;
}

function withAnswer(turns: TranscriptTurn[], userAnswer: string | undefined): TranscriptTurn[] {
  const next = turns.map((turn) => ({ ...turn }));
  const answer = userAnswer?.trim() ?? "";
  if (!answer) return next;
  const last = next[next.length - 1];
  if (last?.speaker === "leader" && last.text.trim() === answer) return next;
  next.push({
    id: `local-${next.length + 1}`,
    speaker: "leader",
    text: answer,
  });
  return next;
}

function withoutVagueTail(turns: TranscriptTurn[], vague: boolean): TranscriptTurn[] {
  if (!vague) return turns;
  const next = turns.slice();
  for (let index = next.length - 1; index >= 0; index -= 1) {
    if (next[index]?.speaker === "leader") {
      next.splice(index, 1);
      break;
    }
  }
  return next;
}

function slotForQuestion(text: string): CoverageSlot | null {
  for (const slot of COVERAGE_SLOTS) {
    const bank = ENG_MANAGER_QUESTION_BANK[slot];
    if (text === bank.question || text === bank.probe) return slot;
  }
  return null;
}

function lastBankSlot(turns: TranscriptTurn[]): CoverageSlot | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn?.speaker !== "interviewer") continue;
    return slotForQuestion(turn.text);
  }
  return null;
}

function weakestOpenSlot(coverage: CoverageMap): CoverageSlot | null {
  const weak = COVERAGE_SLOTS.filter((slot) => coverage[slot] < COVERAGE_STRONG).sort(
    (left, right) =>
      coverage[left] - coverage[right] ||
      COVERAGE_SLOTS.indexOf(left) - COVERAGE_SLOTS.indexOf(right),
  );
  return weak[0] ?? null;
}

function pickQuestion(turns: TranscriptTurn[], coverage: CoverageMap, vague: boolean): string | null {
  const asked = new Set(
    turns.filter((turn) => turn.speaker === "interviewer").map((turn) => turn.text),
  );
  if (vague) {
    const slot = lastBankSlot(turns) ?? weakestOpenSlot(coverage);
    if (slot && coverage[slot] < COVERAGE_STRONG && !asked.has(ENG_MANAGER_QUESTION_BANK[slot].probe)) {
      return ENG_MANAGER_QUESTION_BANK[slot].probe;
    }
  }
  const weak = COVERAGE_SLOTS.filter((slot) => coverage[slot] < COVERAGE_STRONG).sort(
    (left, right) =>
      coverage[left] - coverage[right] ||
      COVERAGE_SLOTS.indexOf(left) - COVERAGE_SLOTS.indexOf(right),
  );
  for (const slot of weak) {
    if (!asked.has(ENG_MANAGER_QUESTION_BANK[slot].question)) {
      return ENG_MANAGER_QUESTION_BANK[slot].question;
    }
  }
  for (const slot of weak) {
    if (!asked.has(ENG_MANAGER_QUESTION_BANK[slot].probe)) {
      return ENG_MANAGER_QUESTION_BANK[slot].probe;
    }
  }
  return null;
}

/**
 * One engineering-manager interview step.
 * Scores the transcript plus `userAnswer`, then asks about the weakest open slot.
 * A vague "it depends" gets that slot's sharper probe. Stops at strong coverage or 12 turns.
 * Does not mutate `session`.
 */
export function nextInterviewTurn(input: InterviewTurnInput): InterviewTurnResult {
  const answer = input.userAnswer?.trim() ?? "";
  const existing = input.session.transcript;
  const last = existing[existing.length - 1];
  if (!answer && last?.speaker === "interviewer") {
    const coverage = scoreCoverage(existing);
    const done = existing.length >= TURN_CAP || coverageIsStrong(coverage);
    return { question: done ? null : last.text, coverage, done };
  }

  const turns = withAnswer(existing, answer);
  const vague = isVagueAnswer(answer);
  const coverage = scoreCoverage(withoutVagueTail(turns, vague));
  const doneByCap = turns.length >= TURN_CAP;
  const doneByCoverage = coverageIsStrong(coverage);
  if (doneByCap || doneByCoverage) {
    return { question: null, coverage, done: true };
  }
  const question = pickQuestion(turns, coverage, vague);
  if (!question) return { question: null, coverage, done: true };
  return { question, coverage, done: false };
}

/** Prompt for a later model call. The live loop uses `nextInterviewTurn` with no API key. */
export function buildInterviewerPrompt(input: InterviewTurnInput): string {
  const preview = nextInterviewTurn(input);
  const bank = COVERAGE_SLOTS.map((slot) => {
    const entry = ENG_MANAGER_QUESTION_BANK[slot];
    return `${slot}\nquestion: ${entry.question}\nprobe: ${entry.probe}`;
  }).join("\n\n");
  return [
    "You are the Handoff interviewer for an engineering manager leaving their role.",
    "Maximize coverage. Do not chat. Ask one question, only about a weak slot.",
    `Slots: ${COVERAGE_SLOTS.join(", ")}.`,
    `A slot is strong at ${COVERAGE_STRONG} or above. Stop then, or at ${TURN_CAP} transcript turns, whichever comes first.`,
    "If the leader says \"it depends\" without a named person or a clock time, ask the sharper probe for that slot.",
    "Do not invent people, systems, or decisions.",
    "",
    "Question bank:",
    bank,
    "",
    `Role: ${input.session.role || "eng_manager"}`,
    `Coverage: ${JSON.stringify(preview.coverage)}`,
    `Transcript: ${JSON.stringify(input.session.transcript)}`,
    `Latest answer: ${input.userAnswer?.trim() || "(none)"}`,
    `Recommended question: ${preview.question ?? "(stop)"}`,
    `Done: ${preview.done}`,
  ].join("\n");
}
