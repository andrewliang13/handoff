const interviewLines = [
  "Who owns on-call?",
  "What breaks first?",
  "Which call still stands?",
];

const playbookLines = ["On-call owner", "Week-one risks", "Standing decisions"];

function lineClass(base: string, extra: string) {
  return extra ? `${base} ${extra}` : base;
}

/**
 * CSS-only sketch of an interview settling into a playbook.
 * Resting styles are the finished transfer. Motion runs only when the
 * visitor has not asked for reduced motion.
 */
export function Transfer() {
  return (
    <figure className="handoff-transfer" aria-labelledby="handoff-transfer-caption">
      <div className="handoff-transfer-stage">
        <div className="handoff-transfer-sheet handoff-transfer-interview">
          <p className="handoff-transfer-label">Interview</p>
          {interviewLines.map((line, index) => (
            <p
              key={line}
              className={lineClass(
                "handoff-transfer-line handoff-transfer-source",
                index === 1
                  ? "handoff-transfer-delay-1"
                  : index === 2
                    ? "handoff-transfer-delay-2"
                    : "",
              )}
            >
              {line}
            </p>
          ))}
        </div>
        <p className="handoff-transfer-gutter">into</p>
        <div className="handoff-transfer-sheet handoff-transfer-playbook">
          <p className="handoff-transfer-label">Playbook</p>
          {playbookLines.map((line, index) => (
            <p
              key={line}
              className={lineClass(
                "handoff-transfer-line handoff-transfer-settled",
                index === 0
                  ? "handoff-transfer-arrive-1"
                  : index === 1
                    ? "handoff-transfer-arrive-2"
                    : "handoff-transfer-arrive-3",
              )}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
      <figcaption id="handoff-transfer-caption" className="handoff-transfer-caption">
        From the interview into the playbook.
      </figcaption>
    </figure>
  );
}
