"use client";

import { useState } from "react";
import type { QaView } from "@/components/interview/client";

export function SuccessorAsk({
  disabled,
  busy,
  result,
  onAsk,
  onCite,
}: {
  disabled: boolean;
  busy: boolean;
  result: QaView | null;
  onAsk: (question: string) => void;
  onCite: (turnIds: string[]) => void;
}) {
  const [question, setQuestion] = useState("");

  return (
    <form
      className="mt-10 border-t border-[#1c1916]/15 pt-8"
      onSubmit={(event) => {
        event.preventDefault();
        const next = question.trim();
        if (!next || disabled || busy) return;
        onAsk(next);
      }}
    >
      <label
        htmlFor="successor-question"
        className="text-sm font-medium tracking-wide text-[#5c564c] uppercase"
      >
        Ask the handoff
      </label>
      <textarea
        id="successor-question"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        disabled={disabled || busy}
        rows={3}
        className="mt-3 w-full border border-[#1c1916]/20 bg-white px-3 py-2 text-base leading-relaxed outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || busy || !question.trim()}
        className="mt-3 bg-[#1c1916] px-4 py-2 text-sm text-[#f6f1e7] outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-50"
      >
        {busy ? "Asking" : "Ask"}
      </button>
      {disabled ? (
        <p className="mt-3 text-sm text-[#3f3a33]">Play the sample, or finish an interview, before asking.</p>
      ) : null}
      {result?.kind === "abstain" ? <p className="mt-6 text-base">not covered in handoff</p> : null}
      {result?.kind === "answer" ? (
        <div className="mt-6">
          <p className="text-base leading-relaxed">{result.text}</p>
          {result.source_turn_ids.length ? (
            <button
              type="button"
              onClick={() => onCite(result.source_turn_ids)}
              className="mt-2 font-mono text-xs tracking-wide text-[#5c564c] underline decoration-[#1c1916]/30 underline-offset-4 outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916]"
            >
              {result.source_turn_ids.join(" ")}
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
