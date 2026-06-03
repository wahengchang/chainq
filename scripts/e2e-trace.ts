// Runs the REAL engine through the E2E iteration-loop scenarios and writes a
// self-contained HTML visualizer (e2e-viz.html) you can open in a browser.
// Each step replays the actual per-node result (ran / cached / failed / skipped)
// on the node graph — so you watch the cache and fast-fail behaviour, live.
//
//   npm run viz   →   open e2e-viz.html

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Runner } from "../src/engine/index.js";
import type { Flow, NodeResult } from "../src/engine/index.js";

interface VizNode { id: string; type: string; status: string; output: string }
interface VizStep { title: string; desc: string; cmd: string; nodes: VizNode[] }

const cat = { default: { cmd: "cat" } };

function flow(summaryPrefix: string, titleText: string, loadFails = false): Flow {
  return {
    profiles: cat,
    steps: {
      load: loadFails
        ? { id: "load", type: "cmd", run: "false" }
        : { id: "load", type: "cmd", run: "cat input.txt", inputs: ["input.txt"] },
      summarize: { id: "summarize", type: "ai", from: "load", prompt: `${summaryPrefix}: {{ $json }}` },
      title: { id: "title", type: "ai", from: "summarize", prompt: titleText },
    },
  };
}

const ORDER = ["load", "summarize", "title"];

function toNodes(f: Flow, results: NodeResult[]): VizNode[] {
  const byId = new Map(results.map((r) => [r.id, r]));
  return ORDER.map((id) => {
    const r = byId.get(id);
    return {
      id,
      type: f.steps[id]!.type,
      status: r?.status ?? "pending",
      output: (r?.output ?? r?.error ?? "").slice(0, 140),
    };
  });
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "chain-viz-"));
  writeFileSync(join(dir, "input.txt"), "the quick brown fox jumps over the lazy dog");

  const steps: VizStep[] = [];
  const add = async (title: string, desc: string, cmd: string, run: () => Promise<{ f: Flow; r: NodeResult[] }>) => {
    const { f, r } = await run();
    steps.push({ title, desc, cmd, nodes: toNodes(f, r) });
  };

  await add("1 · Cold run", "Nothing cached yet — every node runs. Data flows downstream.", "chain run flow.yaml", async () => {
    const f = flow("SUMMARY", "TITLE v1");
    return { f, r: await new Runner(f, { chainDir: join(dir, ".chain"), baseDir: dir }).runChain() };
  });

  await add("2 · Warm run", "Identical flow → everything served from cache. ZERO model calls.", "chain run flow.yaml", async () => {
    const f = flow("SUMMARY", "TITLE v1");
    return { f, r: await new Runner(f, { chainDir: join(dir, ".chain"), baseDir: dir }).runChain() };
  });

  await add("3 · Edit a downstream prompt", "Changed title's prompt → only title re-runs. Upstream reused.", "chain run flow.yaml", async () => {
    const f = flow("SUMMARY", "TITLE v2");
    return { f, r: await new Runner(f, { chainDir: join(dir, ".chain"), baseDir: dir }).runChain() };
  });

  await add("4 · Edit an upstream prompt", "Changed summarize → summarize AND title re-run. No stale serve (Merkle).", "chain run flow.yaml", async () => {
    const f = flow("DIGEST", "TITLE v2");
    return { f, r: await new Runner(f, { chainDir: join(dir, ".chain"), baseDir: dir }).runChain() };
  });

  await add("5 · Pin a sample (trial)", "Pin summarize to a fixed value, trial-run into scratch. Real outputs untouched.", "chain run flow.yaml --pin summarize=sample.txt", async () => {
    const f = flow("DIGEST", "TITLE v2");
    const r = await new Runner(f, { chainDir: join(dir, ".chain"), baseDir: dir, scratch: true, pins: { summarize: "PINNED SAMPLE" } }).runToNode("title");
    return { f, r };
  });

  await add("6 · Upstream fails", "load fails (exit 1) → downstream is skipped, not crashed. Fast-fail (E2).", "chain run broken.yaml", async () => {
    const f = flow("SUMMARY", "TITLE v1", true);
    return { f, r: await new Runner(f, { chainDir: mkdtempSync(join(tmpdir(), "chain-viz-fail-")) }).runChain() };
  });

  const here = dirname(fileURLToPath(import.meta.url));
  const html = TEMPLATE.replace("__TRACE__", JSON.stringify(steps));
  const out = join(here, "..", "e2e-viz.html");
  writeFileSync(out, html);
  console.log(`wrote ${out}`);
}

const TEMPLATE = String.raw`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>chain — E2E visualizer</title>
<style>
  :root{--bg:#0e0f11;--panel:#15171a;--line:#2a2d31;--ink:#d7dadd;--dim:#7f868d;
    --ran:#5db07e;--cached:#6b7177;--failed:#e0635b;--skipped:#7f868d;--accent:#e0a64d;
    --mono:"Berkeley Mono","JetBrains Mono",ui-monospace,Menlo,monospace;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--mono);font-size:13px;line-height:1.5}
  header{padding:12px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:14px}
  header b{font-weight:normal} header .sub{color:var(--dim);font-size:11px}
  .wrap{display:grid;grid-template-columns:280px 1fr;height:calc(100vh - 49px)}
  .steps{border-right:1px solid var(--line);overflow:auto;padding:8px 0}
  .step{padding:8px 16px;cursor:pointer;border-left:2px solid transparent}
  .step:hover{background:#1b1e22} .step.on{background:#1b1e22;border-left-color:var(--accent)}
  .step .t{color:var(--ink)} .step .d{color:var(--dim);font-size:11px}
  .stage{padding:24px;overflow:auto}
  .cmd{color:var(--accent);background:rgba(224,166,77,.1);display:inline-block;padding:3px 10px;border:1px solid var(--line);border-radius:3px;margin-bottom:6px}
  .desc{color:var(--dim);margin:6px 0 22px}
  .graph{display:flex;align-items:flex-start;gap:0}
  .node{width:230px;background:var(--panel);border:1px solid var(--line);border-radius:4px;padding:12px;transition:all .25s}
  .arrow{align-self:center;color:var(--dim);padding:0 10px;font-size:18px}
  .nh{display:flex;align-items:center;gap:8px;margin-bottom:6px}
  .glyph{font-size:15px} .nn{flex:1} .nt{color:var(--dim);font-size:10px}
  .stat{font-size:11px;text-transform:uppercase;letter-spacing:.06em}
  .out{margin-top:8px;color:var(--dim);font-size:11px;white-space:pre-wrap;word-break:break-word;border-top:1px dashed var(--line);padding-top:8px;min-height:34px}
  .ran{border-color:var(--ran)} .ran .glyph,.ran .stat{color:var(--ran)}
  .cached .glyph,.cached .stat{color:var(--cached)}
  .failed{border-color:var(--failed)} .failed .glyph,.failed .stat{color:var(--failed)}
  .skipped{opacity:.55} .skipped .glyph,.skipped .stat{color:var(--skipped)}
  .nav{margin-top:26px;display:flex;gap:10px;align-items:center}
  button{background:transparent;border:1px solid var(--line);color:var(--ink);font:inherit;padding:5px 14px;cursor:pointer;border-radius:3px}
  button:hover{border-color:var(--accent)} .count{color:var(--dim)}
  .legend{margin-top:20px;color:var(--dim);font-size:11px;display:flex;gap:16px}
  .legend b{font-weight:normal}
</style></head>
<body>
<header><b>chain</b><span class="sub">E2E visualizer — real engine results, replayed step by step (offline · cat fake model)</span></header>
<div class="wrap">
  <div class="steps" id="steps"></div>
  <div class="stage">
    <div class="cmd" id="cmd"></div>
    <div class="desc" id="desc"></div>
    <div class="graph" id="graph"></div>
    <div class="nav">
      <button onclick="go(-1)">‹ prev</button>
      <button onclick="go(1)">next ›</button>
      <span class="count" id="count"></span>
      <span class="count">— use ← → keys</span>
    </div>
    <div class="legend">
      <b><span style="color:var(--ran)">✓ ran</span> model called</b>
      <b><span style="color:var(--cached)">⊘ cached</span> reused, no call</b>
      <b><span style="color:var(--failed)">✗ failed</span></b>
      <b><span style="color:var(--skipped)">– skipped</span> upstream failed</b>
    </div>
  </div>
</div>
<script>
const TRACE = __TRACE__;
const GLYPH = { ran:"✓", cached:"⊘", failed:"✗", skipped:"–", pending:"○" };
let cur = 0;
function render(){
  const s = TRACE[cur];
  document.getElementById("cmd").textContent = "$ " + s.cmd;
  document.getElementById("desc").textContent = s.desc;
  document.getElementById("count").textContent = (cur+1) + " / " + TRACE.length;
  const g = document.getElementById("graph"); g.innerHTML = "";
  s.nodes.forEach((n, i) => {
    if (i>0){ const a=document.createElement("div"); a.className="arrow"; a.textContent="→"; g.appendChild(a); }
    const d = document.createElement("div"); d.className = "node " + n.status;
    d.innerHTML = '<div class="nh"><span class="glyph">'+GLYPH[n.status]+'</span>'
      + '<span class="nn">'+n.id+'</span><span class="nt">'+n.type+'</span></div>'
      + '<div class="stat">'+n.status+'</div>'
      + '<div class="out">'+(n.output? escapeHtml(n.output):'—')+'</div>';
    g.appendChild(d);
  });
  document.querySelectorAll(".step").forEach((el,i)=>el.classList.toggle("on", i===cur));
}
function go(d){ cur = Math.max(0, Math.min(TRACE.length-1, cur+d)); render(); }
function escapeHtml(s){ return s.replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
const list = document.getElementById("steps");
TRACE.forEach((s,i)=>{ const el=document.createElement("div"); el.className="step";
  el.innerHTML='<div class="t">'+s.title+'</div><div class="d">'+s.desc+'</div>';
  el.onclick=()=>{cur=i;render();}; list.appendChild(el); });
window.addEventListener("keydown", e=>{ if(e.key==="ArrowRight")go(1); if(e.key==="ArrowLeft")go(-1); });
render();
</script>
</body></html>`;

main();
