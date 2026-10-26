/** Who is speaking on a transcript turn. */
export type Speaker = "interviewer" | "leader";

/**
 * One spoken or typed turn in an exit interview.
 * `timestamp` is optional because a pasted transcript may not have one.
 * When present, it is an elapsed mark such as "00:01:10", not a calendar time.
 */
export type TranscriptTurn = {
  id: string;
  speaker: Speaker;
  text: string;
  timestamp?: string;
};

/** A full interview transcript. Sessions store `turns` directly. */
export type Transcript = {
  id: string;
  company: string;
  role: string;
  turns: TranscriptTurn[];
};
