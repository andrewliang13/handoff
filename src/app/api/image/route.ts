import { generateImage } from "@/lib/meta/client";
import { getPlaybook, getSession } from "@/lib/session/store";

import { bindRequest, failureResponse, isResponse, readBody, stringField } from "../http";

export async function POST(request: Request) {
  await bindRequest();
  try {
    const body = await readBody(request);
    if (isResponse(body)) return body;
    const prompt = stringField(body, "prompt") ?? (await promptForSession(stringField(body, "session_id", "sessionId")));
    if (!prompt) return Response.json({ error: "invalid_request" }, { status: 400 });
    const image = await generateImage(prompt);
    if (image.imageUrl) return Response.json({ imageUrl: image.imageUrl });
    return Response.json({ mock: image.mock ?? "MOCK image: MODEL_API_KEY is unset." });
  } catch (error) {
    return failureResponse(error, "api_image_failed");
  }
}

async function promptForSession(sessionId: string | undefined): Promise<string | undefined> {
  if (!sessionId) return undefined;
  const session = await getSession(sessionId);
  const playbook = session ? await getPlaybook(session.id) : null;
  const role = playbook?.subject.role || session?.role || "engineering manager";
  const company = playbook?.subject.company || "Northline Labs";
  return `A quiet paper diagram of the ${role} handoff at ${company}. Simple boxes and lines, no portraits, no letters.`;
}
