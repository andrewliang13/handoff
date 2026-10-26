"use client";

import { useRef, useState } from "react";
import type { CoverageMap, Playbook, Transcript, TranscriptTurn } from "@/lib/types";
import playbookJson from "../../../../fixtures/northline-playbook.json";
import transcriptJson from "../../../../fixtures/northline-transcript.json";
import { PlaybookDocument } from "@/components/playbook/playbook-document";
import { answerSampleQuestion } from "@/components/playbook/sample-answer";
import { SuccessorAsk } from "@/components/playbook/successor-ask";
import { CapturePanel } from "@/components/interview/capture-panel";
import {
  ApiError,
  emptyCoverage,
  fullCoverage,
  patchJson,
  postForm,
  postJson,
  readCoverage,
  readDone,
  readImageUrl,
  readPlaybook,
  readQa,
  readQuestion,
  readTurns,
  requireSessionId,
  sessionBody,
  type QaView,
} from "@/components/interview/client";
import { CoverageMeters } from "@/components/interview/coverage-meters";
import { FollowUp } from "@/components/interview/follow-up";
import { parseTranscript } from "@/components/interview/parse-transcript";
import { ProgressStatus, type Phase } from "@/components/interview/progress-status";
import { TranscriptList } from "@/components/interview/transcript-list";

const sampleTranscript = transcriptJson as Transcript;
const samplePlaybook = playbookJson as Playbook;

type Mode = "leader" | "successor";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Request failed";
}

export function HandoffClient() {
  const [mode, setMode] = useState<Mode>("leader");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [coverage, setCoverage] = useState<CoverageMap>(emptyCoverage());
  const [question, setQuestion] = useState<string | null>(null);
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [activeTurnIds, setActiveTurnIds] = useState<string[]>([]);
  const [activeClaimId, setActiveClaimId] = useState<string | null>(null);
  const [qa, setQa] = useState<QaView | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const questionRef = useRef<string | null>(null);
  const localId = useRef(0);
  const phaseBeforeRecord = useRef<Phase>("idle");

  function rememberQuestion(value: string | null) {
    questionRef.current = value;
    setQuestion(value);
  }

  function cite(turnIds: string[], claimId: string) {
    setActiveClaimId(claimId);
    setActiveTurnIds(turnIds);
  }

  function resetWork() {
    setError(null);
    setQa(null);
    setImageUrl(null);
    setActiveTurnIds([]);
    setActiveClaimId(null);
    rememberQuestion(null);
    setPlaybook(null);
  }

  function loadSample() {
    resetWork();
    setSample(true);
    setBusy(false);
    setSessionId(null);
    setTurns(sampleTranscript.turns);
    setPlaybook(samplePlaybook);
    setCoverage(fullCoverage());
    setPhase("ready");
  }

  function applyExchange(answer: string | undefined) {
    if (!answer) return;
    const asked = questionRef.current;
    setTurns((current) => {
      const next = [...current];
      if (asked && !current.some((turn) => turn.speaker === "interviewer" && turn.text === asked)) {
        localId.current += 1;
        next.push({ id: `local-${localId.current}`, speaker: "interviewer", text: asked });
      }
      localId.current += 1;
      next.push({ id: `local-${localId.current}`, speaker: "leader", text: answer });
      return next;
    });
  }

  async function fetchImage(id: string) {
    try {
      const data = await postJson("/api/image", sessionBody(id));
      const url = readImageUrl(data);
      if (url) setImageUrl(url);
    } catch {
      // The image route is optional. A missing or failing route leaves the playbook as text.
    }
  }

  async function synthesize(id: string) {
    setPhase("synthesizing");
    const data = await postJson("/api/synthesize", sessionBody(id));
    const next = readPlaybook(data);
    if (!next) throw new Error("Synthesize response did not include a playbook.");
    setPlaybook(next);
    rememberQuestion(null);
    setPhase("ready");
    void fetchImage(id);
  }

  async function runInterview(id: string, answer?: string) {
    setPhase("interviewing");
    const data = await postJson(
      "/api/interview",
      sessionBody(id, answer ? { answer } : undefined),
    );
    const nextCoverage = readCoverage(data);
    if (nextCoverage) setCoverage(nextCoverage);
    const nextTurns = readTurns(data);
    if (nextTurns) setTurns(nextTurns);
    else applyExchange(answer);
    if (readDone(data)) {
      await synthesize(id);
      return;
    }
    const nextQuestion = readQuestion(data);
    rememberQuestion(nextQuestion);
    setPhase("interviewing");
    if (!nextQuestion) {
      setError("The interview did not return a next question.");
    }
  }

  async function storeTranscript(id: string, transcript: TranscriptTurn[]) {
    try {
      await patchJson(`/api/sessions/${id}`, { transcript, status: "interviewing" });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) return;
      throw err;
    }
  }

  async function beginFromTurns(transcript: TranscriptTurn[]) {
    resetWork();
    setSample(false);
    setBusy(true);
    setTurns(transcript);
    setCoverage(emptyCoverage());
    setPhase("interviewing");
    try {
      const created = await postJson("/api/sessions", {
        role: "eng_manager",
        transcript,
      });
      const id = requireSessionId(created);
      setSessionId(id);
      await storeTranscript(id, transcript);
      await runInterview(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function beginFromAudio(file: File) {
    resetWork();
    setSample(false);
    setBusy(true);
    setTurns([]);
    setCoverage(emptyCoverage());
    setPhase("transcribing");
    try {
      const created = await postJson("/api/sessions", { role: "eng_manager" });
      const id = requireSessionId(created);
      setSessionId(id);
      const form = new FormData();
      form.append("file", file, file.name || "handoff.webm");
      form.append("session_id", id);
      form.append("sessionId", id);
      form.append("role", "eng_manager");
      const voice = await postForm("/api/voice", form);
      setSessionId(sessionIdFromVoice(voice, id));
      const transcript = readTurns(voice);
      if (!transcript) throw new Error("The transcription did not include any turns.");
      setTurns(transcript);
      await runInterview(sessionIdFromVoice(voice, id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitAnswer(answer: string) {
    if (!sessionId || sample) return;
    setBusy(true);
    setError(null);
    try {
      await runInterview(sessionId, answer);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function synthesizeNow() {
    if (!sessionId || sample) return;
    setBusy(true);
    setError(null);
    try {
      await synthesize(sessionId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function ask(nextQuestion: string) {
    const liveSession = Boolean(sessionId) && !sample;
    setBusy(true);
    setError(null);
    setQa(null);
    setActiveClaimId(null);
    setActiveTurnIds([]);
    try {
      if (!liveSession || !sessionId) {
        const view = answerSampleQuestion({ question: nextQuestion, playbook, turns });
        setQa(view);
        if (view.kind === "answer" && view.source_turn_ids.length) {
          setActiveTurnIds(view.source_turn_ids);
        }
        return;
      }
      const data = await postJson("/api/qa", sessionBody(sessionId, { question: nextQuestion }));
      const view = readQa(data);
      setQa(view);
      if (view.kind === "answer" && view.source_turn_ids.length) {
        setActiveTurnIds(view.source_turn_ids);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || phase === "recording";

  const capture = mode === "leader" ? (
    <div key="capture">
      {playbook ? (
        <h2 className="mt-10 border-t border-[#1c1916]/15 pt-8 text-sm font-medium tracking-wide text-[#5c564c] uppercase">
          Start another
        </h2>
      ) : null}
      <CapturePanel
        disabled={busy}
        recording={phase === "recording"}
        onRecordingStart={() => {
          phaseBeforeRecord.current = phase;
          setError(null);
          setPhase("recording");
        }}
        onRecordingEnd={() => setPhase(phaseBeforeRecord.current)}
        onAudio={(file) => void beginFromAudio(file)}
        onTranscript={(text) => {
          const transcript = parseTranscript(text);
          if (!transcript.length) {
            setError("Paste a transcript first.");
            return;
          }
          void beginFromTurns(transcript);
        }}
        onError={(message) => {
          setError(message);
          if (phase === "recording") setPhase(phaseBeforeRecord.current);
        }}
      />
      {question && phase === "interviewing" ? (
        <FollowUp question={question} busy={busy} onAnswer={(answer) => void submitAnswer(answer)} />
      ) : null}
      {sessionId && !sample && (phase === "interviewing" || phase === "synthesizing") ? (
        <button
          type="button"
          onClick={() => void synthesizeNow()}
          disabled={busy}
          className="mt-6 border border-[#1c1916]/25 px-4 py-2 text-sm outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-50"
        >
          Synthesize playbook
        </button>
      ) : null}
    </div>
  ) : null;

  const handoffRecord = (
    <div key="record">
      {imageUrl ? (
        // Model image hosts are not known at build time.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="Illustration generated for this handoff"
          className="mt-10 w-full border border-[#1c1916]/15"
        />
      ) : null}
      {playbook ? <PlaybookDocument playbook={playbook} activeClaimId={activeClaimId} onCite={cite} /> : null}
      {mode === "successor" ? (
        <>
          {!playbook ? (
            <p className="mt-8 text-[#3f3a33]">The playbook appears here once a handoff is ready.</p>
          ) : null}
          <SuccessorAsk
            disabled={phase !== "ready" || (!sessionId && !sample)}
            busy={busy}
            result={qa}
            onAsk={(next) => void ask(next)}
            onCite={(turnIds) => cite(turnIds, "qa")}
          />
        </>
      ) : null}
      {playbook && turns.length ? <TranscriptList turns={turns} activeTurnIds={activeTurnIds} /> : null}
    </div>
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#1c1916]/15 pb-4">
        <div className="flex gap-6" role="tablist" aria-label="Handoff mode">
          <ModeButton
            active={mode === "leader"}
            disabled={phase === "recording"}
            onClick={() => setMode("leader")}
          >
            Departing leader
          </ModeButton>
          <ModeButton
            active={mode === "successor"}
            disabled={phase === "recording"}
            onClick={() => setMode("successor")}
          >
            Successor
          </ModeButton>
        </div>
        <button
          type="button"
          onClick={loadSample}
          disabled={locked}
          className="border border-[#1c1916]/25 px-4 py-2 text-sm outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-50"
        >
          Play sample handoff
        </button>
      </div>

      <div className="mt-6">
        <ProgressStatus phase={phase} />
      </div>

      {sample ? (
        <p className="mt-3 font-mono text-xs tracking-wide text-[#5c564c]">
          Sample handoff. Loaded on this page, no API call.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 border-l-2 border-[#8a3a2a] pl-3 text-sm text-[#8a3a2a]">
          {error}
        </p>
      ) : null}

      {mode === "leader" && phase !== "idle" ? <CoverageMeters coverage={coverage} /> : null}

      {playbook || mode === "successor" ? handoffRecord : null}
      {capture}
      {!playbook && turns.length ? <TranscriptList turns={turns} activeTurnIds={activeTurnIds} /> : null}
    </main>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className={`border-b-2 pb-1 text-sm outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-50 ${
        active ? "border-[#1c1916] text-[#1c1916]" : "border-transparent text-[#5c564c]"
      }`}
    >
      {children}
    </button>
  );
}

function sessionIdFromVoice(voice: unknown, fallback: string) {
  try {
    return requireSessionId(voice);
  } catch {
    return fallback;
  }
}
