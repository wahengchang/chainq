// Public engine surface. The CLI and the UI import from here — never from the
// internal modules directly, and never reimplement any of it.

export type {
  Flow,
  FlowNode,
  NodeType,
  ParamSpec,
  ProfileSpec,
  NodeResult,
  NodeStatus,
  Item,
} from "./types.js";
export { textItem, itemsText } from "./types.js";
export {
  parseFlow,
  topoOrder,
  upstreamsOf,
  ancestorsOf,
  descendantsOf,
  wouldCycle,
} from "./dag.js";
export { validate, type ValidationError } from "./validate.js";
export { computeKeys, volatileSet, CacheStore } from "./cache.js";
export { Runner, type RunOptions } from "./run.js";
export {
  planRun,
  nodeDisposition,
  type RunPlan,
  type PlanDeps,
  type Disposition,
} from "./plan.js";
export { FlowLock } from "./lock.js";
export { renderPrompt, promptRefs, rewriteRefs, type PromptRefs } from "./render.js";
export { renameNode } from "./rename.js";
export { isValidNodeId, nodeIdError, nodeStarter } from "./node.js";
export { parseVal, coerceParam, coerceInput } from "./input.js";
