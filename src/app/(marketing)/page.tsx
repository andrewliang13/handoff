import type { ReactNode } from "react";
import type {
  CitedClaim,
  DayOneItem,
  DecisionLogEntry,
  Landmine,
  OpenQuestion,
  PeopleMapEntry,
  Playbook,
  RoleMapEntry,
  Sop,
} from "@/lib/types";
import playbookJson from "../../../fixtures/northline-playbook.json";

const playbook: Playbook = playbookJson;

function Cites({ claim }: { claim: CitedClaim }) {
  return (
    <p className="mt-2 font-mono text-xs tracking-wide text-neutral-500">
      {claim.source_turn_ids.join(" ")}
    </p>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-neutral-200 py-8">
      <h2 className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
        {title}
      </h2>
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  );
}

function Role({ entry }: { entry: RoleMapEntry }) {
  return (
    <article>
      <h3 className="font-medium">{entry.area}</h3>
      <p className="text-neutral-700">{entry.owner}</p>
      <p className="mt-1 text-neutral-800">{entry.responsibility}</p>
      <Cites claim={entry} />
    </article>
  );
}

function Decision({ entry }: { entry: DecisionLogEntry }) {
  return (
    <article>
      <h3 className="font-medium">{entry.title}</h3>
      <p className="mt-1 text-neutral-800">{entry.decision}</p>
      <p className="mt-1 text-neutral-700">{entry.rationale}</p>
      <Cites claim={entry} />
    </article>
  );
}

function Hazard({ entry }: { entry: Landmine }) {
  return (
    <article>
      <h3 className="font-medium">{entry.title}</h3>
      <p className="mt-1 text-neutral-800">{entry.risk}</p>
      <p className="mt-1 text-neutral-700">{entry.mitigation}</p>
      <Cites claim={entry} />
    </article>
  );
}

function Procedure({ entry }: { entry: Sop }) {
  return (
    <article>
      <h3 className="font-medium">{entry.name}</h3>
      <p className="text-neutral-700">{entry.when}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-neutral-800">
        {entry.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <Cites claim={entry} />
    </article>
  );
}

function ChecklistItem({ entry }: { entry: DayOneItem }) {
  return (
    <li>
      <span>{entry.text}</span>
      <Cites claim={entry} />
    </li>
  );
}

function Person({ entry }: { entry: PeopleMapEntry }) {
  return (
    <article>
      <h3 className="font-medium">{entry.name}</h3>
      <p className="text-neutral-700">{entry.role}</p>
      <p className="mt-1 text-neutral-800">{entry.context}</p>
      <Cites claim={entry} />
    </article>
  );
}

function Gap({ entry }: { entry: OpenQuestion }) {
  return (
    <article>
      <h3 className="font-medium">{entry.question}</h3>
      <p className="mt-1 text-neutral-700">{entry.reason}</p>
      <Cites claim={entry} />
    </article>
  );
}

export default function HomePage() {
  const { subject } = playbook;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <p className="font-mono text-xs tracking-wide text-neutral-500">
        Fixture playbook · no model call
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {subject.company}
      </h1>
      <p className="mt-2 text-lg text-neutral-800">
        {subject.role}. Departing leader: {subject.departing_leader}.
      </p>
      <Cites claim={subject} />

      <Section title="Role map">
        {playbook.role_map.map((entry) => (
          <Role key={entry.id} entry={entry} />
        ))}
      </Section>
      <Section title="Decision log">
        {playbook.decision_log.map((entry) => (
          <Decision key={entry.id} entry={entry} />
        ))}
      </Section>
      <Section title="Landmines">
        {playbook.landmines.map((entry) => (
          <Hazard key={entry.id} entry={entry} />
        ))}
      </Section>
      <Section title="SOPs">
        {playbook.sops.map((entry) => (
          <Procedure key={entry.id} entry={entry} />
        ))}
      </Section>
      <Section title="Day one">
        <ul className="space-y-4">
          {playbook.day_one_checklist.map((entry) => (
            <ChecklistItem key={entry.id} entry={entry} />
          ))}
        </ul>
      </Section>
      <Section title="People">
        {playbook.people_map.map((entry) => (
          <Person key={entry.id} entry={entry} />
        ))}
      </Section>
      <Section title="Open questions">
        {playbook.open_questions.map((entry) => (
          <Gap key={entry.id} entry={entry} />
        ))}
      </Section>
    </main>
  );
}
