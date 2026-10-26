import type { TranscriptTurn } from "@/lib/types";

function turnFromUnknown(value: unknown, index: number): TranscriptTurn | null {
  if (!value || typeof value !== "object") return null;
  const turn = value as Record<string, unknown>;
  const text = typeof turn.text === "string" ? turn.text.trim() : "";
  if (!text) return null;
  return {
    id: typeof turn.id === "string" && turn.id ? turn.id : `p${String(index + 1).padStart(2, "0")}`,
    speaker: turn.speaker === "interviewer" ? "interviewer" : "leader",
    text,
    ...(typeof turn.timestamp === "string" ? { timestamp: turn.timestamp } : {}),
  };
}

export function parseTranscript(raw: string): TranscriptTurn[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const data: unknown = JSON.parse(trimmed);
      const turns = Array.isArray(data)
        ? data
        : data && typeof data === "object" && Array.isArray((data as { turns?: unknown }).turns)
          ? (data as { turns: unknown[] }).turns
          : null;
      if (turns) {
        const parsed = turns
          .map((turn, index) => turnFromUnknown(turn, index))
          .filter((turn): turn is TranscriptTurn => turn !== null);
        if (parsed.length) return parsed;
      }
    } catch {
      // Plain text that happens to start with a brace falls through.
    }
  }

  const labeled: TranscriptTurn[] = [];
  for (const line of trimmed.split(/\n+/)) {
    const match = line.match(/^(interviewer|leader)\s*:\s*(.+)$/i);
    if (!match) continue;
    labeled.push({
      id: `p${String(labeled.length + 1).padStart(2, "0")}`,
      speaker: match[1].toLowerCase() === "interviewer" ? "interviewer" : "leader",
      text: match[2].trim(),
    });
  }
  if (labeled.length) return labeled;

  return [{ id: "p01", speaker: "leader", text: trimmed }];
}
