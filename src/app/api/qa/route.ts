import { getPlaybook, getSession } from "@/lib/session/store";
import type { QaResponse } from "@/lib/types";

import { bindRequest, failureResponse, isResponse, readBody, stringField } from "../http";
import { answerSuccessorQuestion, transcriptFromSession } from "../resolve-agents";

export async function POST(request: Request) {
  await bindRequest();
  try {
    const body = await readBody(request);
    if (isResponse(body)) return body;
    const sessionId = stringField(body, "session_id", "sessionId");
    const question = stringField(body, "question");
    if (!sessionId || !question) return Response.json({ error: "invalid_request" }, { status: 400 });

    const session = await getSession(sessionId);
    if (!session) return Response.json({ error: "not_found" }, { status: 404 });
    const playbook = await getPlaybook(session.id);
    if (!playbook) return Response.json({ error: "playbook_missing" }, { status: 409 });

    const transcript = transcriptFromSession(session, stringField(body, "company"));
    const answer = await answerSuccessorQuestion({ playbook, transcript, question });
    const response: QaResponse =
      answer.kind === "abstain"
        ? { kind: "abstain", text: answer.text, source_turn_ids: [] }
        : { kind: "answer", text: answer.text, source_turn_ids: answer.source_turn_ids };
    return Response.json(response);
  } catch (error) {
    return failureResponse(error, "api_qa_failed");
  }
}
