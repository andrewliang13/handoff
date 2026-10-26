/**
 * Slot score on the closed interval from 0 to 1.
 * 0 means the interview has not covered the slot.
 * 1 means a successor could act on it without another question.
 */
export type CoverageScore = number;

export const COVERAGE_SLOTS = [
  "owners",
  "decision_rules",
  "landmines",
  "sops",
  "people_map",
  "on_call_escalation",
  "tribal_knowledge",
] as const;

export type CoverageSlot = (typeof COVERAGE_SLOTS)[number];

/** One score per coverage slot. Keys match `COVERAGE_SLOTS`. */
export type CoverageMap = Record<CoverageSlot, CoverageScore>;
