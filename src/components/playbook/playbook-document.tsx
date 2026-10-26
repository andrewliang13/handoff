"use client";

import { useState, type ReactNode } from "react";
import type {
  DayOneItem,
  DecisionLogEntry,
  Landmine,
  OpenQuestion,
  PeopleMapEntry,
  Playbook,
  RoleMapEntry,
  Sop,
} from "@/lib/types";

type CiteHandler = (turnIds: string[], claimId: string) => void;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[#1c1916]/15 py-8">
      <h3 className="text-sm font-medium tracking-wide text-[#5c564c] uppercase">{title}</h3>
      <div className="mt-4 space-y-6">{children}</div>
    </section>
  );
}

function Claim({
  id,
  active,
  turnIds,
  onCite,
  children,
}: {
  id: string;
  active: boolean;
  turnIds: string[];
  onCite: CiteHandler;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onCite(turnIds, id)}
      aria-pressed={active}
      className={`block w-full px-3 py-2 text-left outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] ${
        active ? "bg-[#e7e0d2]" : "hover:bg-[#efeadd]"
      }`}
    >
      {children}
      <p className="mt-2 font-mono text-xs tracking-wide text-[#5c564c]">
        {turnIds.length ? turnIds.join(" ") : "No cited turn"}
      </p>
    </button>
  );
}

function Empty() {
  return <p className="text-[#3f3a33]">Nothing recorded.</p>;
}

function RoleClaim({
  entry,
  active,
  onCite,
}: {
  entry: RoleMapEntry;
  active: boolean;
  onCite: CiteHandler;
}) {
  return (
    <Claim id={entry.id} active={active} turnIds={entry.source_turn_ids} onCite={onCite}>
      <span className="block font-medium">{entry.area}</span>
      <span className="mt-1 block text-[#3f3a33]">{entry.owner}</span>
      <span className="mt-1 block">{entry.responsibility}</span>
    </Claim>
  );
}

function DecisionClaim({
  entry,
  active,
  onCite,
}: {
  entry: DecisionLogEntry;
  active: boolean;
  onCite: CiteHandler;
}) {
  return (
    <Claim id={entry.id} active={active} turnIds={entry.source_turn_ids} onCite={onCite}>
      <span className="block font-medium">{entry.title}</span>
      <span className="mt-1 block">{entry.decision}</span>
      <span className="mt-1 block text-[#3f3a33]">{entry.rationale}</span>
    </Claim>
  );
}

function LandmineClaim({
  entry,
  active,
  onCite,
}: {
  entry: Landmine;
  active: boolean;
  onCite: CiteHandler;
}) {
  return (
    <Claim id={entry.id} active={active} turnIds={entry.source_turn_ids} onCite={onCite}>
      <span className="block font-medium">{entry.title}</span>
      <span className="mt-1 block">{entry.risk}</span>
      <span className="mt-1 block text-[#3f3a33]">{entry.mitigation}</span>
    </Claim>
  );
}

function SopClaim({ entry, active, onCite }: { entry: Sop; active: boolean; onCite: CiteHandler }) {
  return (
    <Claim id={entry.id} active={active} turnIds={entry.source_turn_ids} onCite={onCite}>
      <span className="block font-medium">{entry.name}</span>
      <span className="mt-1 block text-[#3f3a33]">{entry.when}</span>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        {entry.steps.map((step, index) => (
          <li key={`${entry.id}-${index}`}>{step}</li>
        ))}
      </ol>
    </Claim>
  );
}

function PersonClaim({
  entry,
  active,
  onCite,
}: {
  entry: PeopleMapEntry;
  active: boolean;
  onCite: CiteHandler;
}) {
  return (
    <Claim id={entry.id} active={active} turnIds={entry.source_turn_ids} onCite={onCite}>
      <span className="block font-medium">{entry.name}</span>
      <span className="mt-1 block text-[#3f3a33]">{entry.role}</span>
      <span className="mt-1 block">{entry.context}</span>
    </Claim>
  );
}

function GapClaim({
  entry,
  active,
  onCite,
}: {
  entry: OpenQuestion;
  active: boolean;
  onCite: CiteHandler;
}) {
  return (
    <Claim id={entry.id} active={active} turnIds={entry.source_turn_ids} onCite={onCite}>
      <span className="block font-medium">{entry.question}</span>
      <span className="mt-1 block text-[#3f3a33]">{entry.reason}</span>
    </Claim>
  );
}

function Checklist({
  items,
  activeClaimId,
  onCite,
}: {
  items: DayOneItem[];
  activeClaimId: string | null;
  onCite: CiteHandler;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [listKey, setListKey] = useState(items.map((item) => item.id).join("|"));
  const nextKey = items.map((item) => item.id).join("|");
  if (listKey !== nextKey) {
    setListKey(nextKey);
    setChecked({});
  }

  if (!items.length) return <Empty />;

  return (
    <ul className="space-y-4">
      {items.map((entry) => (
        <li key={entry.id} className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={Boolean(checked[entry.id])}
            onChange={(event) =>
              setChecked((current) => ({ ...current, [entry.id]: event.target.checked }))
            }
            aria-label={entry.text}
            className="mt-1 h-4 w-4 accent-[#1c1916]"
          />
          <button
            type="button"
            onClick={() => onCite(entry.source_turn_ids, entry.id)}
            aria-pressed={activeClaimId === entry.id}
            className={`block flex-1 px-3 py-2 text-left outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] ${
              activeClaimId === entry.id ? "bg-[#e7e0d2]" : "hover:bg-[#efeadd]"
            }`}
          >
            <span className={checked[entry.id] ? "text-[#5c564c] line-through" : undefined}>{entry.text}</span>
            <span className="mt-2 block font-mono text-xs tracking-wide text-[#5c564c]">
              {entry.source_turn_ids.length ? entry.source_turn_ids.join(" ") : "No cited turn"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PlaybookDocument({
  playbook,
  activeClaimId,
  onCite,
}: {
  playbook: Playbook;
  activeClaimId: string | null;
  onCite: CiteHandler;
}) {
  const { subject } = playbook;

  return (
    <article className="mt-10">
      <p className="font-mono text-xs tracking-wide text-[#5c564c]">{playbook.id}</p>
      <h2 className="mt-3 [font-family:var(--font-source-serif),Georgia,serif] text-3xl tracking-[-0.03em]">
        {subject.company}
      </h2>
      <button
        type="button"
        onClick={() => onCite(subject.source_turn_ids, "subject")}
        aria-pressed={activeClaimId === "subject"}
        className={`mt-2 block w-full px-3 py-2 text-left text-lg outline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916] ${
          activeClaimId === "subject" ? "bg-[#e7e0d2]" : "hover:bg-[#efeadd]"
        }`}
      >
        {subject.role}. Departing leader: {subject.departing_leader}.
        <span className="mt-2 block font-mono text-xs tracking-wide text-[#5c564c]">
          {subject.source_turn_ids.join(" ")}
        </span>
      </button>

      <Section title="Role map">
        {playbook.role_map.length ? (
          playbook.role_map.map((entry) => (
            <RoleClaim key={entry.id} entry={entry} active={activeClaimId === entry.id} onCite={onCite} />
          ))
        ) : (
          <Empty />
        )}
      </Section>
      <Section title="Decisions">
        {playbook.decision_log.length ? (
          playbook.decision_log.map((entry) => (
            <DecisionClaim key={entry.id} entry={entry} active={activeClaimId === entry.id} onCite={onCite} />
          ))
        ) : (
          <Empty />
        )}
      </Section>
      <Section title="Landmines">
        {playbook.landmines.length ? (
          playbook.landmines.map((entry) => (
            <LandmineClaim key={entry.id} entry={entry} active={activeClaimId === entry.id} onCite={onCite} />
          ))
        ) : (
          <Empty />
        )}
      </Section>
      <Section title="SOPs">
        {playbook.sops.length ? (
          playbook.sops.map((entry) => (
            <SopClaim key={entry.id} entry={entry} active={activeClaimId === entry.id} onCite={onCite} />
          ))
        ) : (
          <Empty />
        )}
      </Section>
      <Section title="Day-1 checklist">
        <Checklist items={playbook.day_one_checklist} activeClaimId={activeClaimId} onCite={onCite} />
      </Section>
      <Section title="People">
        {playbook.people_map.length ? (
          playbook.people_map.map((entry) => (
            <PersonClaim key={entry.id} entry={entry} active={activeClaimId === entry.id} onCite={onCite} />
          ))
        ) : (
          <Empty />
        )}
      </Section>
      <Section title="Open questions">
        {playbook.open_questions.length ? (
          playbook.open_questions.map((entry) => (
            <GapClaim key={entry.id} entry={entry} active={activeClaimId === entry.id} onCite={onCite} />
          ))
        ) : (
          <Empty />
        )}
      </Section>
    </article>
  );
}
