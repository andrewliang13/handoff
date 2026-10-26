/** Owned by Backend-API. */
export const OWNER = "Backend-API" as const;

export {
  completeText,
  generateImage,
  MetaRateLimitError,
  MetaRequestError,
  MetaUnauthorizedError,
  transcribe,
} from "./client";
export type { GeneratedImage, TranscribeResult, TranscribedTurn } from "./client";
