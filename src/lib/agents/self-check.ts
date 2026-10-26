import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ENG_MANAGER_QUESTION_BANK,
  buildInterviewerPrompt,
  nextInterviewTurn,
} from "./interviewer";
import { answerSuccessorQuestion, buildQaPrompt } from "./qa";
import { buildSynthesizerPrompt, synthesizePlaybook } from "./synthesizer";
import type {
  CoverageMap,
  Playbook,
  Session,
  Transcript,
  TranscriptTurn,
} from "../types";

function fail(message: string): never {
  throw new Error(message);
}

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

function sessionWith(turns: TranscriptTurn[], id = "check"): Session {
  return {
    id,
    role: "eng_manager",
    transcript: turns,
    coverage: blankCoverage(),
    status: "interviewing",
  };
}

function lowInfoTurns(pairs: number): TranscriptTurn[] {
  const turns: TranscriptTurn[] = [];
  for (let index = 0; index < pairs; index += 1) {
    turns.push({
      id: `q${index}`,
      speaker: "interviewer",
      text: `Unbanked question ${index}`,
    });
    turns.push({
      id: `a${index}`,
      speaker: "leader",
      text: "Nothing concrete yet.",
    });
  }
  return turns;
}

function eachCited(
  playbook: Playbook,
  visit: (ids: string[], label: string) => void,
): void {
  visit(playbook.subject.source_turn_ids, "subject");
  playbook.role_map.forEach((entry, index) =>
    visit(entry.source_turn_ids, `role_map[${index}]`),
  );
  playbook.decision_log.forEach((entry, index) =>
    visit(entry.source_turn_ids, `decision_log[${index}]`),
  );
  playbook.landmines.forEach((entry, index) =>
    visit(entry.source_turn_ids, `landmines[${index}]`),
  );
  playbook.sops.forEach((entry, index) => visit(entry.source_turn_ids, `sops[${index}]`));
  playbook.day_one_checklist.forEach((entry, index) =>
    visit(entry.source_turn_ids, `day_one_checklist[${index}]`),
  );
  playbook.people_map.forEach((entry, index) =>
    visit(entry.source_turn_ids, `people_map[${index}]`),
  );
  playbook.open_questions.forEach((entry, index) =>
    visit(entry.source_turn_ids, `open_questions[${index}]`),
  );
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const transcript = JSON.parse(
  readFileSync(path.join(root, "fixtures/northline-transcript.json"), "utf8"),
) as Transcript;
const turnIds = new Set(transcript.turns.map((turn) => turn.id));
const transcriptText = transcript.turns.map((turn) => turn.text).join("\n");

const opening = nextInterviewTurn({
  session: sessionWith([]),
  userAnswer: "",
});
if (opening.done) fail("opening turn should keep going");
if (opening.question !== ENG_MANAGER_QUESTION_BANK.owners.question) {
  fail(`opening question was ${opening.question}`);
}

const vague = nextInterviewTurn({
  session: sessionWith([
    {
      id: "t01",
      speaker: "interviewer",
      text: opening.question ?? "",
    },
  ]),
  userAnswer: "it depends",
});
if (vague.done) fail("a vague answer should not finish the interview");
if (vague.question !== ENG_MANAGER_QUESTION_BANK.owners.probe) {
  fail(`vague answer should get the sharper owners probe, got ${vague.question}`);
}
if (!vague.question?.includes("Be specific")) fail("sharper probe should demand specifics");
if (vague.coverage.owners >= 0.7) fail("vague 'it depends' should not fill owners");

const concrete = nextInterviewTurn({
  session: sessionWith([
    {
      id: "t01",
      speaker: "interviewer",
      text: ENG_MANAGER_QUESTION_BANK.owners.question,
    },
  ]),
  userAnswer:
    "It depends on the work, but Jonah Hale owns the deploy pipeline and Priya Nair owns billing.",
});
if (concrete.question === ENG_MANAGER_QUESTION_BANK.owners.probe) {
  fail("a concrete answer that names owners should not repeat the vague probe");
}
if (concrete.question !== ENG_MANAGER_QUESTION_BANK.decision_rules.question) {
  fail(`expected the decision-rules question, got ${concrete.question}`);
}

const stillGoing = nextInterviewTurn({
  session: sessionWith(lowInfoTurns(5)),
  userAnswer: "",
});
if (stillGoing.done) fail("ten low-info turns should stay under the cap");
if (stillGoing.question !== ENG_MANAGER_QUESTION_BANK.owners.question) {
  fail(`expected to probe the weak owners slot, got ${stillGoing.question}`);
}

const capped = nextInterviewTurn({
  session: sessionWith(lowInfoTurns(6)),
  userAnswer: "",
});
if (!capped.done || capped.question !== null) fail("twelve turns should stop the interview");

const finished = nextInterviewTurn({
  session: sessionWith(transcript.turns, "northline"),
  userAnswer: "",
});
if (!finished.done) fail("the Northline transcript should be done");
for (const [slot, score] of Object.entries(finished.coverage)) {
  if (score < 0.7) fail(`Northline coverage for ${slot} stayed at ${score}`);
}

const playbook = synthesizePlaybook({
  transcript,
  coverage: finished.coverage,
});
const serialized = JSON.stringify(playbook);
if (serialized.includes("Zara Quill")) fail("playbook invented Zara Quill");

eachCited(playbook, (ids, label) => {
  if (!ids.length) fail(`${label} is missing source_turn_ids`);
  for (const id of ids) {
    if (!turnIds.has(id)) fail(`${label} cites unknown turn ${id}`);
  }
});

for (const entry of playbook.role_map) {
  if (entry.owner !== "Departing leader" && !transcriptText.includes(entry.owner)) {
    fail(`role owner is not in the transcript: ${entry.owner}`);
  }
}
const peopleNames = playbook.people_map.map((entry) => entry.name);
for (const name of ["Maya Chen", "Jonah Hale", "Priya Nair", "Chris Okonkwo", "Lena Ortiz"]) {
  if (!peopleNames.includes(name)) fail(`missing person ${name}; saw ${peopleNames.join(", ")}`);
}
if (peopleNames.length !== 5) fail(`unexpected people: ${peopleNames.join(", ")}`);
for (const entry of playbook.people_map) {
  if (!transcriptText.includes(entry.name)) fail(`person is not in the transcript: ${entry.name}`);
}

const owners = playbook.role_map.map((entry) => entry.owner);
for (const name of ["Jonah Hale", "Priya Nair", "Chris Okonkwo", "Lena Ortiz"]) {
  if (!owners.includes(name)) fail(`missing owner ${name}; saw ${owners.join(", ")}`);
}
if (playbook.decision_log.length < 2) fail(`expected decisions, saw ${playbook.decision_log.length}`);
if (playbook.landmines.length < 2) fail(`expected two landmines, saw ${playbook.landmines.length}`);
if (playbook.sops.length < 2) fail(`expected two SOPs, saw ${playbook.sops.length}`);
if (playbook.day_one_checklist.length < 5) {
  fail(`expected day-one items, saw ${playbook.day_one_checklist.length}`);
}
const gaps = playbook.open_questions.map((entry) => `${entry.question} ${entry.reason}`).join("\n");
if (!/Datadog/i.test(gaps)) fail(`missing Datadog open question: ${gaps}`);
if (!/fourth engineer/i.test(gaps)) fail(`missing fourth-engineer open question: ${gaps}`);

const cafeteria = answerSuccessorQuestion({
  playbook,
  transcript,
  question: "What is on the cafeteria menu this week?",
});
if (cafeteria.kind !== "abstain") fail(`cafeteria question should abstain, got ${cafeteria.kind}`);
if (!cafeteria.text.includes("not covered in handoff")) {
  fail(`abstain text was ${cafeteria.text}`);
}
if (cafeteria.source_turn_ids.length !== 0) fail("abstain should not cite turns");

const invented = answerSuccessorQuestion({
  playbook,
  transcript,
  question: "What did Zara Quill decide about the rollout?",
});
if (invented.kind !== "abstain") fail("an unknown person should abstain");
if (invented.text.includes("Zara Quill")) fail("abstain text should not repeat the invented name");

const freeze = answerSuccessorQuestion({
  playbook,
  transcript,
  question: "What is the Friday deploy freeze window?",
});
if (freeze.kind !== "answer") fail(`deploy freeze should be answered, got ${freeze.kind}: ${freeze.text}`);
if (!freeze.source_turn_ids.length) fail("deploy freeze answer needs citations");
for (const id of freeze.source_turn_ids) {
  if (!turnIds.has(id)) fail(`deploy freeze cites unknown turn ${id}`);
}
if (!/16:00|freeze/i.test(freeze.text)) fail(`deploy freeze answer was off topic: ${freeze.text}`);

const interviewerPrompt = buildInterviewerPrompt({
  session: sessionWith([]),
  userAnswer: "",
});
const synthesizerPrompt = buildSynthesizerPrompt({
  transcript,
  coverage: finished.coverage,
});
const qaPrompt = buildQaPrompt({
  playbook,
  transcript,
  question: "What is on the cafeteria menu this week?",
});
if (!/it depends/i.test(interviewerPrompt)) fail("interviewer prompt should mention the vague probe");
if (!synthesizerPrompt.includes("source_turn_ids")) fail("synthesizer prompt should require citations");
if (!qaPrompt.includes("not covered in handoff")) fail("QA prompt should include the abstain phrase");

console.log(
  JSON.stringify(
    {
      ok: true,
      coverage: finished.coverage,
      roles: playbook.role_map.length,
      decisions: playbook.decision_log.length,
      landmines: playbook.landmines.length,
      sops: playbook.sops.length,
      dayOne: playbook.day_one_checklist.length,
      people: playbook.people_map.length,
      openQuestions: playbook.open_questions.map((entry) => entry.question),
      cafeteria: cafeteria.kind,
      freezeCites: freeze.kind === "answer" ? freeze.source_turn_ids : [],
    },
    null,
    2,
  ),
);
