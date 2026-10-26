/**
 * Meta Model API client.
 * Base URL: https://api.meta.ai/v1
 * Auth: Authorization: Bearer <MODEL_API_KEY>
 * The key is read from the environment inside request helpers and is never logged.
 */

const META_API_BASE = "https://api.meta.ai/v1";
const TEXT_MODEL = "muse-spark-1.3";
const TRANSCRIBE_MODEL = "muse-voice-transcribe-1.0";
const IMAGE_MODEL = "muse-image-1.0";
const RETRY_DELAY_MS = 500;

export class MetaUnauthorizedError extends Error {
  readonly status = 401 as const;

  constructor(message = "Meta API unauthorized") {
    super(message);
    this.name = "MetaUnauthorizedError";
  }
}

export class MetaRateLimitError extends Error {
  readonly status = 429 as const;

  constructor(message = "Meta API rate limited") {
    super(message);
    this.name = "MetaRateLimitError";
  }
}

export class MetaRequestError extends Error {
  readonly status: number;

  constructor(status: number, message = "Meta API request failed") {
    super(message);
    this.name = "MetaRequestError";
    this.status = status;
  }
}

export type TranscribedTurn = {
  speaker?: string;
  text: string;
  startMs?: number;
};

export type TranscribeResult = {
  text: string;
  turns: TranscribedTurn[];
};

export type GeneratedImage = {
  imageUrl?: string;
  mock?: string;
};

type RequestParts = {
  body?: BodyInit;
  headers?: HeadersInit;
};

function readApiKey(): string | null {
  const value = process.env.MODEL_API_KEY;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function drain(response: Response): Promise<void> {
  await response.arrayBuffer().catch(() => undefined);
}

async function metaRequest(path: string, build: () => RequestParts): Promise<Response> {
  const key = readApiKey();
  if (!key) {
    throw new MetaRequestError(0, "MODEL_API_KEY is unset");
  }

  const send = () => {
    const parts = build();
    const headers = new Headers(parts.headers);
    headers.set("Authorization", `Bearer ${key}`);
    return fetch(`${META_API_BASE}${path}`, {
      method: "POST",
      body: parts.body,
      headers,
    });
  };

  let response = await send();
  if (response.status === 429) {
    await drain(response);
    await delay(RETRY_DELAY_MS);
    response = await send();
  }

  if (response.status === 401) {
    await drain(response);
    throw new MetaUnauthorizedError();
  }

  if (response.status === 429) {
    await drain(response);
    throw new MetaRateLimitError();
  }

  return response;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function completionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const content = (choices[0] as { message?: { content?: unknown } }).message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

function transcriptResult(payload: unknown): TranscribeResult {
  if (typeof payload === "string") {
    return { text: payload.trim(), turns: [] };
  }
  if (!payload || typeof payload !== "object") {
    return { text: "", turns: [] };
  }
  const record = payload as { transcript?: unknown; turns?: unknown };
  const text = typeof record.transcript === "string" ? record.transcript.trim() : "";
  const turns = Array.isArray(record.turns)
    ? record.turns.flatMap((turn) => {
        if (!turn || typeof turn !== "object") return [];
        const entry = turn as { transcript?: unknown; speaker?: unknown; startMs?: unknown };
        if (typeof entry.transcript !== "string" || !entry.transcript.trim()) return [];
        return [
          {
            speaker: typeof entry.speaker === "string" ? entry.speaker : undefined,
            text: entry.transcript.trim(),
            startMs: typeof entry.startMs === "number" ? entry.startMs : undefined,
          },
        ];
      })
    : [];
  return { text, turns };
}

function imageResult(payload: unknown): GeneratedImage {
  if (!payload || typeof payload !== "object") {
    throw new MetaRequestError(502, "Meta image response was empty");
  }
  const data = (payload as { data?: unknown }).data;
  const first = Array.isArray(data) ? data[0] : undefined;
  if (!first || typeof first !== "object") {
    throw new MetaRequestError(502, "Meta image response had no data");
  }
  const image = first as { url?: unknown; b64_json?: unknown };
  if (typeof image.url === "string" && image.url) {
    return { imageUrl: image.url };
  }
  if (typeof image.b64_json === "string" && image.b64_json) {
    return { imageUrl: `data:image/webp;base64,${image.b64_json}` };
  }
  throw new MetaRequestError(502, "Meta image response had no url");
}

/** Chat completion. Missing key returns a MOCK string and does not throw. */
export async function completeText(prompt: string): Promise<string> {
  if (!readApiKey()) {
    return "MOCK completeText: MODEL_API_KEY is unset.";
  }

  const response = await metaRequest("/chat/completions", () => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TEXT_MODEL,
      messages: [{ role: "user", content: prompt }],
      reasoning_effort: "low",
    }),
  }));

  const payload = await readJson(response);
  if (!response.ok) {
    throw new MetaRequestError(response.status, "Meta text request failed");
  }
  return completionText(payload);
}

/** Speech-to-text for one audio clip. Callers chunk long recordings first. */
export async function transcribe(audio: Buffer, filename = "audio.wav"): Promise<TranscribeResult> {
  if (!readApiKey()) {
    return {
      text: "Fixture transcript note: MODEL_API_KEY is unset.",
      turns: [],
    };
  }

  const bytes = new Uint8Array(audio.byteLength);
  bytes.set(audio);

  const response = await metaRequest("/asr/transcribe", () => {
    const form = new FormData();
    form.append(
      "request",
      new Blob(
        [
          JSON.stringify({
            model: TRANSCRIBE_MODEL,
            audioEncoding: "WAV",
            mode: "DIARIZATION",
          }),
        ],
        { type: "application/json" },
      ),
    );
    const safeName = filename.toLowerCase().endsWith(".wav") ? filename : "audio.wav";
    form.append("audio", new Blob([bytes], { type: "audio/wav" }), safeName);
    return {
      headers: { Accept: "application/json" },
      body: form,
    };
  });

  const payload = await readJson(response);
  if (!response.ok) {
    throw new MetaRequestError(response.status, "Meta transcribe request failed");
  }
  return transcriptResult(payload);
}

/** Text-to-image. Missing key returns a mock descriptor and does not throw. */
export async function generateImage(prompt: string): Promise<GeneratedImage> {
  if (!readApiKey()) {
    return { mock: "MOCK image: MODEL_API_KEY is unset." };
  }

  const response = await metaRequest("/images/generations", () => ({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      response_format: "url",
    }),
  }));

  const payload = await readJson(response);
  if (!response.ok) {
    throw new MetaRequestError(response.status, "Meta image request failed");
  }
  return imageResult(payload);
}
