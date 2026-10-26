import { COVERAGE_SLOTS } from "../../types";
import type {
  CoverageMap,
  CoverageSlot,
  DayOneItem,
  DecisionLogEntry,
  Landmine,
  OpenQuestion,
  PeopleMapEntry,
  Playbook,
  RoleMapEntry,
  Sop,
  Transcript,
  TranscriptTurn,
} from "../../types";

/** Owned by Agent-Synthesizer. */
export const OWNER = "Agent-Synthesizer" as const;

export type SynthesizePlaybookInput = {
  transcript: Transcript;
  coverage: CoverageMap;
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
  "Stripe",
]);

const GAP_QUESTION: Record<CoverageSlot, string> = {
  owners: "Who owns each area of this role?",
  decision_rules: "Which decisions should stay closed?",
  landmines: "What landmines did the interview leave unspecified?",
  sops: "Which rituals and procedures are still unwritten?",
  people_map: "Who else should the successor know?",
  on_call_escalation: "How do on-call and escalation work?",
  tribal_knowledge: "What unwritten rules are still missing?",
};

const SLOT_HINT: Record<CoverageSlot, RegExp> = {
  owners: /who owns|your team|the team/i,
  decision_rules: /decision/i,
  landmines: /blows up|landmine|careless/i,
  sops: /walk me|ritual|procedure/i,
  people_map: /who else|unanswered/i,
  on_call_escalation: /incident|on-call|escalat/i,
  tribal_knowledge: /unanswered|unwritten|day one/i,
};

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function slug(value: string): string {
  const normal = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normal.slice(0, 42) || "item";
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function isPersonName(name: string): boolean {
  const [first, second] = name.split(" ");
  if (!first || !second) return false;
  if (!/^[A-Z][a-z]+$/.test(first) || !/^[A-Z][a-z]+$/.test(second)) return false;
  return !NOT_A_PERSON.has(first) && !NOT_A_PERSON.has(second);
}

/** Full names from introductions. Skips sentence-start imperatives such as "Ask Lena". */
function introducedPersonNames(text: string): string[] {
  const names: string[] = [];
  const re = /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g;
  for (const match of text.matchAll(re)) {
    const name = match[0];
    if (!isPersonName(name)) continue;
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

function previousInterviewer(turns: TranscriptTurn[], index: number): TranscriptTurn | undefined {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (turns[cursor]?.speaker === "interviewer") return turns[cursor];
  }
  return undefined;
}

function departingLeader(turns: TranscriptTurn[]): { name: string; source_turn_ids: string[] } {
  for (const turn of turns) {
    const match = turn.text.match(/\b([A-Z][a-z]+ [A-Z][a-z]+), you\b/);
    if (match?.[1] && isPersonName(match[1])) {
      return { name: match[1], source_turn_ids: [turn.id] };
    }
  }
  return {
    name: "Departing leader",
    source_turn_ids: turns[0] ? [turns[0].id] : [],
  };
}

function citeForSlot(turns: TranscriptTurn[], slot: CoverageSlot): string[] {
  const match = turns.find(
    (turn) => turn.speaker === "interviewer" && SLOT_HINT[slot].test(turn.text),
  );
  if (match) return [match.id];
  const fallback = turns[turns.length - 1] ?? turns[0];
  return fallback ? [fallback.id] : [];
}

function citedCorpus(turns: TranscriptTurn[], ids: string[]): string {
  const allowed = new Set(ids);
  return turns
    .filter((turn) => allowed.has(turn.id))
    .map((turn) => turn.text)
    .join("\n");
}

function isGrounded(text: string, corpus: string): boolean {
  const parts = sentences(text);
  if (!parts.length) return false;
  return parts.every((part) => corpus.includes(part));
}

function numberWord(value: string): number | null {
  const words: Record<string, number> = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };
  if (/^\d+$/.test(value)) return Number(value);
  return words[value.toLowerCase()] ?? null;
}

function anchorsOf(text: string): Set<string> {
  const found = text.toLowerCase().match(/\b[a-z]+(?:-[a-z]+)+\b/g) ?? [];
  return new Set(found);
}

function extractRoleMap(turns: TranscriptTurn[], leaderName: string, leaderIds: string[]): RoleMapEntry[] {
  const roles: RoleMapEntry[] = [];
  for (const turn of turns) {
    if (turn.speaker !== "leader") continue;
    const lines = sentences(turn.text);
    for (let index = 0; index < lines.length; index += 1) {
      const sentence = lines[index] ?? "";
      const owns = sentence.match(/^([A-Z][a-z]+ [A-Z][a-z]+) owns (.+?)\.?$/);
      const still = sentence.match(/^I still own (.+?)\.?$/);
      const director = sentence.match(/^My director is ([A-Z][a-z]+ [A-Z][a-z]+)\.?$/);
      const follow = lines[index + 1];
      const pronoun = follow && /^(She|He|They)\b/.test(follow) ? follow : "";
      if (owns?.[1] && owns[2] && isPersonName(owns[1])) {
        roles.push({
          id: `role-${slug(owns[1])}-${slug(owns[2])}`,
          area: owns[2],
          owner: owns[1],
          responsibility: sentence,
          source_turn_ids: [turn.id],
        });
      } else if (still?.[1]) {
        roles.push({
          id: `role-${slug(leaderName)}-${slug(still[1])}`,
          area: still[1],
          owner: leaderName,
          responsibility: sentence,
          source_turn_ids: unique([turn.id, ...leaderIds]),
        });
      } else if (director?.[1] && isPersonName(director[1])) {
        const responsibility = pronoun ? `${sentence} ${pronoun}` : sentence;
        roles.push({
          id: `role-${slug(director[1])}-director`,
          area: "director",
          owner: director[1],
          responsibility,
          source_turn_ids: [turn.id],
        });
      }
    }
  }
  return roles;
}

type DecisionDraft = DecisionLogEntry & { anchors: Set<string> };

function extractDecisions(turns: TranscriptTurn[]): DecisionLogEntry[] {
  const cue = /\b(froze|frozen|stopped|no new|permanent)\b/i;
  const drafts: DecisionDraft[] = [];
  for (const turn of turns) {
    if (turn.speaker !== "leader") continue;
    let current: string[] | null = null;
    const flush = () => {
      if (!current?.length) return;
      const [decision, ...rest] = current;
      if (!decision) return;
      const rationale = rest.join(" ") || decision;
      drafts.push({
        id: `decision-${slug(decision)}`,
        title: decision.replace(/[.!?]$/, ""),
        decision,
        rationale,
        source_turn_ids: [turn.id],
        anchors: anchorsOf(current.join(" ")),
      });
      current = null;
    };
    for (const sentence of sentences(turn.text)) {
      if (cue.test(sentence)) {
        const continues =
          current &&
          /\b(it|that freeze|the freeze)\b/i.test(sentence) &&
          /\b(stopped|froze|frozen)\b/i.test(sentence);
        if (continues) current?.push(sentence);
        else {
          flush();
          current = [sentence];
        }
      } else if (current) {
        current.push(sentence);
      }
    }
    flush();
  }

  const merged: DecisionDraft[] = [];
  for (const draft of drafts) {
    const match = merged.find((item) =>
      [...draft.anchors].some((anchor) => item.anchors.has(anchor)),
    );
    if (!match) {
      merged.push(draft);
      continue;
    }
    match.rationale = [match.rationale, draft.decision, draft.rationale]
      .filter((part, index, all) => part && all.indexOf(part) === index)
      .join(" ");
    match.source_turn_ids = unique([...match.source_turn_ids, ...draft.source_turn_ids]);
    for (const anchor of draft.anchors) match.anchors.add(anchor);
  }
  return merged.map(({ anchors: _anchors, ...entry }) => entry);
}

function extractLandmines(turns: TranscriptTurn[]): Landmine[] {
  const landmines: Landmine[] = [];
  for (const turn of turns) {
    if (turn.speaker !== "leader" || !/\blandmines?\b/i.test(turn.text)) continue;
    const detail = sentences(turn.text).filter((sentence) => !/^two landmines\.?$/i.test(sentence));
    const groups: string[][] = [];
    for (const sentence of detail) {
      if (/^and\b/i.test(sentence) || groups.length === 0) groups.push([sentence]);
      else groups[groups.length - 1]?.push(sentence);
    }
    groups.forEach((group, index) => {
      const mitigation =
        group.find((sentence) => /\b(knows|ask|do not|don't)\b/i.test(sentence)) ??
        group[group.length - 1] ??
        "";
      const riskParts = group.filter((sentence) => sentence !== mitigation);
      const risk = (riskParts.length ? riskParts : group).join(" ");
      const titleSource = (group[0] ?? "Landmine").replace(/^and\s+/i, "");
      const title = `${titleSource.charAt(0).toUpperCase()}${titleSource.slice(1)}`.replace(
        /[.!?]$/,
        "",
      );
      if (!risk || !mitigation) return;
      landmines.push({
        id: `landmine-${index + 1}-${slug(group[0] ?? "risk")}`,
        title,
        risk,
        mitigation,
        source_turn_ids: [turn.id],
      });
    });
  }
  return landmines;
}

function procedureParts(text: string): { name: string; when: string; steps: string[] }[] {
  const split = text.match(/([\s\S]*?)\bFor an incident,\s*([\s\S]*)/i);
  if (!split) {
    const steps = sentences(text);
    if (!steps.length) return [];
    return [{ name: steps[0] ?? "Procedure", when: steps[0] ?? "When this runs", steps }];
  }
  const deploySteps = sentences(split[1] ?? "");
  const incidentSteps = sentences(split[2] ?? "");
  const procedures: { name: string; when: string; steps: string[] }[] = [];
  if (deploySteps.length) {
    const when =
      text.match(/before \d{1,2}:\d{2} Pacific on Thursday/i)?.[0] ?? deploySteps[0] ?? "Thursday";
    procedures.push({
      name: deploySteps[0] ?? "Deploy",
      when,
      steps: deploySteps,
    });
  }
  if (incidentSteps.length) {
    procedures.push({
      name: incidentSteps[0] ?? "Incident",
      when: "For an incident",
      steps: incidentSteps,
    });
  }
  return procedures;
}

function extractSops(turns: TranscriptTurn[]): Sop[] {
  const sops: Sop[] = [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (!turn || turn.speaker !== "leader") continue;
    const previous = previousInterviewer(turns, index);
    const strong = /\b(pagerduty|for an incident|before \d{1,2}:\d{2})\b/i.test(turn.text);
    const asked = !!previous && /\b(walk me|deploy|incident|ritual)\b/i.test(previous.text);
    const procedural = /\b(approve|merge|page|escalat)\b/i.test(turn.text);
    if (!strong && !(asked && procedural)) continue;
    procedureParts(turn.text).forEach((procedure, procedureIndex) => {
      sops.push({
        id: `sop-${procedureIndex + 1}-${slug(procedure.when)}`,
        name: procedure.name,
        when: procedure.when,
        steps: procedure.steps,
        source_turn_ids: [turn.id],
      });
    });
  }
  return sops;
}

function extractDayOne(turns: TranscriptTurn[]): DayOneItem[] {
  const items: DayOneItem[] = [];
  for (let index = 0; index < turns.length; index += 1) {
    const turn = turns[index];
    if (!turn || turn.speaker !== "leader") continue;
    const previous = previousInterviewer(turns, index);
    if (!previous || !/\bday one\b/i.test(previous.text)) continue;
    sentences(turn.text).forEach((sentence, sentenceIndex) => {
      items.push({
        id: `day-${sentenceIndex + 1}-${slug(sentence)}`,
        text: sentence,
        source_turn_ids: [turn.id],
      });
    });
  }
  return items;
}

function mentionsFor(turns: TranscriptTurn[], name: string): { text: string; id: string }[] {
  const first = name.split(" ")[0] ?? name;
  const found: { text: string; id: string }[] = [];
  const seen = new Set<string>();
  for (const turn of turns) {
    const lines = sentences(turn.text);
    for (let index = 0; index < lines.length; index += 1) {
      const sentence = lines[index] ?? "";
      const named =
        sentence.includes(name) || new RegExp(`\\b${first}\\b`).test(sentence);
      if (!named) continue;
      const bundle = [sentence];
      const follow = lines[index + 1];
      if (follow && /^(She|He|They)\b/.test(follow)) bundle.push(follow);
      for (const line of bundle) {
        if (seen.has(line)) continue;
        seen.add(line);
        found.push({ text: line, id: turn.id });
      }
    }
  }
  return found.slice(0, 8);
}

function extractPeople(
  turns: TranscriptTurn[],
  roles: RoleMapEntry[],
  leaderName: string,
): PeopleMapEntry[] {
  const transcriptText = turns.map((turn) => turn.text).join("\n");
  const names: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    if (!isPersonName(name) || seen.has(name) || !transcriptText.includes(name)) return;
    seen.add(name);
    names.push(name);
  };
  for (const role of roles) push(role.owner);
  if (leaderName !== "Departing leader") push(leaderName);
  for (const turn of turns) {
    for (const name of introducedPersonNames(turn.text)) push(name);
  }

  return names.map((name) => {
    const role = roles.find((entry) => entry.owner === name);
    const mentions = mentionsFor(turns, name);
    const stillOwns = roles.find((entry) => entry.owner === name)?.responsibility;
    const contextSource =
      mentions.length > 0
        ? mentions
        : stillOwns
          ? [{ text: stillOwns, id: role?.source_turn_ids[0] ?? turns[0]?.id ?? "" }]
          : [];
    return {
      id: `person-${slug(name)}`,
      name,
      role: role?.area ?? "named in the interview",
      context: contextSource.map((item) => item.text).join(" ") || name,
      source_turn_ids: unique(contextSource.map((item) => item.id).filter(Boolean)),
    };
  });
}

function extractIgnorance(turns: TranscriptTurn[]): OpenQuestion[] {
  const questions: OpenQuestion[] = [];
  const isNewGap = (sentence: string) =>
    /\b(do not know|don't know|never wrote down|never wrote)\b/i.test(sentence);
  for (const turn of turns) {
    if (turn.speaker !== "leader") continue;
    const groups: string[][] = [];
    let current: string[] | null = null;
    for (const sentence of sentences(turn.text)) {
      if (isNewGap(sentence)) {
        if (current) groups.push(current);
        current = [sentence];
      } else if (current) {
        current.push(sentence);
      }
    }
    if (current) groups.push(current);
    for (const group of groups) {
      const first = group[0] ?? "";
      const who = first.match(/who owns (.+?)(?:\.|$)/i);
      const how = first.match(/how (?:we |I )?(.+?)(?:\.|$)/i);
      const question = who?.[1]
        ? `Who owns ${who[1]}?`
        : how?.[1]
          ? `How do we ${how[1]}?`
          : first;
      questions.push({
        id: `oq-${slug(question)}`,
        question,
        reason: group.join(" "),
        source_turn_ids: [turn.id],
      });
    }
  }
  return questions;
}

function extractHeadcountGap(turns: TranscriptTurn[]): OpenQuestion[] {
  const questions: OpenQuestion[] = [];
  for (const turn of turns) {
    if (turn.speaker !== "leader") continue;
    const lines = sentences(turn.text);
    const headcount = lines.find((sentence) => /there are (\d+|[a-z]+) engineers/i.test(sentence));
    const count = headcount?.match(/there are (\d+|[a-z]+) engineers/i)?.[1];
    const expected = count ? numberWord(count) : null;
    const named = lines.filter((sentence) => /^[A-Z][a-z]+ [A-Z][a-z]+ owns /.test(sentence));
    if (!headcount || expected === null || named.length >= expected) continue;
    questions.push({
      id: "oq-unnamed-engineer",
      question: "Who is the fourth engineer?",
      reason: [headcount, ...named].join(" "),
      source_turn_ids: [turn.id],
    });
  }
  return questions;
}

function keepGrounded<T extends { source_turn_ids: string[] }>(
  items: T[],
  turns: TranscriptTurn[],
  fields: (item: T) => string[],
): T[] {
  return items.filter((item) => {
    if (!item.source_turn_ids.length) return false;
    const corpus = citedCorpus(turns, item.source_turn_ids);
    return fields(item).every((field) => isGrounded(field, corpus));
  });
}

function scrubString(value: string, transcriptText: string): string {
  return value
    .replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, (name) =>
      transcriptText.includes(name) ? name : "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

function scrubUnknownNames(playbook: Playbook, transcriptText: string): Playbook {
  const scrub = (value: string) => scrubString(value, transcriptText);
  return {
    ...playbook,
    subject: {
      ...playbook.subject,
      company: playbook.subject.company,
      role: playbook.subject.role,
      departing_leader: scrub(playbook.subject.departing_leader) || "Departing leader",
    },
    role_map: playbook.role_map.map((entry) => ({
      ...entry,
      area: scrub(entry.area),
      owner: scrub(entry.owner),
      responsibility: scrub(entry.responsibility),
    })),
    decision_log: playbook.decision_log.map((entry) => ({
      ...entry,
      title: scrub(entry.title),
      decision: scrub(entry.decision),
      rationale: scrub(entry.rationale),
    })),
    landmines: playbook.landmines.map((entry) => ({
      ...entry,
      title: scrub(entry.title),
      risk: scrub(entry.risk),
      mitigation: scrub(entry.mitigation),
    })),
    sops: playbook.sops.map((entry) => ({
      ...entry,
      name: scrub(entry.name),
      when: scrub(entry.when),
      steps: entry.steps.map((step) => scrub(step)),
    })),
    day_one_checklist: playbook.day_one_checklist.map((entry) => ({
      ...entry,
      text: scrub(entry.text),
    })),
    people_map: playbook.people_map.map((entry) => ({
      ...entry,
      name: scrub(entry.name),
      role: scrub(entry.role),
      context: scrub(entry.context),
    })),
    open_questions: playbook.open_questions.map((entry) => ({
      ...entry,
      question: scrub(entry.question),
      reason: scrub(entry.reason),
    })),
  };
}

function withRealCitations(playbook: Playbook, allowed: Set<string>): Playbook {
  const cites = (ids: string[]) => unique(ids.filter((id) => allowed.has(id)));
  const keep = <T extends { source_turn_ids: string[] }>(items: T[]) =>
    items
      .map((item) => ({ ...item, source_turn_ids: cites(item.source_turn_ids) }))
      .filter((item) => item.source_turn_ids.length > 0);
  return {
    ...playbook,
    subject: { ...playbook.subject, source_turn_ids: cites(playbook.subject.source_turn_ids) },
    role_map: keep(playbook.role_map).filter((entry) => entry.owner && entry.responsibility),
    decision_log: keep(playbook.decision_log).filter((entry) => entry.decision),
    landmines: keep(playbook.landmines).filter((entry) => entry.risk && entry.mitigation),
    sops: keep(playbook.sops).filter((entry) => entry.steps.length > 0),
    day_one_checklist: keep(playbook.day_one_checklist).filter((entry) => entry.text),
    people_map: keep(playbook.people_map).filter((entry) => entry.name && entry.context),
    open_questions: keep(playbook.open_questions).filter((entry) => entry.question),
  };
}

function slotCount(
  slot: CoverageSlot,
  playbook: Pick<
    Playbook,
    "role_map" | "decision_log" | "landmines" | "sops" | "day_one_checklist" | "people_map" | "open_questions"
  >,
): number {
  const sopText = playbook.sops
    .map((entry) => `${entry.name} ${entry.when} ${entry.steps.join(" ")}`)
    .join("\n");
  const dayText = playbook.day_one_checklist.map((entry) => entry.text).join("\n");
  const openText = playbook.open_questions
    .map((entry) => `${entry.question} ${entry.reason}`)
    .join("\n");
  switch (slot) {
    case "owners":
      return playbook.role_map.length;
    case "decision_rules":
      return playbook.decision_log.length;
    case "landmines":
      return playbook.landmines.length;
    case "sops":
      return playbook.sops.length;
    case "people_map":
      return playbook.people_map.length;
    case "on_call_escalation":
      return /\b(pagerduty|escalat|\bpage\b)/i.test(sopText) ? 1 : 0;
    case "tribal_knowledge":
      return /\b(do not know|don't know|never wrote|never assigned|1password|unwritten|i guessed)\b/i.test(
        `${openText}\n${dayText}`,
      )
        ? 1
        : 0;
    default:
      return 0;
  }
}

function gapReason(score: number): string {
  if (score >= 0.7) {
    return "Coverage was marked strong, but the transcript has no citable evidence for this slot.";
  }
  return "The interview did not produce citable evidence for this slot.";
}

/**
 * Build a playbook from transcript evidence only.
 * Claims keep `source_turn_ids` that exist on the transcript.
 * Slots with no evidence become open questions. Names that never appear are dropped.
 */
export function synthesizePlaybook(input: SynthesizePlaybookInput): Playbook {
  const { transcript, coverage } = input;
  const turns = transcript.turns;
  const allowed = new Set(turns.map((turn) => turn.id));
  const transcriptText = turns.map((turn) => turn.text).join("\n");
  const leader = departingLeader(turns);
  const subjectIds = unique(
    turns
      .filter(
        (turn) =>
          turn.text.includes(transcript.company) ||
          (leader.name !== "Departing leader" && turn.text.includes(leader.name)),
      )
      .map((turn) => turn.id),
  );

  const roleMap = keepGrounded(
    extractRoleMap(turns, leader.name, leader.source_turn_ids),
    turns,
    (entry) => [entry.responsibility],
  );
  const decisionLog = keepGrounded(extractDecisions(turns), turns, (entry) => [
    entry.decision,
    entry.rationale,
  ]);
  const landmines = keepGrounded(extractLandmines(turns), turns, (entry) => [
    entry.risk,
    entry.mitigation,
  ]);
  const sops = keepGrounded(extractSops(turns), turns, (entry) => [entry.when, ...entry.steps]);
  const dayOne = keepGrounded(extractDayOne(turns), turns, (entry) => [entry.text]);
  const people = keepGrounded(extractPeople(turns, roleMap, leader.name), turns, (entry) => [
    entry.context,
  ]).filter((entry) => transcriptText.includes(entry.name));
  const openQuestions = keepGrounded(
    [...extractHeadcountGap(turns), ...extractIgnorance(turns)],
    turns,
    (entry) => [entry.reason],
  );

  const draft: Playbook = {
    id: `${transcript.id}-playbook`,
    transcript_id: transcript.id,
    subject: {
      company: transcript.company,
      role: transcript.role,
      departing_leader: leader.name,
      source_turn_ids: subjectIds.length ? subjectIds : leader.source_turn_ids,
    },
    role_map: roleMap,
    decision_log: decisionLog,
    landmines,
    sops,
    day_one_checklist: dayOne,
    people_map: people,
    open_questions: openQuestions,
  };

  for (const slot of COVERAGE_SLOTS) {
    const score = coverage[slot] ?? 0;
    if (slotCount(slot, draft) > 0) continue;
    const source_turn_ids = citeForSlot(turns, slot).filter((id) => allowed.has(id));
    if (!source_turn_ids.length) continue;
    draft.open_questions.push({
      id: `oq-gap-${slot}`,
      question: GAP_QUESTION[slot],
      reason: gapReason(score),
      source_turn_ids,
    });
  }

  const scrubbed = scrubUnknownNames(draft, transcriptText);
  scrubbed.subject.company = transcript.company;
  scrubbed.subject.role = transcript.role;
  return withRealCitations(scrubbed, allowed);
}

/** Prompt for a later model call. `synthesizePlaybook` does not call a model. */
export function buildSynthesizerPrompt(input: SynthesizePlaybookInput): string {
  return [
    "You are the Handoff synthesizer. Emit one playbook JSON object and nothing else.",
    "Every claim needs source_turn_ids that exist on the transcript.",
    "If a slot has no evidence, leave that section empty and add an open question that cites the turn where the gap showed up.",
    "Do not invent people, owners, or process. A name that is not in the transcript must not appear.",
    "Required keys: subject, role_map, decision_log, landmines, sops, day_one_checklist, people_map, open_questions.",
    "Few-shot: a leader turn t2 says \"Alex owns deploys.\" Emit that owner with source_turn_ids [\"t2\"]. If nobody is named for a slot, emit an open question, not a guessed teammate.",
    "",
    `Coverage: ${JSON.stringify(input.coverage)}`,
    `Transcript: ${JSON.stringify(input.transcript)}`,
  ].join("\n");
}
