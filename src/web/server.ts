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
import { parseFlow, validate, Runner } from "../engine/index.js";
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

  // Run the flow and return per-node status.
  if (method === "POST" && path === "/api/run") {
    const { path: file = "", profile = "" } = await body(req);
    const fp = resolve(file);
    const flow = parseFlow(readFileSync(fp, "utf8"));
    if (profile && !flow.profiles[profile]) {
      return json(res, 400, { errors: [{ node: "(profile)", message: `no profile "${profile}"` }] });
    }
    const errors = validate(flow);
    if (errors.length) return json(res, 400, { errors });
    const baseDir = dirname(fp);
    const results = await new Runner(flow, {
      chainDir: join(baseDir, ".chain"),
      baseDir,
      profileOverride: profile || undefined,
    }).runChain();
    return json(res, 200, {
      results: results.map((r) => ({
        id: r.id,
        status: r.status,
        output: r.output,
        error: r.error ?? null,
      })),
    });
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

function atomicWrite(file: string, data: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, file);
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
