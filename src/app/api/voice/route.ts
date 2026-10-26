import { createSession, getSession, updateSession } from "@/lib/session/store";
import type { VoiceUploadResponse } from "@/lib/types";
import { saveAndTranscribe } from "@/lib/voice/upload";

import { bindRequest, failureResponse } from "../http";

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;

export async function POST(request: Request) {
  await bindRequest();
  try {
    const form = await request.formData();
    const file = form.get("file") ?? form.get("audio");
    if (!(file instanceof Blob)) {
      return Response.json({ error: "invalid_request" }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: "payload_too_large" }, { status: 413 });
    }

    const role = formString(form, "role");
    const requestedId = formString(form, "session_id") ?? formString(form, "sessionId");
    const session = requestedId ? await getSession(requestedId) : await createSession({ role });
    if (!session) return Response.json({ error: "not_found" }, { status: 404 });

    const audio = Buffer.from(await file.arrayBuffer());
    const filename = file instanceof File && file.name ? file.name : "upload.wav";
    const turns = await saveAndTranscribe({ sessionId: session.id, audio, filename });
    const updated = await updateSession(session.id, {
      transcript: [...session.transcript, ...turns],
      status: session.status === "created" ? "interviewing" : session.status,
    });
    if (!updated) return Response.json({ error: "not_found" }, { status: 404 });

    const response: VoiceUploadResponse = {
      session_id: updated.id,
      transcript: updated.transcript,
    };
    return Response.json(response);
  } catch (error) {
    return failureResponse(error, "api_voice_failed");
  }
}

function formString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
