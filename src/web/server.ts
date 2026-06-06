// Local web UI server (Node built-in http, no deps). Serves a single-page app
// for the "create a new project → edit the chain" flow, plus a small JSON API
// that reuses the SAME engine the CLI uses (parse / validate / run).
//
//   chain ui            → open the create screen (pick a folder, name a flow)
//   chain ui flow.yaml  → open straight into the editor for that flow
//
// Binds to 127.0.0.1 only — it reads/writes files on your machine on your behalf.

import { createServer, type Server, type ServerResponse, type IncomingMessage } from "node:http";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseDocument, type Document } from "yaml";
import {
  parseFlow,
  validate,
  Runner,
  upstreamsOf,
  renderPrompt,
  itemsText,
  renameNode,
  nodeStarter,
  nodeIdError,
  CacheStore,
  FlowLock,
  coerceInput,
  validateRunInput,
  type Item,
  type NodeType,
} from "../engine/index.js";
import { NEW_FLOW_TEMPLATE } from "../cli/new.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_HTML = readFileSync(join(HERE, "app.html"), "utf8");

export interface WebOptions {
  cwd: string;
  initialFlow?: string; // absolute path to open directly in the editor
}

/** Build the HTTP server without listening — used by tests. */
export function buildServer(opts: WebOptions): Server {
  return createServer((req, res) => {
    handle(req, res, opts).catch((e) =>
      json(res, 500, { error: e instanceof Error ? e.message : String(e) }),
    );
  });
}

export function startWebServer(opts: WebOptions): void {
  const server = buildServer(opts);
  server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    const url = `http://127.0.0.1:${port}/`;
    console.error(`chain ui → ${url}`);
    // Auto-open in the default browser, but NOT under automation: the e2e suite
    // spawns `chain ui` once per test, and a real tab per run pollutes the user's
    // browser with dead pages. CHAIN_NO_OPEN=1 suppresses it.
    if (process.platform === "darwin" && !process.env.CHAIN_NO_OPEN) {
      spawn("open", [url], { stdio: "ignore" }).unref();
    }
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, opts: WebOptions): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "GET" && path === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(APP_HTML);
    return;
  }

  // Static front-end ES modules (src/web/ui/*.js), served as native modules — no
  // bundler, no build step. basename() pins it to that one dir (no path traversal).
  if (method === "GET" && path.startsWith("/ui/") && path.endsWith(".js")) {
    const f = join(HERE, "ui", basename(path));
    if (!existsSync(f)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
    res.end(readFileSync(f, "utf8"));
    return;
  }

  if (method === "GET" && path === "/api/context") {
    return json(res, 200, { cwd: opts.cwd, initialFlow: opts.initialFlow ?? null });
  }

  // List the .yaml flows in a folder (so the UI can show "empty" vs existing).
  if (method === "GET" && path === "/api/list") {
    const dir = resolve(url.searchParams.get("dir") || opts.cwd);
    const flows = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => /\.ya?ml$/.test(f) && !f.startsWith("._"))
          .sort()
      : [];
    return json(res, 200, { dir, flows });
  }

  if (method === "GET" && path === "/api/read") {
    const file = resolve(url.searchParams.get("path") || "");
    return json(res, 200, { yaml: readFileSync(file, "utf8") });
  }

  // Parse a flow into a node list (for the visual node editor).
  if (method === "GET" && path === "/api/parse") {
    const file = resolve(url.searchParams.get("path") || "");
    const flow = parseFlow(readFileSync(file, "utf8"));
    const nodes = Object.values(flow.steps).map((n) => ({
      id: n.id,
      type: n.type,
      from: upstreamsOf(n),
      prompt: n.prompt ?? null,
      run: n.run ?? null,
      profile: n.profile ?? null,
      // node-type config the editor needs to draw shapes + type-specific editors
      field: n.field ?? null, // splitOut / aggregate
      mode: n.mode ?? null, // merge strategy / cmd cardinality
      key: n.key ?? null, // merge byKey
      inputs: n.inputs ?? null, // cmd declared input files
      params: n.params ?? null, // input: declared params (the form fields the editor draws)
      path: n.path ?? null, // write: output file path
      schema: n.schema ?? null, // ai: structured-output schema (C4)
    }));
    return json(res, 200, { nodes });
  }

  // Per-node validation errors for the canvas to surface (dim/⚠ the bad nodes).
  // Same `validate` the CLI and save/run gate on — so the editor flags exactly
  // what a run would reject (e.g. a prompt $('x') whose `x` isn't in from:).
  if (method === "GET" && path === "/api/validate") {
    const file = resolve(url.searchParams.get("path") || "");
    try {
      return json(res, 200, { errors: validate(parseFlow(readFileSync(file, "utf8"))) });
    } catch (e) {
      return json(res, 200, { errors: [{ node: "(parse)", message: msg(e) }] });
    }
  }

  // Render a node's prompt with its inputs substituted (the 代入後 preview).
  // Uses the upstream nodes' last cached outputs. `template` overrides the saved
  // prompt so the preview updates live as you type.
  if (method === "POST" && path === "/api/render") {
    const { path: file = "", node = "", template } = await body(req);
    const fp = resolve(file);
    const flow = parseFlow(readFileSync(fp, "utf8"));
    const n = flow.steps[node];
    if (!n) return json(res, 404, { error: "no such node" });
    const ups = upstreamsOf(n).filter((u) => flow.steps[u]);
    const outDir = join(dirname(fp), ".chain", "outputs");
    const items: Record<string, Item[]> = {};
    let haveAll = ups.length > 0;
    for (const u of ups) {
      const f = join(outDir, `${u}.out`);
      if (existsSync(f)) items[u] = JSON.parse(readFileSync(f, "utf8")) as Item[];
      else haveAll = false;
    }
    const tmpl = typeof template === "string" ? template : (n.prompt ?? "");
    const rendered = renderPrompt(tmpl, { items, primary: ups[0], index: 0 }); // preview = first item
    return json(res, 200, { rendered, haveInputs: haveAll, noUpstream: ups.length === 0 });
  }

  // Edit ONE field of ONE node (e.g. its prompt), preserving comments/formatting.
  if (method === "POST" && path === "/api/set") {
    const { path: file = "", node = "", field = "", value = "" } = await body(req);
    return editFlow(res, resolve(file), (doc) => doc.setIn(["steps", node, field], value));
  }

  // Per-item data for a node's panel: each upstream's cached items (inputs) and
  // the node's own cached output items. Reads .chain/outputs/<id>.out (present
  // only after a run). The items-model surface (×N + per-item panel) is built here.
  if (method === "GET" && path === "/api/items") {
    const file = resolve(url.searchParams.get("path") || "");
    const nodeId = url.searchParams.get("node") || "";
    const flow = parseFlow(readFileSync(file, "utf8"));
    const n = flow.steps[nodeId];
    if (!n) return json(res, 404, { error: "no such node" });
    const outDir = join(dirname(file), ".chain", "outputs");
    const readItems = (id: string): Item[] | null => {
      const f = join(outDir, `${id}.out`);
      return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Item[]) : null;
    };
    const inputs: Record<string, Item[] | null> = {};
    for (const u of upstreamsOf(n).filter((up) => flow.steps[up])) inputs[u] = readItems(u);
    return json(res, 200, { inputs, output: readItems(nodeId) });
  }

  // Add a new node of a given type, using the engine's nodeStarter (single source
  // of truth for each type's minimal fields). Validates the id first; the node is
  // intentionally unwired (so a merge/splitOut is "needs input" until you connect
  // it) — we only require the YAML still parses, not full validation.
  if (method === "POST" && path === "/api/add-node") {
    const { path: file = "", id = "", type = "ai" } = await body(req);
    const idErr = nodeIdError(String(id));
    if (idErr) return json(res, 400, { errors: [{ node: String(id), message: idErr }] });
    const fp = resolve(file);
    return withFlow(fp, () => {
      const doc = parseDocument(readFileSync(fp, "utf8"));
      if (doc.hasIn(["steps", id])) {
        return json(res, 400, { errors: [{ node: String(id), message: `node "${id}" already exists` }] });
      }
      doc.setIn(["steps", id], nodeStarter(type as NodeType));
      try {
        parseFlow(String(doc)); // structural check only — unwired node is expected
      } catch (e) {
        return json(res, 400, { errors: [{ node: "(parse)", message: msg(e) }] });
      }
      atomicWrite(fp, String(doc));
      return json(res, 200, { ok: true, id });
    });
  }

  // Change a node's TYPE: reset its fields to the new type's starter (single
  // source of truth: nodeStarter), preserving its wiring — except `input`, which
  // is a trigger and must not have a `from`. 壞不落地: validate before writing.
  if (method === "POST" && path === "/api/set-type") {
    const { path: file = "", node = "", type = "ai" } = await body(req);
    const fp = resolve(file);
    return withFlow(fp, () => {
      const original = readFileSync(fp, "utf8");
      const flow = parseFlow(original);
      const n = flow.steps[node];
      if (!n) return json(res, 404, { error: "no such node" });
      const starter = nodeStarter(type as NodeType) as Record<string, unknown>;
      if (type !== "input" && n.from && n.from.length) {
        starter.from = n.from.length === 1 ? n.from[0] : n.from;
      }
      const doc = parseDocument(original);
      doc.setIn(["steps", node], starter);
      const introduced = introducedErrors(original, String(doc));
      if (introduced === "parse") {
        return json(res, 400, { errors: [{ node, message: "type change would break the YAML" }] });
      }
      if (introduced.length) return json(res, 400, { errors: introduced });
      atomicWrite(fp, String(doc));
      return json(res, 200, { ok: true, type });
    });
  }

  // Rename a node id: its own key + every downstream from: + every prompt $('id')
  // reference (engine renameNode), then move its cached output so the rename keeps
  // the cache (the Merkle key has no id in it). 壞不落地: validate before writing.
  if (method === "POST" && path === "/api/rename") {
    const { path: file = "", node = "", to = "" } = await body(req);
    const idErr = nodeIdError(String(to));
    if (idErr) return json(res, 400, { errors: [{ node: String(to), message: idErr }] });
    const fp = resolve(file);
    return withFlow(fp, () => {
      const original = readFileSync(fp, "utf8");
      const doc = parseDocument(original);
      try {
        renameNode(doc, String(node), String(to)); // throws on dup / missing
      } catch (e) {
        return json(res, 400, { errors: [{ node: String(node), message: msg(e) }] });
      }
      const introduced = introducedErrors(original, String(doc));
      if (introduced === "parse") {
        return json(res, 400, { errors: [{ node: String(node), message: "rename would break the YAML" }] });
      }
      if (introduced.length) return json(res, 400, { errors: introduced });
      atomicWrite(fp, String(doc));
      try {
        new CacheStore(join(dirname(fp), ".chain")).rename(String(node), String(to));
      } catch {
        /* best-effort: a missing cache just recomputes next run */
      }
      return json(res, 200, { ok: true, id: to });
    });
  }

  // Create a new flow file from the starter template.
  if (method === "POST" && path === "/api/create") {
    const { dir = "", name = "" } = await body(req);
    const file = /\.ya?ml$/.test(name) ? name : `${name}.yaml`;
    const target = resolve(dir);
    mkdirSync(target, { recursive: true });
    const flowPath = join(target, file);
    if (existsSync(flowPath)) return json(res, 409, { error: `${flowPath} already exists` });
    writeFileSync(flowPath, NEW_FLOW_TEMPLATE);
    return json(res, 200, { path: flowPath });
  }

  // Save edits — VALIDATE first, never write a broken flow (壞不落地).
  if (method === "POST" && path === "/api/save") {
    const { path: file = "", yaml = "" } = await body(req);
    const fp = resolve(file);
    return withFlow(fp, () => {
      try {
        const errors = validate(parseFlow(yaml));
        if (errors.length) return json(res, 400, { errors });
      } catch (e) {
        return json(res, 400, { errors: [{ node: "(parse)", message: msg(e) }] });
      }
      atomicWrite(fp, yaml);
      return json(res, 200, { ok: true });
    });
  }

  // Canvas node positions — a sidecar in .chain/layout/<flow>.json, NEVER in the
  // flow YAML (types.ts). Keyed per flow file so flows in one folder don't collide.
  // Best-effort + self-healing: a missing/unreadable file just means auto-layout.
  if (method === "GET" && path === "/api/layout") {
    return json(res, 200, { layout: readLayout(resolve(url.searchParams.get("path") || "")) });
  }
  if (method === "POST" && path === "/api/layout") {
    const { path: file = "", layout = {} } = (await body(req)) as {
      path?: string;
      layout?: Record<string, { x: number; y: number }>;
    };
    const fp = resolve(String(file));
    return withFlow(fp, () => {
      writeLayout(fp, layout ?? {});
      return json(res, 200, { ok: true });
    });
  }

  // Run the flow, STREAMING each node's result as it settles (NDJSON) so the UI
  // lights up one node at a time, in execution order — not all at once.
  if (method === "POST" && path === "/api/run") {
    const b = (await body(req)) as RunBody;
    return streamRun(res, resolve(b.path ?? ""), b.profile ?? "", Boolean(b.fresh), (runner) => runner.runChain(), b.input);
  }

  // Run UP TO one node (its upstream cone) — streamed, same as /api/run.
  if (method === "POST" && path === "/api/run-node") {
    const b = (await body(req)) as RunBody;
    return streamRun(res, resolve(b.path ?? ""), b.profile ?? "", Boolean(b.fresh), (runner) => runner.runToNode(b.node ?? ""), b.input);
  }

  // Rewire a node's `from` (which upstream steps feed it; first = $json).
  // Comma-separated list. Legacy form; drag-to-connect uses /api/connect (JSON
  // array, id-safe, order-preserving).
  if (method === "POST" && path === "/api/set-from") {
    const { path: file = "", node = "", from = "" } = await body(req);
    const list = String(from).split(",").map((s) => s.trim()).filter(Boolean);
    return editFlow(res, resolve(file), (doc) => setFrom(doc, node, list));
  }

  // Drag-to-connect: set `from` from a JSON array. Order is significant (first =
  // $json primary) so it is preserved as-is; ids with odd chars survive (unlike
  // the comma-string form). [] clears the wiring.
  if (method === "POST" && path === "/api/connect") {
    const { path: file = "", node = "", from = [] } = (await body(req)) as {
      path?: string;
      node?: string;
      from?: string[];
    };
    const list = Array.isArray(from) ? from.filter((x) => typeof x === "string" && x) : [];
    return editFlow(res, resolve(String(file)), (doc) => setFrom(doc, String(node), list));
  }

  // Delete a node (comment-preserving). Rejected if a downstream still needs it.
  if (method === "POST" && path === "/api/delete-node") {
    const { path: file = "", node = "" } = await body(req);
    return editFlow(
      res,
      resolve(file),
      (doc) => doc.deleteIn(["steps", node]),
      () => [{ node, message: "another step still depends on this — rewire it first" }],
    );
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

// ---- helpers ----

function json(res: ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function body(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

// The /api/run* payload — `input` is an array of objects, so it can't ride the
// string-valued `body()` return type; the run handlers cast to this.
type RunBody = {
  path?: string;
  node?: string;
  profile?: string;
  fresh?: unknown;
  input?: Record<string, unknown>[];
};

// Run a flow, streaming each node's result as one NDJSON line as it settles.
// Validation errors come back as a normal JSON 400 (before the stream starts).
// `input` carries the input-node params form values (like CLI --input): coerced
// here (server is the authority), then folded into the Merkle cache key by the
// Runner. An all-empty input becomes undefined (coerceInput) so it shares the
// no-input cache key instead of computing a fresh one.
async function streamRun(
  res: ServerResponse,
  fp: string,
  profile: string,
  fresh: boolean,
  run: (runner: Runner) => Promise<unknown>,
  input?: Record<string, unknown>[],
): Promise<void> {
  const flow = parseFlow(readFileSync(fp, "utf8"));
  if (profile && !flow.profiles[profile]) {
    return json(res, 400, { errors: [{ node: "(profile)", message: `no profile "${profile}"` }] });
  }
  const errors = validate(flow);
  if (errors.length) return json(res, 400, { errors });
  // runtime input contract (required / declared type) — same gate the CLI uses,
  // so the web and `chain run` reject the same input with the same message.
  const inputErrors = validateRunInput(flow, input);
  if (inputErrors.length) return json(res, 400, { errors: inputErrors });

  const baseDir = dirname(fp);
  // cross-process single-writer: don't run if a `chain run` (or another `chain ui`)
  // is already running this flow — they'd race on .chain/state.json. 409 before
  // the stream starts; released in the finally below.
  const lock = new FlowLock(join(baseDir, ".chain"));
  try {
    lock.acquire();
  } catch (e) {
    return json(res, 409, { errors: [{ node: "(lock)", message: msg(e) }] });
  }
  res.writeHead(200, { "content-type": "application/x-ndjson" });
  const runner = new Runner(flow, {
    chainDir: join(baseDir, ".chain"),
    baseDir,
    profileOverride: profile || undefined,
    fresh,
    input: coerceInput(flow, input),
    // real `claude -p` calls can run long (reasoning, big inputs). Give the web
    // UI a generous 5-min ceiling so a genuine model call isn't killed as a
    // false "timed out" — the CLI default (120s) is too tight for the UI.
    timeoutMs: 300_000,
    onResult: (r) =>
      res.write(
        JSON.stringify({
          id: r.id,
          status: r.status,
          output: itemsText(r.output), // flatten items → text for the UI
          items: r.output.length, // item count (items model)
          error: r.error ?? null,
        }) + "\n",
      ),
  });
  try {
    await run(runner);
  } catch (e) {
    res.write(JSON.stringify({ error: msg(e) }) + "\n");
  } finally {
    lock.release();
  }
  res.end();
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

type FlowError = { node: string; message: string };

// In-process single-writer per flow. Two browser tabs hit the SAME server
// process, so the real race is two async handlers interleaving read→modify→write
// on one file (last-wins lost update). A promise chain per resolved path
// serializes them. (Cross-process `chain run` is a separate concern — the engine
// FlowLock exists for that but is not yet wired into either caller.)
const flowChains = new Map<string, Promise<unknown>>();
function withFlow<T>(fp: string, fn: () => Promise<T> | T): Promise<T> {
  const prev = flowChains.get(fp) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  flowChains.set(
    fp,
    next.catch(() => {}),
  );
  return next as Promise<T>;
}

// Errors a mutation INTRODUCES (relative to the flow as it was). A live editor is
// often legitimately mid-construction — a just-added merge node has no inputs yet
// — so we must NOT block an unrelated edit just because the flow is incomplete.
// We block only on NEW breakage (a dangling ref the edit created, a cycle, or
// unparseable YAML). Pre-existing incompleteness is the editor's job to surface,
// not the save's job to forbid. Returns "parse" if the mutation broke the YAML.
function introducedErrors(originalYaml: string, mutatedYaml: string): FlowError[] | "parse" {
  let before: FlowError[] = [];
  try {
    before = validate(parseFlow(originalYaml));
  } catch {
    before = []; // already unparseable → any parseable result is an improvement
  }
  let after: FlowError[];
  try {
    after = validate(parseFlow(mutatedYaml));
  } catch {
    return "parse";
  }
  const seen = new Set(before.map((e) => `${e.node} ${e.message}`));
  return after.filter((e) => !seen.has(`${e.node} ${e.message}`));
}

// Load → mutate the yaml Document (comment-preserving) → reject only NEW errors →
// atomicWrite, serialized per flow (壞不落地 for corruption, permissive for
// work-in-progress). `onInvalid` lets a caller (e.g. delete) reword the errors.
function editFlow(
  res: ServerResponse,
  fp: string,
  mutate: (doc: Document) => void,
  onInvalid?: (errors: FlowError[]) => FlowError[],
): Promise<void> {
  return withFlow(fp, () => {
    const original = readFileSync(fp, "utf8");
    const doc = parseDocument(original);
    mutate(doc);
    const introduced = introducedErrors(original, String(doc));
    if (introduced === "parse") {
      return json(res, 400, { errors: [{ node: "(parse)", message: "edit would break the YAML" }] });
    }
    if (introduced.length) return json(res, 400, { errors: onInvalid ? onInvalid(introduced) : introduced });
    atomicWrite(fp, String(doc));
    return json(res, 200, { ok: true });
  });
}

// Write a node's `from`: absent → delete, one → scalar, many → list (preserving
// order — first is the $json primary). Shared by /api/set-from and /api/connect.
function setFrom(doc: Document, node: string, list: string[]): void {
  if (list.length === 0) doc.deleteIn(["steps", node, "from"]);
  else if (list.length === 1) doc.setIn(["steps", node, "from"], list[0]);
  else doc.setIn(["steps", node, "from"], list);
}

type Layout = Record<string, { x: number; y: number }>;
const layoutPath = (fp: string): string => join(dirname(fp), ".chain", "layout", `${basename(fp)}.json`);
function readLayout(fp: string): Layout {
  try {
    return JSON.parse(readFileSync(layoutPath(fp), "utf8")) as Layout;
  } catch {
    return {}; // missing / corrupt → auto-layout (self-healing)
  }
}
function writeLayout(fp: string, layout: Layout): void {
  const lp = layoutPath(fp);
  mkdirSync(dirname(lp), { recursive: true });
  atomicWrite(lp, JSON.stringify(layout, null, 2));
}
