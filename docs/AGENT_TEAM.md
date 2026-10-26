# Handoff agent team

This file is the roster and the file map for the build. The Conductor chat keeps it current. A wave launches several agents in one turn. Each agent writes only the paths it owns. The Conductor merges after the audit gate, then does one integration pass.

The product is an exit interview that becomes a successor-ready playbook. The demo vertical is an engineering manager leaving Northline Labs. Shared TypeScript contracts live in `src/lib/types/`. Implementers code to those contracts.

## Conductor

The Conductor is the main chat. It writes this file and the daily wave briefs, launches the parallel agents, merges their patches, and resolves conflicts. It owns the Official Rules check, the credits check, and the submit step on Nov 4.

The Conductor does not edit a file another agent owns in the same wave. Between waves, the Conductor, or a named Types pass, is the only editor of `src/lib/types/`. Root config (`package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`) stays with the Conductor unless a brief assigns it to one agent for that wave.

## The 14 specialists

These are the seats a wave can launch. Count them as fourteen workers under the Conductor.

### Backend

**Backend-API** owns the Meta Model API client, environment handling, and 429/401 recovery in `src/lib/meta/`. It also owns the route handlers that call that client: synthesize, interview step, successor Q&A, and image generation under `src/app/api/`. The client talks to `https://api.meta.ai/v1` with `Authorization: Bearer` and `MODEL_API_KEY` from the environment. The key never goes in the repo.

**Backend-Session** owns session storage, transcript persistence, and coverage-map state in `src/lib/session/`. Session HTTP routes, when they exist, live in `src/app/api/session/`.

**Backend-Voice** owns upload, the MediaRecorder receive path, chunking, and Voice Transcribe integration in `src/lib/voice/`. Voice HTTP routes live in `src/app/api/voice/`.

### Handoff agents

**Agent-Interviewer** owns the question bank, coverage-driven follow-ups, and the turn cap in `src/lib/agents/interviewer/`. The interviewer asks about empty or weak coverage slots and stops when the score is high enough or the turn cap hits. It does not add route files.

**Agent-Synthesizer** owns playbook schema enforcement, structured output, and few-shots in `src/lib/agents/synthesizer/`. Every claim it emits carries `source_turn_ids`. Empty slots stay empty and show up as open questions. It does not invent people or process.

**Agent-QA** owns cite-or-abstain successor chat in `src/lib/agents/qa/`. An answer cites transcript turns. A question the interview never covered comes back as an abstain, with no invented citations.

### Frontend

**FE-Shell** owns App Router chrome, routing, and the departing-leader versus successor modes in `src/app/(app)/`. It also owns `src/app/layout.tsx` and `src/app/globals.css`.

**FE-Playbook** owns playbook sections, citations, and the day-one checklist in `src/components/playbook/`.

**FE-Interview** owns record and upload UX, follow-ups, and progress states in `src/components/interview/`.

### Design

**UI-Landing** owns the public brand page in `src/app/(marketing)/` and brand styles in `src/styles/` once that folder exists. The Day-0 home page already renders the Northline fixture from `(marketing)/page.tsx`. Restyle that page in a later wave. Keep a visitor path to the fixture playbook until the playbook components replace it.

**UI-Motion** owns progress animation and the knowledge-transfer visual in `src/components/motion/`.

### Audit

Audit agents run in parallel at the end of a wave. They report pass or fail with file references. They do not land new product features.

**Audit-Code** checks types, the production build, dead routes, and env leaks.

**Audit-Handoff** checks schema completeness, citation integrity, abstain behavior, and that successor chat cannot wander into general knowledge. Eval scripts in `src/lib/eval/` are assigned per wave. Audit-Handoff leads the harness. An agent owner edits an eval file only when the brief names that file.

**Audit-Demo** checks the fixture path, the deploy URL, the README, and the video checklist.

## File ownership

Two agents never write the same path in one wave. The owner below is the only writer for that path unless the Conductor names a single exception in the wave brief.

| Path | Owner |
| --- | --- |
| `docs/AGENT_TEAM.md` | Conductor |
| `src/lib/types/` | Conductor, or a named Types pass between waves |
| `src/lib/meta/` | Backend-API |
| `src/lib/session/` | Backend-Session |
| `src/lib/voice/` | Backend-Voice |
| `src/lib/agents/interviewer/` | Agent-Interviewer |
| `src/lib/agents/synthesizer/` | Agent-Synthesizer |
| `src/lib/agents/qa/` | Agent-QA |
| `src/lib/eval/` | One assignee per wave; Audit-Handoff leads |
| `src/components/playbook/` | FE-Playbook |
| `src/components/interview/` | FE-Interview |
| `src/components/motion/` | UI-Motion |
| `src/app/(app)/` | FE-Shell |
| `src/app/layout.tsx`, `src/app/globals.css` | FE-Shell |
| `src/app/(marketing)/` | UI-Landing |
| `src/styles/` | UI-Landing |
| `src/app/api/voice/` | Backend-Voice |
| `src/app/api/session/` | Backend-Session |
| `src/app/api/synthesize/`, `src/app/api/interview/`, `src/app/api/qa/`, `src/app/api/image/` | Backend-API |
| `fixtures/` | Conductor between waves; a brief may assign one agent |
| Root config (`package.json`, lockfile, `tsconfig.json`, `next.config.ts`, ESLint) | Conductor |

Route handlers stay thin. Agent behavior stays in `src/lib/agents/`. A frontend owner does not add route handlers. A backend owner does not restyle playbook components.

`fixtures/` holds the Northline Labs knowledge pack: `northline-transcript.json` and `northline-playbook.json`. There is no sample audio file yet.

## Parallelism rules

1. One wave means many agents in one Conductor turn. Aim for four to eight agents, launched together.
2. File ownership is law. Two agents never write the same path in one wave. Shared types live in `src/lib/types/`. Only the Conductor or a named Types pass edits that folder, and only between waves.
3. Contracts come first. A wave starts with published interfaces for `Playbook`, `CoverageMap`, `Session`, transcript turns, and the API request/response shapes. Implementers code to those types.
4. The audit gate comes before a merge. Audit-Code and the relevant product auditor report pass or fail with file references. A verbal “looks good” is not a merge.
5. After the audits, the Conductor does one integration pass: wire imports and fix types. That pass adds no new feature.
6. The human approves design direction, eval numbers, the video script, and the final submit. Agents do not take those gates.

The daily shape is a morning build wave, an audit gate, a Conductor integration, an afternoon wave, a second audit gate, and an evening fixture smoke by Audit-Demo.

## What this foundation already published

`src/lib/types/` is the contract surface. Import from `@/lib/types`. The other ownership folders exist as stubs so later waves can land files without creating the tree. The home page statically imports the Northline playbook and does not call the Meta API. `MODEL_API_KEY` belongs in `.env.local` only. `.env.example` records the variable name and nothing else.
