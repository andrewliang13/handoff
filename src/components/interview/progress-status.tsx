const PHASES = ["recording", "transcribing", "interviewing", "synthesizing", "ready"] as const;

export type ProgressPhase = (typeof PHASES)[number];
export type Phase = ProgressPhase | "idle";

export function ProgressStatus({ phase }: { phase: Phase }) {
  return (
    <p className="font-mono text-xs tracking-wide text-[#5c564c]" role="status">
      {PHASES.map((item, index) => (
        <span key={item}>
          {index > 0 ? " · " : null}
          <span className={item === phase ? "text-[#1c1916]" : undefined} aria-current={item === phase ? "step" : undefined}>
            {item}
          </span>
        </span>
      ))}
    </p>
  );
}
