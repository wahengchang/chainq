// Integration test for the web UI server: create a flow, run it, reject a bad
// save — over real HTTP against a real temp project.

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { buildServer } from "./server.js";

function listen(dir: string): Promise<{ base: string; close: () => void }> {
  const server = buildServer({ cwd: dir });
  return new Promise((res) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      res({ base: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}
const post = (base: string, path: string, b: unknown) =>
  fetch(base + path, { method: "POST", body: JSON.stringify(b) });
const getJson = (base: string, path: string) => fetch(base + path).then((r) => r.json() as Promise<any>);

describe("web server", () => {
  it("lists empty, creates a flow, edits a node, rejects an invalid save", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chain-web-"));
    const { base, close } = await listen(dir);
    try {
      // empty project
      const list: any = await fetch(`${base}/api/list?dir=${encodeURIComponent(dir)}`).then((r) => r.json());
      expect(list.flows).toEqual([]);

      // create a flow
      const created: any = await post(base, "/api/create", { dir, name: "blog" }).then((r) => r.json());
      expect(created.path).toContain("blog.yaml");
      expect(existsSync(join(dir, "blog.yaml"))).toBe(true);

      // NOTE: actually running the flow needs the real model (no fake profile);
      // that path is covered by the browser E2E. Here we stay offline.

      // a broken save is rejected with errors (壞不落地)
      const bad = await post(base, "/api/save", {
        path: join(dir, "blog.yaml"),
        yaml: "steps:\n  a: { type: ai, from: ghost }",
      });
      expect(bad.status).toBe(400);
      expect(((await bad.json()) as any).errors.length).toBeGreaterThan(0);

      // creating the same flow again conflicts
      const dup = await post(base, "/api/create", { dir, name: "blog" });
      expect(dup.status).toBe(409);

      // parse → node list for the visual editor
      const parsed: any = await fetch(
        `${base}/api/parse?path=${encodeURIComponent(join(dir, "blog.yaml"))}`,
      ).then((r) => r.json());
      expect(parsed.nodes.map((n: { id: string }) => n.id)).toEqual(["draft", "refine"]);

      // edit one node's prompt (comment-preserving) and confirm it took
      const set = await post(base, "/api/set", {
        path: join(dir, "blog.yaml"),
        node: "draft",
        field: "prompt",
        value: "Write a haiku.",
      });
      expect(set.status).toBe(200);
      const re: any = await fetch(
        `${base}/api/parse?path=${encodeURIComponent(join(dir, "blog.yaml"))}`,
      ).then((r) => r.json());
      expect(re.nodes.find((n: { id: string }) => n.id === "draft").prompt).toBe("Write a haiku.");
    } finally {
      close();
    }
  });

  it("add-node / connect / rename / layout / items — the editor's structural edits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chain-web2-"));
    const { base, close } = await listen(dir);
    const flow = join(dir, "edit.yaml");
    const enc = encodeURIComponent(flow);
    const nodesById = async () => {
      const p = await getJson(base, `/api/parse?path=${enc}`);
      return Object.fromEntries(p.nodes.map((n: any) => [n.id, n]));
    };
    try {
      await post(base, "/api/create", { dir, name: "edit" });

      // add a merge node from the nodeStarter single source → mode: append
      const add = await post(base, "/api/add-node", { path: flow, id: "m", type: "merge" });
      expect(add.status).toBe(200);
      expect((await nodesById()).m).toMatchObject({ type: "merge", mode: "append" });

      // an illegal id and a duplicate are both rejected
      expect((await post(base, "/api/add-node", { path: flow, id: "a/b", type: "ai" })).status).toBe(400);
      expect((await post(base, "/api/add-node", { path: flow, id: "m", type: "ai" })).status).toBe(400);

      // drag-to-connect: wire m from [draft, refine] (order preserved = $json first)
      const conn = await post(base, "/api/connect", { path: flow, node: "m", from: ["draft", "refine"] });
      expect(conn.status).toBe(200);
      expect((await nodesById()).m.from).toEqual(["draft", "refine"]);

      // rename draft → intro: key + downstream from: (refine AND m) all follow
      const rn = await post(base, "/api/rename", { path: flow, node: "draft", to: "intro" });
      expect(rn.status).toBe(200);
      const after = await nodesById();
      expect(after.intro).toBeTruthy();
      expect(after.draft).toBeUndefined();
      expect(after.refine.from).toEqual(["intro"]);
      expect(after.m.from).toEqual(["intro", "refine"]);

      // rename to an existing id, and to an illegal id, are both rejected
      expect((await post(base, "/api/rename", { path: flow, node: "intro", to: "refine" })).status).toBe(400);
      expect((await post(base, "/api/rename", { path: flow, node: "intro", to: "x y" })).status).toBe(400);

      // layout sidecar round-trips, keyed per flow, never in the YAML
      await post(base, "/api/layout", { path: flow, layout: { intro: { x: 10, y: 20 } } });
      expect((await getJson(base, `/api/layout?path=${enc}`)).layout).toEqual({ intro: { x: 10, y: 20 } });

      // items: present-but-null before any run (nothing cached yet)
      const items = await getJson(base, `/api/items?path=${enc}&node=refine`);
      expect(items.output).toBeNull();
      expect(items.inputs).toHaveProperty("intro");
    } finally {
      close();
    }
  });

  // The Lane A fix: /api/parse exposes an input node's params, and /api/run-node
  // threads the form's runtime values through to the Runner — so the output
  // reflects what was supplied (no more "✓ ran 卻跑空"). Offline: input→assemble
  // is pure data assembly, no `claude` needed.
  it("exposes input params and runs an input node with supplied values (offline)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chain-web-input-"));
    const { base, close } = await listen(dir);
    const flow = join(dir, "seed.yaml");
    writeFileSync(
      flow,
      [
        "profiles:",
        "  default: { cmd: 'claude -p' }",
        "steps:",
        "  seed:",
        "    type: input",
        "    params:",
        "      topic: { default: fallback }",
        "  out:",
        "    type: assemble",
        "    from: seed",
        "    prompt: '{{ $json.topic }}'",
        "",
      ].join("\n"),
    );
    const enc = encodeURIComponent(flow);
    const runNode = async (input?: unknown) =>
      (await (await post(base, "/api/run-node", { path: flow, node: "out", input })).text())
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as any)
        .find((r) => r.id === "out");
    try {
      // parse exposes params so the editor can draw the form
      const parsed = await getJson(base, `/api/parse?path=${enc}`);
      expect(parsed.nodes.find((n: any) => n.id === "seed").params).toEqual({
        topic: { default: "fallback" },
      });

      // supplied value flows through → output reflects it (the bug fix)
      expect((await runNode([{ topic: "hello-from-input" }])).output).toContain("hello-from-input");

      // no input supplied → falls back to the declared default (optional params)
      expect((await runNode(undefined)).output).toContain("fallback");
    } finally {
      close();
    }
  });

  // Increment 2: the type/required contract is enforced over the API, with the
  // same errors the CLI gives (validateRunInput is shared). Still offline.
  it("enforces the input param contract (required + declared type)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chain-web-contract-"));
    const { base, close } = await listen(dir);
    const flow = join(dir, "seed.yaml");
    writeFileSync(
      flow,
      [
        "profiles:",
        "  default: { cmd: 'claude -p' }",
        "steps:",
        "  seed:",
        "    type: input",
        "    params:",
        "      name: { type: string, required: true }",
        "      count: { type: number, default: 2 }",
        "  out:",
        "    type: assemble",
        "    from: seed",
        "    prompt: '{{ $json.name }}-{{ $json.count }}'",
        "",
      ].join("\n"),
    );
    const run = (input?: unknown) => post(base, "/api/run-node", { path: flow, node: "out", input });
    const okOut = async (r: Response) =>
      (await r.text()).trim().split("\n").map((l) => JSON.parse(l) as any).find((x) => x.id === "out");
    try {
      // required `name` missing → 400, no run, message names the param
      const missing = await run(undefined);
      expect(missing.status).toBe(400);
      const me = ((await missing.json()) as any).errors;
      expect(me[0].message).toContain('input "name"');
      expect(me[0].message).toContain("required");

      // wrong type for `count` → 400
      const badType = await run([{ name: "ada", count: "lots" }]);
      expect(badType.status).toBe(400);
      expect(((await badType.json()) as any).errors[0].message).toContain("number");

      // valid: required supplied, count falls back to its default 2
      expect((await okOut(await run([{ name: "ada" }]))).output).toContain("ada-2");
      // valid: typed count coerces ("9" → 9)
      expect((await okOut(await run([{ name: "bob", count: "9" }]))).output).toContain("bob-9");
    } finally {
      close();
    }
  });

  // Epic D: a `write` node writes the upstream's text to a real file when the
  // chain runs. Offline: input → assemble → write needs no model.
  it("write node writes the upstream content to a file (offline)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "chain-web-write-"));
    const { base, close } = await listen(dir);
    const flow = join(dir, "w.yaml");
    writeFileSync(
      flow,
      [
        "profiles:",
        "  default: { cmd: 'claude -p' }",
        "steps:",
        "  seed:",
        "    type: input",
        "    params:",
        "      msg: { default: hello-world }",
        "  body:",
        "    type: assemble",
        "    from: seed",
        "    prompt: '{{ $json.msg }}'",
        "  out:",
        "    type: write",
        "    from: body",
        "    path: result/{{date}}.txt",
        "",
      ].join("\n"),
    );
    try {
      const res = await post(base, "/api/run", { path: flow });
      expect(res.status).toBe(200);
      await res.text(); // drain the NDJSON stream (write happens during the run)

      // {{date}} expanded → find the written file under result/
      const today = new Date().toISOString().slice(0, 10);
      const written = join(dir, "result", `${today}.txt`);
      expect(existsSync(written)).toBe(true);
      expect(readFileSync(written, "utf8")).toContain("hello-world");
    } finally {
      close();
    }
  });
});
