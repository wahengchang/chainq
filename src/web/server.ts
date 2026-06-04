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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { parseDocument } from "yaml";
import { parseFlow, validate, Runner, upstreamsOf, renderPrompt, itemsText, type Item } from "../engine/index.js";
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
    if (process.platform === "darwin") spawn("open", [url], { stdio: "ignore" }).unref();
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
    }));
    return json(res, 200, { nodes });
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
    const fp = resolve(file);
    const doc = parseDocument(readFileSync(fp, "utf8"));
    doc.setIn(["steps", node, field], value);
    try {
      const errors = validate(parseFlow(String(doc)));
      if (errors.length) return json(res, 400, { errors });
    } catch (e) {
      return json(res, 400, { errors: [{ node: "(parse)", message: msg(e) }] });
    }
    atomicWrite(fp, String(doc));
    return json(res, 200, { ok: true });
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
    try {
      const errors = validate(parseFlow(yaml));
      if (errors.length) return json(res, 400, { errors });
    } catch (e) {
      return json(res, 400, { errors: [{ node: "(parse)", message: msg(e) }] });
    }
    atomicWrite(resolve(file), yaml);
    return json(res, 200, { ok: true });
  }

  // Run the flow, STREAMING each node's result as it settles (NDJSON) so the UI
  // lights up one node at a time, in execution order — not all at once.
  if (method === "POST" && path === "/api/run") {
    const { path: file = "", profile = "", fresh } = await body(req);
    return streamRun(res, resolve(file), profile, Boolean(fresh), (runner) => runner.runChain());
  }

  // Run UP TO one node (its upstream cone) — streamed, same as /api/run.
  if (method === "POST" && path === "/api/run-node") {
    const { path: file = "", node = "", profile = "", fresh } = await body(req);
    return streamRun(res, resolve(file), profile, Boolean(fresh), (runner) => runner.runToNode(node));
  }

  // Rewire a node's `from` (which upstream steps feed it; first = $json).
  // Comma-separated list → "" (no from), one string, or a YAML list.
  if (method === "POST" && path === "/api/set-from") {
    const { path: file = "", node = "", from = "" } = await body(req);
    const fp = resolve(file);
    const doc = parseDocument(readFileSync(fp, "utf8"));
    const list = String(from)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) doc.deleteIn(["steps", node, "from"]);
    else if (list.length === 1) doc.setIn(["steps", node, "from"], list[0]);
    else doc.setIn(["steps", node, "from"], list);
    try {
      const errors = validate(parseFlow(String(doc)));
      if (errors.length) return json(res, 400, { errors });
    } catch (e) {
      return json(res, 400, { errors: [{ node: "(parse)", message: msg(e) }] });
    }
    atomicWrite(fp, String(doc));
    return json(res, 200, { ok: true });
  }

  // Delete a node (comment-preserving). Rejected if a downstream still needs it.
  if (method === "POST" && path === "/api/delete-node") {
    const { path: file = "", node = "" } = await body(req);
    const fp = resolve(file);
    const doc = parseDocument(readFileSync(fp, "utf8"));
    doc.deleteIn(["steps", node]);
    try {
      const errors = validate(parseFlow(String(doc)));
      if (errors.length) {
        return json(res, 400, {
          errors: [{ node, message: "another step still depends on this — rewire it first" }],
        });
      }
    } catch (e) {
      return json(res, 400, { errors: [{ node: "(parse)", message: msg(e) }] });
    }
    atomicWrite(fp, String(doc));
    return json(res, 200, { ok: true });
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

// Run a flow, streaming each node's result as one NDJSON line as it settles.
// Validation errors come back as a normal JSON 400 (before the stream starts).
async function streamRun(
  res: ServerResponse,
  fp: string,
  profile: string,
  fresh: boolean,
  run: (runner: Runner) => Promise<unknown>,
): Promise<void> {
  const flow = parseFlow(readFileSync(fp, "utf8"));
  if (profile && !flow.profiles[profile]) {
    return json(res, 400, { errors: [{ node: "(profile)", message: `no profile "${profile}"` }] });
  }
  const errors = validate(flow);
  if (errors.length) return json(res, 400, { errors });

  const baseDir = dirname(fp);
  res.writeHead(200, { "content-type": "application/x-ndjson" });
  const runner = new Runner(flow, {
    chainDir: join(baseDir, ".chain"),
    baseDir,
    profileOverride: profile || undefined,
    fresh,
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
  }
  res.end();
}

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
