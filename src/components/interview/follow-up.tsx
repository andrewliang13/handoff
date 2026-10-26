"use client";

import { useState } from "react";

export function FollowUp({
  question,
  busy,
  onAnswer,
}: {
  question: string;
  busy: boolean;
  onAnswer: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [forQuestion, setForQuestion] = useState(question);
  if (forQuestion !== question) {
    setForQuestion(question);
    setAnswer("");
  }

  return (
    <form
      className="mt-8 border-t border-[#1c1916]/15 pt-8"
      onSubmit={(event) => {
        event.preventDefault();
        const next = answer.trim();
        if (!next || busy) return;
        onAnswer(next);
      }}
    >
      <h2 className="text-sm font-medium tracking-wide text-[#5c564c] uppercase">Follow-up</h2>
      <p className="mt-3 text-lg leading-relaxed">{question}</p>
      <label htmlFor="follow-up-answer" className="mt-4 block text-sm font-medium">
        Your answer
      </label>
      <textarea
        id="follow-up-answer"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        rows={4}
        disabled={busy}
        className="mt-2 w-full border border-[#1c1916]/20 bg-white px-3 py-2 text-sm leading-relaxed outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={busy || !answer.trim()}
        className="mt-3 bg-[#1c1916] px-4 py-2 text-sm text-[#f6f1e7] outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] disabled:opacity-50"
      >
        {busy ? "Sending" : "Send answer"}
      </button>
    </form>
  );
}
