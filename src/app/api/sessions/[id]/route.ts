import { assertSessionId, getSession, updateSession, type SessionPatch } from "@/lib/session/store";
import type { CoverageMap, SessionStatus, TranscriptTurn } from "@/lib/types";

import { bindRequest, failureResponse, isResponse, readBody, stringField } from "../../http";

const STATUSES = new Set<SessionStatus>([
  "created",
  "interviewing",
  "ready_to_synthesize",
  "synthesized",
  "failed",
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await bindRequest();
  try {
    const { id } = await context.params;
    if (!assertSessionId(id)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    const session = await getSession(id);
    if (!session) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failureResponse(error, "api_sessions_get_failed");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  await bindRequest();
  try {
    const { id } = await context.params;
    if (!assertSessionId(id)) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    const body = await readBody(request);
    if (isResponse(body)) return body;
    const patch = patchFromBody(body);
    if (patch instanceof Response) return patch;
    const session = await updateSession(id, patch);
    if (!session) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failureResponse(error, "api_sessions_patch_failed");
  }
}

function patchFromBody(body: Record<string, unknown>): SessionPatch | Response {
  const patch: SessionPatch = {};
  const role = stringField(body, "role");
  if (role) patch.role = role;
  if ("status" in body) {
    const status = body.status;
    if (typeof status !== "string" || !STATUSES.has(status as SessionStatus)) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    patch.status = status as SessionStatus;
  }
  if ("playbook_id" in body) {
    if (typeof body.playbook_id !== "string" || !body.playbook_id.trim()) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    patch.playbook_id = body.playbook_id.trim();
  }
  if ("transcript" in body) {
    if (!Array.isArray(body.transcript)) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    const transcript: TranscriptTurn[] = [];
    for (const entry of body.transcript) {
      if (!entry || typeof entry !== "object") {
        return Response.json({ error: "invalid_request" }, { status: 400 });
      }
      const turn = entry as Partial<TranscriptTurn>;
      if (typeof turn.text !== "string" || (turn.speaker !== "leader" && turn.speaker !== "interviewer")) {
        return Response.json({ error: "invalid_request" }, { status: 400 });
      }
      transcript.push({
        id: typeof turn.id === "string" && turn.id.trim() ? turn.id : `t-${crypto.randomUUID()}`,
        speaker: turn.speaker,
        text: turn.text,
        timestamp: typeof turn.timestamp === "string" ? turn.timestamp : undefined,
      });
    }
    patch.transcript = transcript;
  }
  if ("coverage" in body) {
    if (!body.coverage || typeof body.coverage !== "object" || Array.isArray(body.coverage)) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    patch.coverage = body.coverage as CoverageMap;
  }
  return patch;
}
