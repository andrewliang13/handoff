import { COVERAGE_SLOTS, type CoverageMap, type CoverageSlot } from "@/lib/types";

const LABELS: Record<CoverageSlot, string> = {
  owners: "Owners",
  decision_rules: "Decision rules",
  landmines: "Landmines",
  sops: "SOPs",
  people_map: "People",
  on_call_escalation: "On-call escalation",
  tribal_knowledge: "Tribal knowledge",
};

export function CoverageMeters({ coverage }: { coverage: CoverageMap }) {
  return (
    <section className="mt-8" aria-labelledby="coverage-heading">
      <h2 id="coverage-heading" className="text-sm font-medium tracking-wide text-[#5c564c] uppercase">
        Coverage
      </h2>
      <ul className="mt-4 space-y-3">
        {COVERAGE_SLOTS.map((slot) => {
          const score = Math.min(1, Math.max(0, coverage[slot] ?? 0));
          const percent = Math.round(score * 100);
          return (
            <li
              key={slot}
              className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm"
            >
              <span>{LABELS[slot]}</span>
              <span
                className="block h-1 bg-[#1c1916]/15"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={LABELS[slot]}
              >
                <span className="block h-1 bg-[#1c1916]" style={{ width: `${percent}%` }} />
              </span>
              <span className="text-right font-mono text-xs text-[#5c564c]">{percent}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
