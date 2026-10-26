import type { QaView } from "@/components/interview/client";
import type { Playbook, TranscriptTurn } from "@/lib/types";

const ABSTAIN: QaView = {
  kind: "abstain",
  text: "not covered in handoff",
  source_turn_ids: [],
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
  search: string;
  answer: string;
  source_turn_ids: string[];
  origin: "playbook" | "transcript";
  /** People this claim is about, not every name it happens to mention. */
  focusNames: Set<string>;
  kind: "person" | "other";
};

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

function nameTokens(playbook: Playbook | null): Set<string> {
  const names = new Set<string>();
  if (!playbook) return names;
  const labeled = [
    playbook.subject.departing_leader,
    ...playbook.role_map.map((entry) => entry.owner),
    ...playbook.people_map.flatMap((entry) => [entry.name, entry.role]),
  ];
  for (const value of labeled) {
    for (const match of value.match(/\b[A-Z][a-z]{2,}\b/g) ?? []) {
      if (!SKIP_PROPER.has(match)) names.add(match.toLowerCase());
    }
  }
  return names;
}

function personTokens(value: string): Set<string> {
  const names = new Set<string>();
  for (const match of value.match(/\b[A-Z][a-z]{2,}\b/g) ?? []) {
    if (!SKIP_PROPER.has(match)) names.add(match.toLowerCase());
  }
  return names;
}

function playbookChunks(playbook: Playbook, allowed: Set<string>): Chunk[] {
  const chunks: Chunk[] = [];
  const push = (
    search: string,
    answer: string,
    ids: string[],
    focusNames: Set<string>,
    kind: Chunk["kind"] = "other",
  ) => {
    const source_turn_ids = ids.filter((id) => allowed.has(id));
    if (!search.trim() || !answer.trim() || !source_turn_ids.length) return;
    chunks.push({ search, answer, source_turn_ids, origin: "playbook", focusNames, kind });
  };
  const subject = playbook.subject;
  const subjectText = `${subject.departing_leader} is the departing leader for ${subject.role} at ${subject.company}.`;
  push(subjectText, subjectText, subject.source_turn_ids, personTokens(subject.departing_leader));
  for (const entry of playbook.role_map) {
    const text = `${entry.owner} owns ${entry.area}. ${entry.responsibility}`;
    push(`${entry.area} ${text}`, text, entry.source_turn_ids, personTokens(entry.owner));
  }
  for (const entry of playbook.decision_log) {
    const answer = `${entry.decision} ${entry.rationale}`;
    push(`decision ${entry.title} ${answer}`, answer, entry.source_turn_ids, new Set());
  }
  for (const entry of playbook.landmines) {
    const answer = `${entry.risk} ${entry.mitigation}`;
    push(`${entry.title} ${answer}`, answer, entry.source_turn_ids, new Set());
  }
  for (const entry of playbook.sops) {
    const answer = `${entry.when} ${entry.steps.join(" ")}`;
    push(`${entry.name} ${answer}`, answer, entry.source_turn_ids, new Set());
  }
  for (const entry of playbook.day_one_checklist) {
    push(entry.text, entry.text, entry.source_turn_ids, new Set());
  }
  for (const entry of playbook.people_map) {
    const text = `${entry.name}, ${entry.role}. ${entry.context}`;
    push(text, text, entry.source_turn_ids, personTokens(entry.name), "person");
  }
  for (const entry of playbook.open_questions) {
    const answer = `${entry.question} ${entry.reason}`;
    push(answer, answer, entry.source_turn_ids, new Set());
  }
  return chunks;
}

function transcriptChunks(turns: TranscriptTurn[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (!turn) continue;
    const next = turns[index + 1];
    if (turn.speaker === "interviewer" && next?.speaker === "leader") {
      chunks.push({
        search: `${turn.text} ${next.text}`,
        answer: next.text,
        source_turn_ids: [turn.id, next.id],
        origin: "transcript",
        focusNames: new Set(),
        kind: "other",
      });
      index += 1;
      continue;
    }
    chunks.push({
      search: turn.text,
      answer: turn.text,
      source_turn_ids: [turn.id],
      origin: "transcript",
      focusNames: new Set(),
      kind: "other",
    });
  }
  return chunks;
}

function scoreChunk(questionTerms: string[], text: string): number {
  return questionTerms.reduce((total, term) => {
    if (!hasTerm(text, term)) return total;
    return total + (term.length >= 6 ? 2 : 1);
  }, 0);
}

function matchedCount(questionTerms: string[], text: string): number {
  return questionTerms.filter((term) => hasTerm(text, term)).length;
}

function isClear(questionTerms: string[], raw: number, matched: number, names: Set<string>): boolean {
  if (raw <= 0 || matched <= 0) return false;
  if (questionTerms.length === 1) {
    const term = questionTerms[0] ?? "";
    if (names.has(term)) return true;
    return term.length >= 6 && raw >= 2;
  }
  return raw >= 2 && matched / questionTerms.length >= 0.5;
}

/**
 * Cite-or-abstain answer for the in-memory sample handoff.
 * A real session still goes through POST /api/qa.
 */
export function answerSampleQuestion(input: {
  question: string;
  playbook: Playbook | null;
  turns: TranscriptTurn[];
}): QaView {
  const question = input.question.trim();
  if (!question) return ABSTAIN;

  const allowed = new Set(input.turns.map((turn) => turn.id));
  const chunks = [
    ...(input.playbook ? playbookChunks(input.playbook, allowed) : []),
    ...transcriptChunks(input.turns),
  ];
  const corpus = chunks.map((chunk) => chunk.search).join("\n");
  if (mentionsUnknownProperNoun(question, corpus)) return ABSTAIN;

  const boilerplate = new Set(terms(input.playbook?.subject.company ?? ""));
  const questionTerms = terms(question).filter((term) => !boilerplate.has(term));
  if (!questionTerms.length || !chunks.length) return ABSTAIN;
  // Abstain only when every specific word is absent. A framing word like "decision" can miss.
  const distinctive = questionTerms.filter((term) => term.length >= 5);
  if (distinctive.length > 0 && distinctive.every((term) => !hasTerm(corpus, term))) return ABSTAIN;

  const names = nameTokens(input.playbook);
  const onlyNames = questionTerms.every((term) => names.has(term));
  let best: { chunk: Chunk; raw: number; rank: number; matched: number } | null = null;
  for (const chunk of chunks) {
    const raw = scoreChunk(questionTerms, chunk.search);
    const matched = matchedCount(questionTerms, chunk.search);
    const specificity = matched / Math.max(terms(chunk.search).length, 1);
    const nameHits = questionTerms.filter((term) => chunk.focusNames.has(term)).length;
    const aboutPerson = onlyNames && chunk.kind === "person" ? 0.5 : 0;
    const rank =
      raw + (chunk.origin === "playbook" ? 0.25 : 0) + nameHits * 2 + aboutPerson + specificity * 0.15;
    if (!best || rank > best.rank) best = { chunk, raw, rank, matched };
  }
  if (!best || !isClear(questionTerms, best.raw, best.matched, names)) return ABSTAIN;

  const focused = focus(best.chunk.answer, questionTerms).trim();
  const text =
    best.chunk.origin === "playbook"
      ? best.chunk.answer.trim()
      : focused.length >= 40
        ? focused
        : best.chunk.answer.trim();
  if (!text) return ABSTAIN;
  return { kind: "answer", text, source_turn_ids: best.chunk.source_turn_ids };
}
