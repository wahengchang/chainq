// Integration test for the web UI server: create a flow, run it, reject a bad
// save — over real HTTP against a real temp project.

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync } from "node:fs";
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
});
