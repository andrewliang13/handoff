import { getSession, savePlaybook, updateSession } from "@/lib/session/store";
import type { Playbook, SynthesizeResponse } from "@/lib/types";

import { bindRequest, failureResponse, isResponse, readBody, stringField } from "../http";
import { synthesizePlaybook, transcriptFromSession } from "../resolve-agents";

export async function POST(request: Request) {
  await bindRequest();
  try {
    const body = await readBody(request);
    if (isResponse(body)) return body;
    const sessionId = stringField(body, "session_id", "sessionId");
    if (!sessionId) return Response.json({ error: "invalid_request" }, { status: 400 });

    const session = await getSession(sessionId);
    if (!session) return Response.json({ error: "not_found" }, { status: 404 });

    const transcript = transcriptFromSession(session, stringField(body, "company"));
    const playbook = await synthesizePlaybook({ transcript, coverage: session.coverage });
    if (!isPlaybook(playbook)) {
      await updateSession(session.id, { status: "failed" });
      return Response.json({ error: "request_failed" }, { status: 500 });
    }

    await savePlaybook(session.id, playbook);
    await updateSession(session.id, { status: "synthesized", playbook_id: playbook.id });
    const response: SynthesizeResponse = { playbook };
    return Response.json(response);
  } catch (error) {
    return failureResponse(error, "api_synthesize_failed");
  }
}

function isPlaybook(value: unknown): value is Playbook {
  if (!value || typeof value !== "object") return false;
  const playbook = value as Playbook;
  return typeof playbook.id === "string" && Boolean(playbook.subject);
}
