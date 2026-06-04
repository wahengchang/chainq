// Core data model for a chain flow.
//
// A flow is ONE YAML file: a set of named steps (nodes) plus model profiles.
// The node's identity IS its YAML key (decided in eng review). Visual data
// (canvas coordinates) never lives here — it goes in .chain/layout.json.
//
//   profiles:                      steps:
//     default: { cmd: 'claude -p' }   fetch:     { type: cmd, run: 'cat in.txt', inputs: ['in.txt'] }
//                                     summarize: { type: ai, from: fetch, prompt: '...{{ $json }}' }

// ai/cmd/assemble run per-item; splitOut/aggregate/merge are COLLECTION operators
// (they see the whole input items array, not one item at a time) — the n8n model.
export type NodeType = "ai" | "cmd" | "assemble" | "splitOut" | "aggregate" | "merge";

/** Merge combine strategy (n8n Merge node). */
export type MergeMode = "append" | "byPosition" | "byKey";
/** cmd execution cardinality. */
export type CmdMode = "once" | "perItem";

export interface ProfileSpec {
  /** Command template for the local CLI model, e.g. 'claude -p'. */
  cmd: string;
}

export interface FlowNode {
  /** = the YAML key. Set during parse, not written by the user. */
  id: string;
  type: NodeType;
  /** Upstream dependency edge(s). A single name or a list (multi-input). */
  from?: string | string[];
  /** ai: the prompt template (may contain {{ $json.x }} expressions). */
  prompt?: string;
  /** cmd: the shell-free command line (argv split on spaces). */
  run?: string;
  /**
   * cmd: declared input files. Folded into the cache key (content hash) so the
   * node is cacheable. Without this, a cmd node is treated as VOLATILE
   * (uncacheable + always re-run) — see eng review "cmd uncacheable by default".
   */
  inputs?: string[];
  /** ai: which profile to use. Defaults to 'default'. */
  profile?: string;
  /** splitOut/aggregate: a single property name of the (object) item to split out /
   * aggregate. Omitted → operate on the whole item value. */
  field?: string;
  /** merge: combine strategy (default 'append'). cmd: 'once' (default) | 'perItem'. */
  mode?: MergeMode | CmdMode;
  /** merge byKey: the property name both sides are joined on. */
  key?: string;
}

export interface Flow {
  profiles: Record<string, ProfileSpec>;
  /** Insertion order is preserved and used as the deterministic run order. */
  steps: Record<string, FlowNode>;
}

export type NodeStatus = "ran" | "cached" | "failed" | "skipped";

/**
 * The unit that flows on every wire (n8n-style items model). A node's output is
 * a LIST of items; a node runs once per input item. `json` is the item's value —
 * raw text for an ai/cmd node (NOT auto-parsed), a parsed element after Split Out.
 * `pairedItem` records which input item this derived from (for $('id') paired
 * lookup + Merge by-position); absent on root / collection outputs.
 */
export interface Item {
  json: unknown;
  pairedItem?: number;
}

/** Wrap raw command/model text as a single item (the 1-in-1-out base case). */
export function textItem(text: string, pairedItem?: number): Item {
  return pairedItem === undefined ? { json: text } : { json: text, pairedItem };
}

/** Flatten output items back to text (raw strings stay raw; structured → JSON).
 * Used for CLI/web display and assertions; one item = its text (1-in-1-out). */
export function itemsText(items: Item[]): string {
  return items.map((i) => (typeof i.json === "string" ? i.json : JSON.stringify(i.json))).join("\n");
}

export interface NodeResult {
  id: string;
  status: NodeStatus;
  /** The node's output items. Empty list = no data (skipped/failed/empty fan-out). */
  output: Item[];
  /** Present when status === 'failed'. */
  error?: string;
  /** Distinguishes a login-expired failure from an ordinary one (E1). */
  authExpired?: boolean;
}
