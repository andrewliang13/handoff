"use client";

import { useEffect } from "react";
import type { TranscriptTurn } from "@/lib/types";

export function TranscriptList({
  turns,
  activeTurnIds,
}: {
  turns: TranscriptTurn[];
  activeTurnIds: string[];
}) {
  const activeKey = activeTurnIds.join("|");

  useEffect(() => {
    const first = activeKey.split("|")[0];
    if (!first) return;
    const element = document.getElementById(`turn-${first}`);
    if (element instanceof HTMLElement) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus();
    }
  }, [activeKey]);

  if (!turns.length) return null;

  const active = new Set(activeTurnIds);

  return (
    <section className="mt-10 border-t border-[#1c1916]/15 pt-8" aria-labelledby="transcript-heading">
      <h2 id="transcript-heading" className="text-sm font-medium tracking-wide text-[#5c564c] uppercase">
        Transcript
      </h2>
      <ol className="mt-4">
        {turns.map((turn) => {
          const cited = active.has(turn.id);
          return (
            <li
              key={turn.id}
              id={`turn-${turn.id}`}
              tabIndex={-1}
              className={`border-l-2 px-3 py-3 outline-none ${cited ? "border-[#1c1916] bg-[#e7e0d2]" : "border-transparent"}`}
            >
              <p className="font-mono text-xs tracking-wide text-[#5c564c]">
                {turn.speaker === "interviewer" ? "Interviewer" : "Leader"}
                {turn.timestamp ? ` · ${turn.timestamp}` : ""}
                {cited ? " · cited" : ""}
              </p>
              <p className="mt-1 leading-relaxed">{turn.text}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
