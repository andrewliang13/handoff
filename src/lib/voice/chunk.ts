/**
 * Split long recordings into clips the Voice Transcribe endpoint will accept.
 * That endpoint rejects audio longer than 10 minutes or a body over 32 MB.
 */

const MAX_CHUNK_MS = 9 * 60 * 1000;
const MAX_CHUNK_BYTES = 24 * 1024 * 1024;

export type AudioChunk = {
  bytes: Buffer;
  index: number;
};

export function chunkAudio(audio: Buffer): AudioChunk[] {
  const wav = readWav(audio);
  if (!wav) {
    return splitBuffer(audio, MAX_CHUNK_BYTES).map((bytes, index) => ({ bytes, index }));
  }

  const durationMs = wav.byteRate > 0 ? (wav.dataSize / wav.byteRate) * 1000 : 0;
  if (durationMs <= 10 * 60 * 1000 && audio.length <= 32 * 1024 * 1024) {
    return [{ bytes: audio, index: 0 }];
  }

  const bytesForTime = Math.floor((wav.byteRate * MAX_CHUNK_MS) / 1000);
  const chunkSize = align(Math.min(bytesForTime, MAX_CHUNK_BYTES), wav.blockAlign);
  const pieces: AudioChunk[] = [];
  for (let offset = 0; offset < wav.dataSize; offset += chunkSize) {
    const size = Math.min(chunkSize, wav.dataSize - offset);
    const pcm = audio.subarray(wav.dataOffset + offset, wav.dataOffset + offset + size);
    pieces.push({ bytes: wrapWav(wav.fmtChunk, pcm), index: pieces.length });
  }
  return pieces.length > 0 ? pieces : [{ bytes: audio, index: 0 }];
}

type WavInfo = {
  byteRate: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
  fmtChunk: Buffer;
};

function readWav(audio: Buffer): WavInfo | null {
  if (audio.length < 12) return null;
  if (audio.toString("ascii", 0, 4) !== "RIFF") return null;
  if (audio.toString("ascii", 8, 12) !== "WAVE") return null;

  let offset = 12;
  let byteRate = 0;
  let blockAlign = 1;
  let fmtChunk: Buffer | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= audio.length) {
    const id = audio.toString("ascii", offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (size < 0 || start + size > audio.length) break;
    if (id === "fmt " && size >= 16) {
      byteRate = audio.readUInt32LE(start + 8);
      blockAlign = audio.readUInt16LE(start + 12) || 1;
      fmtChunk = Buffer.from(audio.subarray(offset, start + size));
    } else if (id === "data" && dataOffset < 0) {
      dataOffset = start;
      dataSize = size;
    }
    offset = start + size + (size % 2);
  }

  if (!fmtChunk || dataOffset < 0 || byteRate <= 0) return null;
  return { byteRate, blockAlign, dataOffset, dataSize, fmtChunk };
}

function wrapWav(fmtChunk: Buffer, pcm: Buffer): Buffer {
  const pad = pcm.length % 2;
  const riffSize = 4 + fmtChunk.length + 8 + pcm.length + pad;
  const out = Buffer.alloc(8 + riffSize);
  out.write("RIFF", 0);
  out.writeUInt32LE(riffSize, 4);
  out.write("WAVE", 8);
  fmtChunk.copy(out, 12);
  const dataHeader = 12 + fmtChunk.length;
  out.write("data", dataHeader);
  out.writeUInt32LE(pcm.length, dataHeader + 4);
  pcm.copy(out, dataHeader + 8);
  return out;
}

function align(size: number, blockAlign: number): number {
  const safe = Math.max(blockAlign, size);
  return safe - (safe % blockAlign);
}

function splitBuffer(audio: Buffer, size: number): Buffer[] {
  if (audio.length <= size) return [audio];
  const parts: Buffer[] = [];
  for (let offset = 0; offset < audio.length; offset += size) {
    parts.push(audio.subarray(offset, Math.min(offset + size, audio.length)));
  }
  return parts;
}
