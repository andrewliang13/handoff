/**
 * Fixture eval for the Northline handoff.
 * Scores the published playbook, then calls agent exports when they exist.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import * as nodeModule from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { CoverageMap, Playbook, QaResponse, Session, Transcript } from "../types";

const REQUIRED_SECTIONS = [
  "id",
  "transcript_id",
  "subject",
  "role_map",
  "decision_log",
  "landmines",
  "sops",
  "day_one_checklist",
  "people_map",
  "open_questions",
] as const;

const ARRAY_SECTIONS = [
  "role_map",
  "decision_log",
  "landmines",
  "sops",
  "day_one_checklist",
  "people_map",
  "open_questions",
] as const;

const SUBJECT_FIELDS = ["company", "role", "departing_leader", "source_turn_ids"] as const;

const INVENTED_NAME = "Zara Quill";
const CAFETERIA_QUESTION = "What is on the cafeteria menu this week?";

type SectionName = (typeof REQUIRED_SECTIONS)[number];
type Citation = { at: string; id: string };

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

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

function readJson(relativePath: string): unknown {
  const file = path.join(root, relativePath);
  return JSON.parse(readFileSync(file, "utf8")) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function installTypeResolver(): void {
  const hooks = nodeModule as {
    registerHooks?: (registered: {
      resolve: (
        specifier: string,
        context: { parentURL?: string },
        nextResolve: (specifier: string, context: { parentURL?: string }) => unknown,
      ) => unknown;
    }) => void;
  };
  if (typeof hooks.registerHooks !== "function") return;
  hooks.registerHooks({
    resolve(specifier, context, nextResolve) {
      const relative = specifier.startsWith("./") || specifier.startsWith("../");
      if (!relative || !context.parentURL) return nextResolve(specifier, context);
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const target = path.resolve(parentDir, specifier);
      const candidates = path.extname(target)
        ? [target]
        : [
            `${target}.ts`,
            `${target}.tsx`,
            `${target}.mts`,
            path.join(target, "index.ts"),
            path.join(target, "index.tsx"),
          ];
      for (const candidate of candidates) {
        if (existsSync(candidate) && statSync(candidate).isFile()) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
      return nextResolve(specifier, context);
    },
  });
}

function sectionIsPresent(section: SectionName, value: unknown): boolean {
  if ((ARRAY_SECTIONS as readonly string[]).includes(section)) return Array.isArray(value);
  if (section === "subject") return isRecord(value);
  return typeof value === "string" && value.trim().length > 0;
}

function describeSection(section: SectionName, value: unknown): string {
  if ((ARRAY_SECTIONS as readonly string[]).includes(section) && Array.isArray(value)) {
    return `${section} (${value.length})`;
  }
  return section;
}

function sectionReport(playbook: Record<string, unknown>): { pass: boolean; lines: string[] } {
  const missing: string[] = [];
  const present: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    if (!sectionIsPresent(section, playbook[section])) {
      missing.push(section);
      continue;
    }
    present.push(describeSection(section, playbook[section]));
  }
  const subjectProblems = subjectFieldProblems(playbook.subject);
  const pass = missing.length === 0 && subjectProblems.length === 0;
  const lines = [
    `schema completeness: ${pass ? "PASS" : "FAIL"}`,
    `${present.length}/${REQUIRED_SECTIONS.length} required sections present`,
    `  ${present.join(", ")}`,
  ];
  if (missing.length) lines.push(`  missing: ${missing.join(", ")}`);
  if (subjectProblems.length) lines.push(`  subject: ${subjectProblems.join("; ")}`);
  return { pass, lines };
}

function subjectFieldProblems(subject: unknown): string[] {
  if (!isRecord(subject)) return ["subject is missing"];
  const problems: string[] = [];
  for (const field of SUBJECT_FIELDS) {
    if (!(field in subject)) problems.push(`${field} missing`);
  }
  if ("company" in subject && typeof subject.company !== "string") problems.push("company is not a string");
  if ("role" in subject && typeof subject.role !== "string") problems.push("role is not a string");
  if ("departing_leader" in subject && typeof subject.departing_leader !== "string") {
    problems.push("departing_leader is not a string");
  }
  if ("source_turn_ids" in subject && !Array.isArray(subject.source_turn_ids)) {
    problems.push("source_turn_ids is not an array");
  }
  return problems;
}

function collectCitations(value: unknown, at: string, out: Citation[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectCitations(item, `${at}[${index}]`, out));
    return;
  }
  if (!isRecord(value)) return;
  if (Array.isArray(value.source_turn_ids)) {
    value.source_turn_ids.forEach((id, index) => {
      out.push({
        at: `${at}.source_turn_ids[${index}]`,
        id: typeof id === "string" ? id : "",
      });
    });
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "source_turn_ids") continue;
    collectCitations(child, at ? `${at}.${key}` : key, out);
  }
}

function citationReport(
  playbook: Record<string, unknown>,
  transcript: Transcript,
): { pass: boolean; lines: string[] } {
  const turnIds = new Set(transcript.turns.map((turn) => turn.id));
  const citations: Citation[] = [];
  collectCitations(playbook, "playbook", citations);
  const missing = citations.filter((citation) => !citation.id || !turnIds.has(citation.id));
  const hits = citations.length - missing.length;
  const precision = citations.length === 0 ? 0 : hits / citations.length;
  const pass = citations.length > 0 && missing.length === 0;
  const lines = [
    `citation precision: ${pass ? "PASS" : "FAIL"}`,
    `${hits}/${citations.length} source_turn_ids on the fixture playbook exist on the transcript (${precision.toFixed(3)})`,
  ];
  if (missing.length === 0) lines.push("  missing: none");
  else {
    lines.push("  missing:");
    for (const citation of missing) {
      lines.push(`    ${citation.at}: ${citation.id || "(empty)"}`);
    }
  }
  return { pass, lines };
}

function inventedNameReport(rawPlaybook: string): { pass: boolean; lines: string[] } {
  const appears = rawPlaybook.includes(INVENTED_NAME);
  return {
    pass: !appears,
    lines: [
      `invented name: ${appears ? "FAIL" : "PASS"}`,
      appears
        ? `"${INVENTED_NAME}" appears in the fixture playbook and must not`
        : `"${INVENTED_NAME}" does not appear in the fixture playbook`,
    ],
  };
}

async function loadExport(folder: string, exportName: string): Promise<{ fn: ((...args: unknown[]) => unknown) | null; detail: string }> {
  const href = pathToFileURL(path.join(root, "src/lib/agents", folder, "index.ts")).href;
  try {
    const imported = (await import(href)) as Record<string, unknown>;
    const value = imported[exportName];
    if (typeof value !== "function") {
      return {
        fn: null,
        detail: `${exportName} is not exported from src/lib/agents/${folder}. Skipped.`,
      };
    }
    return { fn: value as (...args: unknown[]) => unknown, detail: `exported from src/lib/agents/${folder}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      fn: null,
      detail: `${exportName} could not be imported from src/lib/agents/${folder} (${message}). Skipped.`,
    };
  }
}

function abstainReport(value: unknown): { pass: boolean; lines: string[] } {
  const record = isRecord(value) ? value : {};
  const kind = typeof record.kind === "string" ? record.kind : "";
  const ids = Array.isArray(record.source_turn_ids) ? record.source_turn_ids : null;
  const text = typeof record.text === "string" ? record.text : "";
  const abstained = kind === "abstain" && ids !== null && ids.length === 0;
  const lines = [
    `abstain check: ${abstained ? "PASS" : "FAIL"}`,
    `  question: ${CAFETERIA_QUESTION}`,
    `  answerSuccessorQuestion returned kind=${kind || "missing"}${text ? ` text=${JSON.stringify(text)}` : ""}`,
    `  source_turn_ids: ${ids ? JSON.stringify(ids) : "missing"}`,
  ];
  return { pass: abstained, lines };
}

async function runAbstain(playbook: Playbook, transcript: Transcript): Promise<{ pass: boolean; lines: string[]; skipped: boolean }> {
  const loaded = await loadExport("qa", "answerSuccessorQuestion");
  if (!loaded.fn) {
    return {
      pass: true,
      skipped: true,
      lines: [
        "abstain check: SKIP",
        `  ${loaded.detail}`,
        `  A cafeteria-menu question was not asked.`,
      ],
    };
  }
  try {
    const result = (await loaded.fn({
      playbook,
      transcript,
      question: CAFETERIA_QUESTION,
    })) as QaResponse;
    const report = abstainReport(result);
    return { ...report, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      pass: false,
      skipped: false,
      lines: [
        "abstain check: FAIL",
        `  question: ${CAFETERIA_QUESTION}`,
        `  answerSuccessorQuestion threw: ${message}`,
      ],
    };
  }
}

async function noteInterview(transcript: Transcript): Promise<string[]> {
  const loaded = await loadExport("interviewer", "nextInterviewTurn");
  if (!loaded.fn) return [`nextInterviewTurn: SKIP`, `  ${loaded.detail}`];
  const session: Session = {
    id: transcript.id,
    role: "eng_manager",
    transcript: transcript.turns,
    coverage: blankCoverage(),
    status: "interviewing",
  };
  try {
    const result = await loaded.fn({ session });
    const record = isRecord(result) ? result : {};
    const question = typeof record.question === "string" ? record.question : null;
    const done = Boolean(record.done);
    return [
      "nextInterviewTurn: called",
      `  done=${done} question=${question === null ? "null" : JSON.stringify(question)}`,
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return ["nextInterviewTurn: called", `  threw: ${message}`];
  }
}

async function noteSynthesizer(transcript: Transcript): Promise<string[]> {
  const loaded = await loadExport("synthesizer", "synthesizePlaybook");
  if (!loaded.fn) return [`synthesizePlaybook: SKIP`, `  ${loaded.detail}`];
  try {
    const result = await loaded.fn({ transcript, coverage: blankCoverage() });
    if (!isRecord(result)) return ["synthesizePlaybook: called", "  returned a non-object"];
    const sections = REQUIRED_SECTIONS.filter((section) => section in result).length;
    const citations: Citation[] = [];
    collectCitations(result, "playbook", citations);
    const turnIds = new Set(transcript.turns.map((turn) => turn.id));
    const hits = citations.filter((citation) => turnIds.has(citation.id)).length;
    const invented = JSON.stringify(result).includes(INVENTED_NAME);
    return [
      "synthesizePlaybook: called",
      `  sections ${sections}/${REQUIRED_SECTIONS.length}; citations ${hits}/${citations.length}; ${INVENTED_NAME} ${invented ? "present" : "absent"}`,
    ];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return ["synthesizePlaybook: called", `  threw: ${message}`];
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === path.resolve(entry);
}

function printBlock(lines: string[]): void {
  console.log(lines.join("\n"));
  console.log("");
}

async function main(): Promise<void> {
  installTypeResolver();
  const playbookPath = "fixtures/northline-playbook.json";
  const transcriptPath = "fixtures/northline-transcript.json";
  const rawPlaybook = readFileSync(path.join(root, playbookPath), "utf8");
  const playbookJson = JSON.parse(rawPlaybook) as unknown;
  const transcriptJson = readJson(transcriptPath);

  console.log("Handoff eval");
  console.log(`fixture playbook: ${playbookPath}`);
  console.log(`fixture transcript: ${transcriptPath}`);
  console.log("");

  if (!isRecord(playbookJson) || !isRecord(transcriptJson) || !Array.isArray(transcriptJson.turns)) {
    console.log("schema completeness: FAIL");
    console.log("  fixture JSON is not a playbook and a transcript");
    console.log("");
    console.log("result: FAIL");
    process.exitCode = 1;
    return;
  }

  const transcript = transcriptJson as unknown as Transcript;
  const schema = sectionReport(playbookJson);
  if (typeof playbookJson.transcript_id === "string" && playbookJson.transcript_id !== transcript.id) {
    schema.pass = false;
    schema.lines[0] = "schema completeness: FAIL";
    schema.lines.push(
      `  transcript_id ${JSON.stringify(playbookJson.transcript_id)} does not match transcript ${JSON.stringify(transcript.id)}`,
    );
  }
  printBlock(schema.lines);

  const citations = citationReport(playbookJson, transcript);
  printBlock(citations.lines);

  const abstain = schema.pass
    ? await runAbstain(playbookJson as unknown as Playbook, transcript)
    : {
        pass: false,
        skipped: false,
        lines: [
          "abstain check: FAIL",
          "  fixture playbook failed schema completeness, so answerSuccessorQuestion was not called",
        ],
      };
  printBlock(abstain.lines);

  const invented = inventedNameReport(rawPlaybook);
  printBlock(invented.lines);

  printBlock(await noteInterview(transcript));
  printBlock(await noteSynthesizer(transcript));

  const failed = !schema.pass || !citations.pass || !abstain.pass || !invented.pass;
  console.log(`result: ${failed ? "FAIL" : "PASS"}`);
  if (failed) process.exitCode = 1;
}

if (isDirectRun()) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
