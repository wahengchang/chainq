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
// `input` is the trigger: it has no upstream and emits the flow's seed item(s)
// from declared params + run-time values (one set → 1 item; many sets → batch).
// Note: there is deliberately NO "loop" container type. idea.md envisioned a
// container that runs a multi-step sub-flow per item, but the items model already
// expresses that — splitOut (fan-out) → a chain of per-item ai/cmd/assemble steps
// (each runs once per input item, paired by paired-item lineage) → aggregate
// (fan-in). A separate Loop container would be a second way to do the same thing,
// which violates "永不寫兩套". Loop is ⛔ by design (see idea-gap.md).
export type NodeType = "ai" | "cmd" | "assemble" | "splitOut" | "aggregate" | "merge" | "input" | "write";

/** A declared input parameter (n8n form field). All fields optional, so existing
 * flows (default-only) are unchanged. */
export interface ParamSpec {
  default?: unknown;
  /** Declared value type. When set, the web form draws the matching widget and
   * the value is coerced to this type (bypassing the lenient JSON-or-string
   * parseVal — so type:"string" keeps "42" a string). Absent → lenient. */
  type?: "string" | "number" | "boolean";
  /** When true, a run must supply this param (unless it has a default), else
   * validateRunInput errors — identically on the CLI and the web. Absent →
   * optional (the existing behavior). required + a default is a no-op (the
   * default always satisfies it). */
  required?: boolean;
}

/** Merge combine strategy (n8n Merge node). */
export type MergeMode = "append" | "byPosition" | "byKey";
/** cmd execution cardinality. */
export type CmdMode = "once" | "perItem";
/** write 成品 file mode. */
export type WriteMode = "overwrite" | "append";
/** ai structured-output schema (C4): a minimal field → type map. The model's
 * output is parsed as JSON and each declared field is checked; extra fields are
 * allowed. `array`/`object` check the container only (shallow, by design). */
export type SchemaType = "string" | "number" | "boolean" | "array" | "object";
export type SchemaSpec = Record<string, SchemaType>;

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
  /** merge: combine strategy. cmd: 'once' | 'perItem'. write: 'overwrite' | 'append'. */
  mode?: MergeMode | CmdMode | WriteMode;
  /** merge byKey: the property name both sides are joined on. */
  key?: string;
  /** write: output file path (relative to cwd). Supports {{date}} / {{datetime}}. */
  path?: string;
  /** ai: declared structured-output schema (C4). When set, the model output is
   * parsed as JSON and validated; a mismatch triggers one corrective retry, then
   * fails. The node's output item becomes the parsed object. */
  schema?: SchemaSpec;
  /** input: declared parameters (name → spec with optional default). Supplied at
   * run time via --input / --input-file; one set → 1 seed item, many → batch. */
  params?: Record<string, ParamSpec>;
  /** ai/cmd: per-node subprocess timeout in SECONDS. Overrides the flow default
   * (Flow.defaults.timeout) and the built-in 300s fallback for THIS node only —
   * e.g. an ai step that writes a whole article needs more than the default. */
  timeout?: number;
}

export interface Flow {
  profiles: Record<string, ProfileSpec>;
  /** Insertion order is preserved and used as the deterministic run order. */
  steps: Record<string, FlowNode>;
  /** Flow-wide defaults applied to every node unless the node overrides them. */
  defaults?: {
    /** Subprocess timeout in SECONDS for nodes without their own `timeout`. */
    timeout?: number;
  };
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
