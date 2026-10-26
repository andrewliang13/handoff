import type { InterviewStepResponse } from "@/lib/types";
import { getSession, updateSession } from "@/lib/session/store";
import type { TranscriptTurn } from "@/lib/types";

import { bindRequest, failureResponse, isResponse, readBody, stringField } from "../http";
import { nextInterviewTurn } from "../resolve-agents";

export async function POST(request: Request) {
  await bindRequest();
  try {
    const body = await readBody(request);
    if (isResponse(body)) return body;
    const sessionId = stringField(body, "session_id", "sessionId");
    if (!sessionId) return Response.json({ error: "invalid_request" }, { status: 400 });

    const session = await getSession(sessionId);
    if (!session) return Response.json({ error: "not_found" }, { status: 404 });

    const answer = stringField(body, "answer", "userAnswer");
    const result = await nextInterviewTurn({ session, userAnswer: answer });
    const transcript = [...session.transcript];
    if (answer) {
      transcript.push(turn("leader", answer));
    }
    if (result.question) {
      transcript.push(turn("interviewer", result.question));
    }

    const updated = await updateSession(session.id, {
      transcript,
      coverage: result.coverage,
      status: result.done ? "ready_to_synthesize" : "interviewing",
    });
    if (!updated) return Response.json({ error: "not_found" }, { status: 404 });

    const response: InterviewStepResponse = {
      session: updated,
      question: result.question,
      coverage: updated.coverage,
      done: result.done,
    };
    return Response.json(response);
  } catch (error) {
    return failureResponse(error, "api_interview_failed");
  }
}

function turn(speaker: TranscriptTurn["speaker"], text: string): TranscriptTurn {
  return {
    id: `t-${crypto.randomUUID()}`,
    speaker,
    text,
  };
}
