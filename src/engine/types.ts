// Core data model for a chain flow.
//
// A flow is ONE YAML file: a set of named steps (nodes) plus model profiles.
// The node's identity IS its YAML key (decided in eng review). Visual data
// (canvas coordinates) never lives here — it goes in .chain/layout.json.
//
//   profiles:                      steps:
//     default: { cmd: 'claude -p' }   fetch:     { type: cmd, run: 'cat in.txt', inputs: ['in.txt'] }
//     fake:    { cmd: 'cat' }          summarize: { type: ai, from: fetch, prompt: '...{{ $json }}' }

export type NodeType = "ai" | "cmd" | "assemble";

export interface ProfileSpec {
  /** Command template, e.g. 'claude -p' or the G2 fake 'cat'. */
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
}

export interface Flow {
  profiles: Record<string, ProfileSpec>;
  /** Insertion order is preserved and used as the deterministic run order. */
  steps: Record<string, FlowNode>;
}

export type NodeStatus = "ran" | "cached" | "failed" | "skipped";

export interface NodeResult {
  id: string;
  status: NodeStatus;
  output: string;
  /** Present when status === 'failed'. */
  error?: string;
  /** Distinguishes a login-expired failure from an ordinary one (E1). */
  authExpired?: boolean;
}
