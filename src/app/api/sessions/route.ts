import { createSession } from "@/lib/session/store";
import type { TranscriptTurn } from "@/lib/types";

import { bindRequest, failureResponse, isResponse, readBody, stringField } from "../http";
import { leaderTurn } from "../resolve-agents";

export async function POST(request: Request) {
  await bindRequest();
  try {
    const body = await readBody(request);
    if (isResponse(body)) return body;
    const transcript = turnsFromBody(body);
    if (transcript instanceof Response) return transcript;
    const session = await createSession({
      role: stringField(body, "role"),
      transcript,
    });
    return Response.json(session, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failureResponse(error, "api_sessions_create_failed");
  }
}

function turnsFromBody(body: Record<string, unknown>): TranscriptTurn[] | undefined | Response {
  if (Array.isArray(body.transcript)) return normalizeTurns(body.transcript);
  if (typeof body.transcript === "string") return body.transcript.trim() ? [leaderTurn(body.transcript.trim())] : [];
  if (Array.isArray(body.turns)) return normalizeTurns(body.turns);
  if (typeof body.text === "string" && body.text.trim()) return [leaderTurn(body.text.trim())];
  if ("transcript" in body || "turns" in body) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  return undefined;
}

function normalizeTurns(value: unknown[]): TranscriptTurn[] | Response {
  const turns: TranscriptTurn[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const turn = entry as Partial<TranscriptTurn>;
    if (typeof turn.text !== "string" || !turn.text.trim()) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const speaker = turn.speaker === "interviewer" || turn.speaker === "leader" ? turn.speaker : "leader";
    turns.push({
      id: typeof turn.id === "string" && turn.id.trim() ? turn.id : `t-${crypto.randomUUID()}`,
      speaker,
      text: turn.text.trim(),
      timestamp: typeof turn.timestamp === "string" ? turn.timestamp : undefined,
    });
  }
  return turns;
}
