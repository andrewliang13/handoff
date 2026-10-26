import type { Playbook, QaResponse, Transcript, TranscriptTurn } from "../../types";

/** Owned by Agent-QA. */
export const OWNER = "Agent-QA" as const;

/** Successor questions outside the interview use this sentence. */
export const HANDOFF_ABSTAIN_TEXT = "That is not covered in handoff.";

export type SuccessorQuestionInput = {
  playbook: Playbook;
  transcript: Transcript;
  question: string;
};

const STOPWORDS = new Set([
  "what",
  "who",
  "whom",
  "whose",
  "how",
  "when",
  "where",
  "why",
  "which",
  "the",
  "a",
  "an",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "do",
  "does",
  "did",
  "can",
  "could",
  "should",
  "would",
  "will",
  "shall",
  "to",
  "of",
  "for",
  "in",
  "on",
  "at",
  "by",
  "with",
  "from",
  "into",
  "about",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "that",
  "this",
  "these",
  "those",
  "me",
  "my",
  "your",
  "you",
  "we",
  "our",
  "they",
  "their",
  "it",
  "its",
  "tell",
  "please",
  "next",
  "new",
  "manager",
  "successor",
  "handoff",
  "playbook",
  "interview",
  "covered",
  "not",
  "any",
  "there",
  "this",
]);

const SKIP_PROPER = new Set([
  "What",
  "Who",
  "Whom",
  "Whose",
  "How",
  "When",
  "Where",
  "Why",
  "Which",
  "Tell",
  "Does",
  "Did",
  "Can",
  "Could",
  "Should",
  "Would",
  "Is",
  "Are",
  "Was",
  "Were",
  "The",
  "A",
  "An",
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
  "Pacific",
]);

type Chunk = {
  text: string;
  source_turn_ids: string[];
  origin: "playbook" | "transcript";
};

function abstain(): QaResponse {
  return {
    kind: "abstain",
    text: HANDOFF_ABSTAIN_TEXT,
    source_turn_ids: [],
  };
}

function terms(value: string): string[] {
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
      ?.filter((term) => term.length > 2 && !STOPWORDS.has(term)) ?? []
  );
}

function hasTerm(haystack: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function focus(text: string, questionTerms: string[]): string {
  const parts = sentences(text);
  const hits = parts.filter((part) => questionTerms.some((term) => hasTerm(part, term)));
  return (hits.length ? hits : parts).join(" ");
}

function mentionsUnknownProperNoun(question: string, corpus: string): boolean {
  const names = question.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) ?? [];
  for (const name of names) {
    const [first, second] = name.split(" ");
    if (!first || !second) continue;
    if (SKIP_PROPER.has(first) || SKIP_PROPER.has(second)) continue;
    if (!corpus.includes(name)) return true;
  }
  const words = question.match(/\b[A-Z][a-z]{3,}\b/g) ?? [];
  return words.some((word) => {
    if (SKIP_PROPER.has(word)) return false;
    return !hasTerm(corpus, word);
  });
}

function playbookChunks(playbook: Playbook, allowed: Set<string>): Chunk[] {
  const cite = (ids: string[]) => ids.filter((id) => allowed.has(id));
  const chunks: Chunk[] = [];
  const push = (text: string, ids: string[]) => {
    const source_turn_ids = cite(ids);
    if (!text.trim() || !source_turn_ids.length) return;
    chunks.push({ text, source_turn_ids, origin: "playbook" });
  };
  const subject = playbook.subject;
  push(
    `${subject.departing_leader} is the departing leader for ${subject.role} at ${subject.company}.`,
    subject.source_turn_ids,
  );
  for (const entry of playbook.role_map) {
    push(`${entry.owner} owns ${entry.area}. ${entry.responsibility}`, entry.source_turn_ids);
  }
  for (const entry of playbook.decision_log) {
    push(`${entry.decision} ${entry.rationale}`, entry.source_turn_ids);
  }
  for (const entry of playbook.landmines) {
    push(`${entry.risk} ${entry.mitigation}`, entry.source_turn_ids);
  }
  for (const entry of playbook.sops) {
    push(`${entry.when} ${entry.steps.join(" ")}`, entry.source_turn_ids);
  }
  for (const entry of playbook.day_one_checklist) push(entry.text, entry.source_turn_ids);
  for (const entry of playbook.people_map) {
    push(`${entry.name}, ${entry.role}. ${entry.context}`, entry.source_turn_ids);
  }
  for (const entry of playbook.open_questions) {
    push(`${entry.question} ${entry.reason}`, entry.source_turn_ids);
  }
  return chunks;
}

function transcriptChunks(turns: TranscriptTurn[]): Chunk[] {
  return turns.map((turn) => ({
    text: turn.text,
    source_turn_ids: [turn.id],
    origin: "transcript" as const,
  }));
}

function scoreChunk(questionTerms: string[], text: string): number {
  return questionTerms.reduce((total, term) => {
    if (!hasTerm(text, term)) return total;
    return total + (term.length >= 6 ? 2 : 1);
  }, 0);
}

function answerFrom(chunk: Chunk, questionTerms: string[]): QaResponse {
  const text = focus(chunk.text, questionTerms).trim();
  if (!text) return abstain();
  return {
    kind: "answer",
    text,
    source_turn_ids: chunk.source_turn_ids,
  };
}

/**
 * Answer a successor from the playbook and transcript only.
 * Questions the interview never covered abstain, with no citations.
 */
export function answerSuccessorQuestion(input: SuccessorQuestionInput): QaResponse {
  const question = input.question.trim();
  if (!question) return abstain();
  const allowed = new Set(input.transcript.turns.map((turn) => turn.id));
  const corpus = [
    input.transcript.turns.map((turn) => turn.text).join("\n"),
    input.playbook.subject.departing_leader,
    input.playbook.subject.company,
    input.playbook.subject.role,
  ].join("\n");
  if (mentionsUnknownProperNoun(question, corpus)) return abstain();

  const boilerplate = new Set(terms(input.transcript.company));
  const questionTerms = terms(question).filter((term) => !boilerplate.has(term));
  if (!questionTerms.length) return abstain();

  const chunks = [
    ...playbookChunks(input.playbook, allowed),
    ...transcriptChunks(input.transcript.turns),
  ];
  let best: { chunk: Chunk; score: number } | null = null;
  for (const chunk of chunks) {
    const score = scoreChunk(questionTerms, chunk.text) + (chunk.origin === "playbook" ? 0.25 : 0);
    if (!best || score > best.score) best = { chunk, score };
  }
  if (!best) return abstain();
  const strongEnough =
    best.score >= 2 ||
    (questionTerms.length === 1 && best.score >= 1 && (questionTerms[0]?.length ?? 0) >= 4);
  if (!strongEnough) return abstain();
  return answerFrom(best.chunk, questionTerms);
}

/** Prompt for a later model call. `answerSuccessorQuestion` does not call a model. */
export function buildQaPrompt(input: SuccessorQuestionInput): string {
  return [
    "You are the Handoff successor assistant.",
    "Answer only from the playbook and the transcript. Do not use world knowledge.",
    "If the interview does not support the answer, abstain. The abstain text must include \"not covered in handoff\".",
    "Abstain with an empty source_turn_ids array. An answer must cite turn ids that exist on the transcript.",
    "Do not invent people. If the question names someone who never appears, abstain.",
    "",
    `Question: ${input.question}`,
    `Playbook: ${JSON.stringify(input.playbook)}`,
    `Transcript: ${JSON.stringify(input.transcript)}`,
    `Required abstain sentence: ${HANDOFF_ABSTAIN_TEXT}`,
  ].join("\n");
}
