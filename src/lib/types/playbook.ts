/**
 * Every playbook claim cites the transcript turns it came from.
 * Use an empty array only when a slot was asked and the leader could not answer.
 * Open questions still cite the turn that left the gap.
 */
export type CitedClaim = {
  source_turn_ids: string[];
};

export type PlaybookSubject = CitedClaim & {
  company: string;
  role: string;
  departing_leader: string;
};

/** Who owns a slice of the role being handed off. */
export type RoleMapEntry = CitedClaim & {
  id: string;
  area: string;
  owner: string;
  responsibility: string;
};

export type DecisionLogEntry = CitedClaim & {
  id: string;
  title: string;
  decision: string;
  rationale: string;
};

export type Landmine = CitedClaim & {
  id: string;
  title: string;
  risk: string;
  mitigation: string;
};

export type Sop = CitedClaim & {
  id: string;
  name: string;
  when: string;
  steps: string[];
};

export type DayOneItem = CitedClaim & {
  id: string;
  text: string;
};

export type PeopleMapEntry = CitedClaim & {
  id: string;
  name: string;
  role: string;
  context: string;
};

export type OpenQuestion = CitedClaim & {
  id: string;
  question: string;
  reason: string;
};

/**
 * Successor-ready handoff. Required sections stay present even when empty.
 * The synthesizer leaves a section empty and adds an open question rather than inventing a claim.
 */
export type Playbook = {
  id: string;
  transcript_id: string;
  subject: PlaybookSubject;
  role_map: RoleMapEntry[];
  decision_log: DecisionLogEntry[];
  landmines: Landmine[];
  sops: Sop[];
  day_one_checklist: DayOneItem[];
  people_map: PeopleMapEntry[];
  open_questions: OpenQuestion[];
};
