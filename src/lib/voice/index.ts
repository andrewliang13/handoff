/** Owned by Backend-Voice. Uploads land under data/sessions/<id>/audio. */
export const OWNER = "Backend-Voice" as const;

export { chunkAudio } from "./chunk";
export type { AudioChunk } from "./chunk";
export { saveAndTranscribe } from "./upload";
