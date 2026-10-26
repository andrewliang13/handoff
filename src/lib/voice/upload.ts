import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { transcribe, type TranscribeResult } from "@/lib/meta/client";
import { audioDir } from "@/lib/session/store";
import type { TranscriptTurn } from "@/lib/types";

import { chunkAudio } from "./chunk";

const FIXTURE_NOTE =
  "Fixture transcript note: audio saved locally. Voice Transcribe was not called because MODEL_API_KEY is unset.";

export async function saveAndTranscribe(input: {
  sessionId: string;
  audio: Buffer;
  filename: string;
}): Promise<TranscriptTurn[]> {
  await saveUpload(input.sessionId, input.audio, input.filename);
  if (!process.env.MODEL_API_KEY?.trim()) {
    return [leaderTurn(FIXTURE_NOTE)];
  }

  const chunks = chunkAudio(input.audio);
  const results: TranscribeResult[] = [];
  for (const chunk of chunks) {
    const name = chunks.length === 1 ? input.filename : `chunk-${chunk.index}.wav`;
    results.push(await transcribe(chunk.bytes, name));
  }
  return turnsFromResults(results);
}

async function saveUpload(sessionId: string, audio: Buffer, filename: string): Promise<void> {
  const directory = audioDir(sessionId);
  await mkdir(directory, { recursive: true });
  const safeName = safeFilename(filename);
  await writeFile(path.join(directory, `${Date.now()}-${safeName}`), audio);
}

function turnsFromResults(results: TranscribeResult[]): TranscriptTurn[] {
  const diarized = results.flatMap((result) => result.turns);
  if (diarized.length === 0) {
    const text = results
      .map((result) => result.text.trim())
      .filter(Boolean)
      .join("\n");
    return [leaderTurn(text || "Fixture transcript note: transcription returned no text.")];
  }

  const firstSpeaker = diarized.find((turn) => turn.speaker)?.speaker;
  return diarized.map((turn) => ({
    id: turnId(),
    speaker: turn.speaker && firstSpeaker && turn.speaker !== firstSpeaker ? "interviewer" : "leader",
    text: turn.text,
    timestamp: typeof turn.startMs === "number" ? formatElapsed(turn.startMs) : undefined,
  }));
}

function leaderTurn(text: string): TranscriptTurn {
  return {
    id: turnId(),
    speaker: "leader",
    text,
  };
}

function turnId(): string {
  return `voice-${crypto.randomUUID()}`;
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

function safeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return base && base !== "." && base !== ".." ? base : "audio.bin";
}
