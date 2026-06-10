// chain editor — single-page app logic, served as a native ES module (no build,
// no bundler). Extracted from app.html inline <script> so the UI is a real module
// file, not a blob inside HTML. Now type-checked: `npm run typecheck:ui` runs tsc
// with checkJs over this file (src/web/ui/tsconfig.json, DOM lib), wired into
// `npm run typecheck` + CI. Remaining follow-up: split into canvas/panel/api
// modules (a mechanical state-extraction refactor — now safe to do incrementally
// since checkJs catches any missed reference).

// @ts-check
// `$` is typed `any`: this is browser glue and the elements are known by the
// author, not the type system. checkJs (src/web/ui/tsconfig.json) still catches
// the bugs that matter — undefined vars, typos, wrong call signatures.
const $=(id)=>/** @type {any} */(document.getElementById(id));
const api=(u,o)=>fetch(u,o).then(async r=>({ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))}));
const esc=s=>(s==null?"":String(s)).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const errs=d=>(d.errors||[]).map(e=>"✗ "+e.node+": "+e.message).join("\n");
const G={ran:"✓",cached:"⊘",failed:"✗",skipped:"–",pending:"○",running:"◌"};
// node-type display — collection operators (see the items model) get a symbol +
// accent so split/aggregate/merge read differently from per-item ai/cmd steps.
const TYPE_GLYPH={ai:"✦ ai",cmd:"$ cmd",assemble:"⊕ assemble",splitOut:"⤙ split out",aggregate:"⤚ aggregate",merge:"⋈ merge",input:"▶ input",write:"⤓ write"};
const COLLECTION=new Set(["splitOut","aggregate","merge"]);
// Per-type visual identity (n8n-style): a distinct colour + icon per node type, so
// you can scan node types at a glance. The icon badge is the primary signal (always
// visible, independent of run status, which owns the left border). `c` = the type
// colour, `i` = its glyph. SINGLE SOURCE for both the canvas badge and the chip.
const TYPE_META={
  input:    {c:"#10b981", i:"▶"},  // trigger / start point — green
  ai:       {c:"#a78bfa", i:"✦"},  // calls the model — violet
  cmd:      {c:"#f59e0b", i:"$"},  // shell command — amber
  assemble: {c:"#60a5fa", i:"⊕"},  // template assemble — blue
  splitOut: {c:"#22d3ee", i:"⤙"},  // fan-out — cyan
  aggregate:{c:"#818cf8", i:"⤚"},  // fan-in — indigo
  merge:    {c:"#f472b6", i:"⋈"},  // join two inputs — pink
  write:    {c:"#2dd4bf", i:"⤓"},  // write to file — teal
};
const typeMeta=t=>TYPE_META[t]||{c:"#7f868d",i:"●"};
// the coloured icon badge — the "logo" that identifies a node's type at a glance.
const typeBadge=t=>{const m=typeMeta(t);return '<span class="tbadge" style="--tc:'+m.c+'" title="'+esc(t)+'">'+esc(m.i)+'</span>';};
const typeChip=t=>'<span class="ntype" style="--tc:'+typeMeta(t).c+'">'+esc(TYPE_GLYPH[t]||t)+'</span>';
let current=null,nodes=[],selected=null,results={},previewTimer=null;
// the open panel has UNSAVED edits. Drives three things: the draft sent on a run
// (draftOverride), the "● 未儲存" indicator, and the save-or-discard guard on any
// exit (close / Esc / switch node / back / raw). Only ONE node can be dirty at a
// time — the open one — because that's the only editable panel. Set by markDirty on
// any edit; cleared by a fresh render from saved (selectNode) or a successful save.
let panelDirty=false;
// per-node UNSAVED drafts (browser-only, this flow, this session): node id → the
// field values you edited but haven't Saved. The draft is "what a run executes" and
// it PERSISTS across panel close / node switch — you don't get nagged on leave, the
// edit is just kept. Save writes it to the file + clears it; ↩ Reset throws it away.
// Cleared wholesale only when a DIFFERENT flow loads (open()) — so back→reopen the
// same flow keeps your drafts; only a real tab close can lose them (beforeunload).
let drafts={};
// node id → validation error message (from /api/validate). Drives the ⚠/red
// flag on the canvas so "input not wired" is visible BEFORE you run.
let invalid={};
// runtime input values for `input` nodes — like CLI --input: sent with each run,
// NOT saved to the flow. Keyed by param name (union across input nodes). Raw
// strings; the server coerces them (parseVal) so "5"→5, "true"→true, exactly
// like the command line.
let inputVals={};
function setInputVal(name,val){inputVals[name]=val;}
// build the input set for a run from the input nodes' params + inputVals. Only
// non-empty values are sent (empty → param falls back to its YAML default). All
// empty → undefined, so the run shares the no-input cache key (never [{}]).
function collectInput(){
  const names=new Set();
  nodes.forEach(n=>{if(n.type==="input")Object.keys(n.params||{}).forEach(k=>names.add(k));});
  const set={};
  names.forEach(k=>{const v=inputVals[k];if(v!=null&&v!=="")set[k]=v;});
  return Object.keys(set).length?[set]:undefined;
}
// the params form drawn in an input node's panel — one field per declared param,
// prefilled with its default. Editing a field updates inputVals (sent on run).
function renderParamsForm(n){
  const params=n.params||{};const names=Object.keys(params);
  if(!names.length)return '<span class="dim">no fields yet — add one above, then a run can pass values into the chain.</span>';
  return '<div class="dim" style="margin-bottom:6px">test values for ▷ Run — sent with each run, like CLI <code>--input</code> (not saved to the flow)</div>'
    +names.map(nm=>{
      const spec=params[nm]||{};const def=spec.default;const t=spec.type;
      const req=spec.required?'<span class="g-failed" title="required"> *</span>':'';
      const tcip=t?'<span class="dim" style="margin-left:6px;font-size:11px">'+esc(t)+'</span>':'';
      const tag='<span class="intag">'+esc(nm)+'</span>'+req+tcip;
      let field;
      if(t==="boolean"){
        const on=inputVals[nm]!=null?(inputVals[nm]===true||inputVals[nm]==="true"):(def===true);
        field='<input type="checkbox" class="paramin" data-param="'+esc(nm)+'"'+(on?" checked":"")
          +' onchange="setInputVal(this.dataset.param,this.checked)" style="margin-top:6px">';
      }else{
        const cur=inputVals[nm]!=null?inputVals[nm]:(def!=null?def:"");
        field='<input class="paramin" type="'+(t==="number"?"number":"text")+'" data-param="'+esc(nm)+'" '
          +'value="'+esc(cur)+'" oninput="setInputVal(this.dataset.param,this.value)" '
          +'placeholder="'+(def!=null?esc(String(def)):(t||"value"))+'" '
          +'style="width:100%;margin-top:4px;box-sizing:border-box">';
      }
      return '<div class="infield" style="cursor:default">'+tag+field+'</div>';
    }).join("");
}
// The input-node FIELD DEFINITION editor (saved to the flow). This is the missing
// "where do I set inputs" surface: define each field's name / type / default /
// required here instead of dropping to { } raw. saveNode() reads these rows back
// into `params`. (Distinct from renderParamsForm above, which fills RUN-TIME values.)
function paramRow(name,spec){
  spec=spec||{};const t=spec.type||"";const def=spec.default;const req=!!spec.required;
  const topt=(v,lbl)=>'<option value="'+v+'"'+(t===v?" selected":"")+'>'+lbl+'</option>';
  return '<div class="paramrow">'
    +'<input class="pf-name" spellcheck="false" placeholder="field name" value="'+esc(name||"")+'">'
    +'<select class="pf-type" title="value type">'+topt("","any")+topt("string","string")+topt("number","number")+topt("boolean","boolean")+'</select>'
    +'<input class="pf-def" spellcheck="false" placeholder="default (optional)" value="'+esc(def!=null?String(def):"")+'">'
    +'<label class="pf-req" title="a run must supply this (unless it has a default)"><input type="checkbox" class="pf-reqbox"'+(req?" checked":"")+'>req</label>'
    +'<button type="button" class="pf-del" title="remove field" onclick="this.closest(\'.paramrow\').remove();markDirty()">×</button>'
    +'</div>';
}
function renderParamsEditor(n){
  const params=n.params||{};const names=Object.keys(params);
  const rows=names.map(nm=>paramRow(nm,params[nm])).join("");
  return '<label style="margin-top:0">input fields — values a run can supply (like CLI <code>--input</code>)</label>'
    +'<div id="pnParams">'+rows+'</div>'
    +'<button type="button" class="addparam" onclick="addParamRow()">+ add field</button>'
    +'<div class="dim" style="font-size:11px;margin-top:6px">each field flows downstream as <code>{{ $json.name }}</code>. Leave empty to just kick off the chain. <b>Save</b> to apply.</div>';
}
function addParamRow(){const c=$("pnParams");if(c){c.insertAdjacentHTML("beforeend",paramRow());/** @type {any} */(c.lastElementChild).querySelector(".pf-name").focus();markDirty();}}
// read the field-definition rows back into a `params` object for saveNode.
function collectParams(){
  const out=/** @type {any} */({});const rows=document.querySelectorAll("#pnParams .paramrow");
  rows.forEach(row=>{
    const q=sel=>/** @type {any} */(row.querySelector(sel));
    const name=q(".pf-name").value.trim();if(!name)return; // unnamed row → dropped
    const t=q(".pf-type").value;
    const defRaw=q(".pf-def").value.trim();
    const req=q(".pf-reqbox").checked;
    const spec=/** @type {any} */({});
    if(t)spec.type=t;
    if(defRaw!==""){spec.default=t==="number"?Number(defRaw):t==="boolean"?(defRaw==="true"):defRaw;}
    if(req)spec.required=true;
    out[name]=spec;
  });
  return out;
}
// transitive upstream of a node (its input cone)
function ancestors(id){const set=new Set();let stack=[...(nodes.find(n=>n.id===id)?.from||[])];
  while(stack.length){const c=stack.pop();if(set.has(c))continue;set.add(c);const n=nodes.find(x=>x.id===c);if(n)stack=stack.concat(n.from||[]);}return [...set];}
// Mark the whole cone QUEUED up front. The engine runs nodes one at a time, so
// only the node actually executing is "running" (the server streams a `running`
// record via onStart); the rest sit "pending" until their turn. This is what lets
// the canvas show ONE spinner + a queue, instead of every node spinning at once.
function setPendingUI(ids){ids.forEach(id=>results[id]={status:"pending"});renderGraph();}
// a run rejected before it streams (e.g. a 400 from the input contract) must not
// leave nodes stuck — drop the optimistic pending/running placeholders we set.
function clearRunning(ids){ids.forEach(id=>{const s=results[id]&&results[id].status;if(s==="pending"||s==="running")delete results[id];});}

async function boot(){const{data}=await api("/api/context");$("dir").value=data.cwd;if(data.initialFlow)return open(data.initialFlow);listFlows();}
async function listFlows(){
  const{data}=await api("/api/list?dir="+encodeURIComponent($("dir").value));
  $("dir").value=data.dir;const box=$("flows");box.classList.remove("hidden");
  if(!data.flows.length){box.innerHTML='<div class="empty">empty — create your first flow below</div>';return;}
  box.innerHTML=data.flows.map(f=>'<div class="flow" data-f="'+f+'">'+f+'</div>').join("");
  box.querySelectorAll(".flow").forEach(el=>el.onclick=()=>open(data.dir.replace(/\/$/,"")+"/"+el.dataset.f));
}
async function createFlow(){
  const name=$("name").value.trim();if(!name)return setMsg("createMsg","err","name required");
  const{ok,data}=await api("/api/create",{method:"POST",body:JSON.stringify({dir:$("dir").value,name})});
  if(!ok)return setMsg("createMsg","err",data.error||"create failed");open(data.path);
}
async function open(path){if(path!==current)drafts={};current=path;selected=null;results={};inputVals={};layout={};manual=false;$("path").textContent=path;
  $("create").classList.add("hidden");$("editor").classList.remove("hidden");showNodes();await loadLayout();await loadNodes();}
// load saved node positions; any saved layout switches the canvas to free positioning.
async function loadLayout(){const{data}=await api("/api/layout?path="+encodeURIComponent(current));
  layout=(data&&data.layout)||{};manual=Object.keys(layout).length>0;}
function back(){closeNodeNow();$("editor").classList.add("hidden");$("create").classList.remove("hidden");listFlows();} // drafts kept in memory; reopening the same flow restores them

async function loadNodes(){
  const{ok,data}=await api("/api/parse?path="+encodeURIComponent(current));
  if(!ok){setMsg("canvasMsg","err","could not parse — use { } raw to fix it");$("graph").innerHTML="";return;}
  setMsg("canvasMsg","","");nodes=data.nodes;
  await loadValidity();   // flag bad nodes (⚠) before the first paint
  renderGraph();
}
// Fetch per-node validation errors → `invalid` map. Best-effort: a failure just
// means no flags (never blocks editing).
async function loadValidity(){
  invalid={};
  const{ok,data}=await api("/api/validate?path="+encodeURIComponent(current));
  if(ok&&data&&data.errors)for(const e of data.errors){
    invalid[e.node]=invalid[e.node]?invalid[e.node]+"; "+e.message:e.message;
  }
}
// depth of each node = longest path from a start node (fixpoint, robust to any
// declaration order). Drives the column layout so fan-out / fan-in reads L→R.
function nodeDepths(){
  const by={};nodes.forEach(n=>by[n.id]=n);
  const d={};nodes.forEach(n=>d[n.id]=0);
  for(let pass=0;pass<nodes.length;pass++){
    let changed=false;
    nodes.forEach(n=>{(n.from||[]).forEach(u=>{
      if(by[u]&&d[u]+1>d[n.id]){d[n.id]=d[u]+1;changed=true;}
    });});
    if(!changed)break;
  }
  return d;
}
// build one node card — identical card UX (status, output badge, run buttons, click).
function nodeCard(n){
  const r=results[n.id];
  const multi=(n.from||[]).length>1;
  const col=COLLECTION.has(n.type);
  const bad=invalid[n.id];
  const d=document.createElement("div");d.className="node "+(r?r.status:"")+(multi?" multi":"")+(col?" col":"")+(bad?" invalid":"")+(drafts[n.id]?" dirty":"");
  d.dataset.id=n.id;
  // ● unsaved-draft marker — this node has edits kept but not Saved (runs as draft).
  const draftDot=drafts[n.id]?'<span class="ndirty" title="未儲存的草稿 — 執行會跑這個版本">●</span>':'';
  // ×N item-count badge: how many items this node emitted (items model). Shown
  // after a run streams the count back; hidden for the 1-in-1-out base case.
  const xn=(r&&r.items!=null&&r.items!==1)?'<span class="xn" title="items emitted on this wire">×'+r.items+'</span>':'';
  const glyph=r?('<span class="glyph g-'+r.status+(r.status==="running"?" spin":"")+'">'+G[r.status]+'</span>'):'<span class="glyph g-pending">○</span>';
  const BADGE={ran:"✓ ran · called the model",cached:"⊘ cached · reused, no call",failed:"✗ failed",skipped:"– skipped"};
  let out="";
  if(r&&r.status==="running")out='<div class="nodeout dim"><span class="spin">◌</span> running…</div>';
  else if(r&&r.status==="pending")out='<div class="nodeout dim">○ queued — waiting its turn…</div>';
  else if(r&&(r.error||r.output)){
    const badge='<div class="outbadge g-'+r.status+'">'+(BADGE[r.status]||r.status)+'</div>';
    out='<div class="nodeout'+(r.status==="failed"?" bad":"")+'">'+badge+esc(r.error||r.output)+'</div>';
  }
  const fromLine=(n.from||[]).length
    ? '<div class="npreview" style="color:var(--accent)">from ['+esc(n.from.join(", "))+']'+(multi?" ← 多輸入":"")+'</div>' : '';
  const warnLine=bad?'<div class="nwarn" title="'+esc(bad)+'">⚠ '+esc(bad)+'</div>':'';
  d.innerHTML='<div class="noderun-wrap">'
      +'<button class="noderun" title="run to here (reuse cache)" onclick="event.stopPropagation();runTo(\''+n.id+'\')">▷</button>'
      +'<button class="noderun" title="re-run fresh — really call the model" onclick="event.stopPropagation();runTo(\''+n.id+'\',true)">↻</button>'
    +'</div>'
    +'<div class="nh">'+typeBadge(n.type)+'<span class="nn">'+esc(n.id)+'</span>'+draftDot+xn+glyph+typeChip(n.type)+'</div>'
    +fromLine
    +'<div class="npreview">'+esc((n.prompt||n.run||"").slice(0,70))+'</div>'+out+warnLine
    +'<div class="port" title="drag onto another node to connect →"></div>';
  d.onclick=()=>{if(connecting||movingNode)return;trySelect(n.id);}; // a drag (connect or reposition) must not also open the panel; trySelect guards unsaved edits
  return d;
}
function renderGraph(){
  const g=$("graph");g.className="gwrap"+(manual?" manual":"");g.innerHTML="";g.style.width="";g.style.height="";
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("class","wires");g.appendChild(svg);
  if(manual){
    // free positions: saved layout, falling back to the auto layout for unsaved nodes
    const auto=autoPositions();let maxX=0,maxY=0;
    nodes.forEach(n=>{
      const card=nodeCard(n);const p=layout[n.id]||auto[n.id]||{x:0,y:0};
      card.style.position="absolute";card.style.left=p.x+"px";card.style.top=p.y+"px";
      g.appendChild(card);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);
    });
    g.style.width=(maxX+260)+"px";g.style.height=(maxY+200)+"px"; // size the wrap so it scrolls
  }else{
    const cols=document.createElement("div");cols.className="gcols";g.appendChild(cols);
    const depth=nodeDepths();
    const maxD=Math.max(0,...nodes.map(n=>depth[n.id]));
    for(let c=0;c<=maxD;c++){
      const colEl=document.createElement("div");colEl.className="gcol";
      nodes.filter(n=>depth[n.id]===c).forEach(n=>colEl.appendChild(nodeCard(n)));
      cols.appendChild(colEl);
    }
  }
  applyZoom();   // (re)apply the current scale + size the scroll port, then draw wires
  applyRefs();   // renderGraph reset #graph.className above — re-assert the hide-refs state
}
// ---- reference-wire visibility (#33) ----
// Show/hide the cool dashed reference wires without touching data-flow wires.
// A class on #graph flips them via CSS (instant, no redraw); state persists in
// localStorage so the canvas remembers your preference. Default: shown.
let showRefs=localStorage.getItem("showRefs")!=="0";
function applyRefs(){
  const g=$("graph");if(g)g.classList.toggle("hideRefs",!showRefs);
  const b=$("refToggle");if(b)b.classList.toggle("on",showRefs);
}
function toggleRefs(){showRefs=!showRefs;localStorage.setItem("showRefs",showRefs?"1":"0");applyRefs();}
// auto layout used by manual mode for nodes with no saved position — mirrors the
// depth-column auto layout so a freshly-dragged graph keeps its readable shape.
function autoPositions(){
  const depth=nodeDepths();const byCol={};const pos={};
  nodes.forEach(n=>{const c=depth[n.id];(byCol[c]=byCol[c]||[]).push(n.id);});
  Object.keys(byCol).forEach(c=>byCol[c].forEach((id,i)=>{pos[id]={x:Number(c)*288,y:i*128};}));
  return pos;
}
// draw a curved connector for every `from` edge (real wiring, incl. fan-in).
function drawWires(svg,wrap){
  wrap.querySelectorAll(".wins").forEach(e=>e.remove()); // clear stale insert buttons
  const base=wrap.getBoundingClientRect();
  const card=id=>wrap.querySelector('.node[data-id="'+CSS.escape(id)+'"]');
  const rects=nodes.map(n=>card(n.id)).filter(Boolean).map(c=>c.getBoundingClientRect());
  svg.setAttribute("width",wrap.scrollWidth);svg.setAttribute("height",wrap.scrollHeight);
  let paths="";
  nodes.forEach(n=>{
    const to=card(n.id);if(!to)return;
    const tr=to.getBoundingClientRect();
    // edges to draw = data-flow wires (direct from:) + cross-layer reference wires
    // (a ref that ISN'T a direct from: — it reaches across steps to an ancestor). #33
    const fromSet=new Set(n.from||[]);
    const edges=[...(n.from||[])];
    (n.refs||[]).forEach(r=>{if(!fromSet.has(r)&&card(r))edges.push(r);});
    edges.forEach(f=>{
      const fe=card(f);if(!fe)return;
      const fr=fe.getBoundingClientRect();
      // getBoundingClientRect is post-transform (scaled screen px); the SVG + .wins
      // live INSIDE the scaled wrap, so their coords are the wrap's own (unscaled)
      // space → divide every screen-space delta by zoom.
      const x1=(fr.right-base.left)/zoom,y1=(fr.top+fr.height/2-base.top)/zoom;
      const x2=(tr.left-base.left)/zoom, y2=(tr.top+tr.height/2-base.top)/zoom;
      const mx=(x1+x2)/2,my=(y1+y2)/2;
      // classify by how the target CONSUMES f (#33). `refs` = engine promptRefs output
      // (see /api/parse): f named via {{ $('id') }} / {{ $node["id"] }} → reference wire
      // (cool, dashed, faint), maybe crossing several steps. Else → data-flow wire (warm,
      // solid, the $json main input). BOTH main-input-and-referenced → reference wins.
      const isRef=(n.refs||[]).includes(f);
      paths+=isRef
        ? '<path class="refwire" d="M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2+'" fill="none" stroke="var(--ref)" stroke-width="1.5" stroke-dasharray="5,4" opacity="0.5"/>'
        : '<path d="M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2+'" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0.7"/>';
      // a "+" insert belongs only on real data-flow wiring (from:), never on a
      // cross-layer reference edge — you don't splice a step into a value lookup.
      if(!fromSet.has(f))return;
      // Skip it if the midpoint would sit over a node (multi-column edges) — an
      // invisible button there would steal that node's clicks. rects are screen px,
      // so bring the (unscaled) midpoint back to screen space (×zoom) to compare.
      const cx=base.left+mx*zoom,cy=base.top+my*zoom;
      if(rects.some(r=>cx>=r.left-2&&cx<=r.right+2&&cy>=r.top-2&&cy<=r.bottom+2))return;
      const b=document.createElement("button");
      b.className="wins";b.textContent="+";b.title="insert a step between "+f+" and "+n.id;
      b.style.left=mx+"px";b.style.top=my+"px";
      b.onclick=ev=>{ev.stopPropagation();insertBetween(f,n.id);};
      wrap.appendChild(b);
    });
  });
  svg.innerHTML=paths;
}
window.addEventListener("resize",()=>{const g=$("graph");if(g&&g.classList.contains("gwrap")){const s=g.querySelector("svg.wires");if(s)drawWires(s,g);}});

// ---- canvas zoom ----
// Big graphs get hard to manage; zoom shrinks the whole canvas so more nodes fit
// (or magnifies to read one). Implemented as a CSS transform:scale on #graph with a
// top-left origin; #graphport is a sizer box scaled to match so the scrollbars stay
// honest in BOTH directions. Every screen↔canvas coordinate conversion (wires,
// connect-drag, move-drag, snapshot) divides by `zoom`, so wiring stays pixel-exact
// at any scale. Sticky across renders (transform lives on the element, reapplied by
// applyZoom at the end of renderGraph).
const ZMIN=0.3,ZMAX=1.6;
let zoom=1;
function clampZoom(z){return Math.min(ZMAX,Math.max(ZMIN,Math.round(z*100)/100));}
// size the scroll port to the scaled content so the canvas scrolls to every node at
// any zoom (transform doesn't change layout size, so we mirror it on the port).
function sizePort(){const g=$("graph"),port=$("graphport");if(!g||!port)return;
  port.style.width=(g.offsetWidth*zoom)+"px";port.style.height=(g.offsetHeight*zoom)+"px";}
function applyZoom(){
  const g=$("graph");if(!g)return;
  g.style.transformOrigin="0 0";g.style.transform="scale("+zoom+")";
  sizePort();
  const svg=g.querySelector("svg.wires");if(svg)drawWires(svg,g);
  const lbl=$("zoomLbl");if(lbl)lbl.textContent=Math.round(zoom*100)+"%";
}
// zoom while keeping a client point fixed (default: viewport centre) — the figma feel:
// the thing under your cursor (wheel) or the centre (buttons) stays put.
function setZoom(z,ax,ay){
  const stage=$("nodeView");if(!stage)return;
  const prev=zoom;z=clampZoom(z);if(z===prev)return;
  const r=stage.getBoundingClientRect();
  if(ax==null){ax=r.left+stage.clientWidth/2;ay=r.top+stage.clientHeight/2;}
  // unscaled content point under the anchor, before the zoom change
  const cx=(stage.scrollLeft+(ax-r.left))/prev,cy=(stage.scrollTop+(ay-r.top))/prev;
  zoom=z;applyZoom();
  stage.scrollLeft=cx*zoom-(ax-r.left);stage.scrollTop=cy*zoom-(ay-r.top);
}
function zoomBy(d){setZoom(zoom+d);}
function zoomReset(){setZoom(1);}
// fit the whole graph in view (only ever shrinks; never magnifies past 100%).
function zoomFit(){
  const stage=$("nodeView"),g=$("graph");if(!stage||!g)return;
  const w=g.offsetWidth,h=g.offsetHeight;if(!w||!h)return;   // offset* is the unscaled layout size
  const pad=28;
  zoom=clampZoom(Math.min((stage.clientWidth-pad)/w,(stage.clientHeight-pad)/h,1));
  applyZoom();stage.scrollLeft=0;stage.scrollTop=0;
}
// ⌘/Ctrl + wheel (and trackpad pinch, which Chrome reports as ctrl+wheel) → zoom at cursor.
$("nodeView").addEventListener("wheel",e=>{
  if(!(e.ctrlKey||e.metaKey))return;
  e.preventDefault();setZoom(zoom*(e.deltaY<0?1.1:0.9),e.clientX,e.clientY);
},{passive:false});
// ⌘/Ctrl + = / - / 0 — only while the editor canvas is up.
window.addEventListener("keydown",e=>{
  if(!(e.ctrlKey||e.metaKey)||$("editor").classList.contains("hidden"))return;
  if(e.key==="="||e.key==="+"){e.preventDefault();zoomBy(0.1);}
  else if(e.key==="-"){e.preventDefault();zoomBy(-0.1);}
  else if(e.key==="0"){e.preventDefault();zoomReset();}
});

// ---- P2-b drag-to-connect ----
// Drag a node's output port onto another node → add the source to that node's
// `from` via /api/connect (the backend keeps order + validates壞不落地). `connecting`
// suppresses the trailing card click so a drag never also opens the panel.
let connecting=false;
// P3 node positions: `layout` = id→{x,y} (persisted in .chain/layout via /api/layout);
// `manual` = use free positions (set once any node is dragged or a saved layout loads).
let manual=false,layout={},movingNode=false,layoutTimer=null;
function nodeUnder(e){const el=document.elementFromPoint(e.clientX,e.clientY);return el?/** @type {HTMLElement|null} */(el.closest(".node")):null;}
function startConnect(source,ev){
  ev.preventDefault();ev.stopPropagation();
  const g=$("graph");const svg=g.querySelector("svg.wires");if(!svg)return;
  const base=g.getBoundingClientRect();
  const sc=g.querySelector('.node[data-id="'+CSS.escape(source)+'"]');if(!sc)return;
  const sr=sc.getBoundingClientRect();
  const x1=(sr.right-base.left)/zoom,y1=(sr.top+sr.height/2-base.top)/zoom; // wrap-relative, unscaled (matches drawWires)
  const temp=document.createElementNS("http://www.w3.org/2000/svg","path");
  temp.setAttribute("fill","none");temp.setAttribute("stroke","var(--accent)");
  temp.setAttribute("stroke-width","2");temp.setAttribute("stroke-dasharray","5,4");
  svg.appendChild(temp);connecting=true;g.classList.add("connecting");
  const move=e=>{
    const x2=(e.clientX-base.left)/zoom,y2=(e.clientY-base.top)/zoom,mx=(x1+x2)/2;
    temp.setAttribute("d","M"+x1+","+y1+" C"+mx+","+y1+" "+mx+","+y2+" "+x2+","+y2);
    g.querySelectorAll(".node.drop").forEach(el=>el.classList.remove("drop"));
    const t=nodeUnder(e);if(t&&t.dataset.id!==source)t.classList.add("drop");
  };
  const up=async e=>{
    document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);
    g.classList.remove("connecting");temp.remove();g.querySelectorAll(".node.drop").forEach(el=>el.classList.remove("drop"));
    const t=nodeUnder(e);
    if(t&&t.dataset.id!==source)await connectTo(source,t.dataset.id);
    setTimeout(()=>{connecting=false;},0); // let the trailing click see connecting=true, then clear
  };
  document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
}
async function connectTo(source,target){
  const t=nodes.find(n=>n.id===target);if(!t)return;
  const from=[...(t.from||[])];
  if(from.includes(source))return setMsg("canvasMsg","","");
  from.push(source);
  const{ok,data}=await api("/api/connect",{method:"POST",body:JSON.stringify({path:current,node:target,from})});
  if(!ok)return setMsg("canvasMsg","err",errs(data)||"connect failed");
  await loadNodes();setMsg("canvasMsg","ok","connected "+source+" → "+target); // after re-render (loadNodes clears canvasMsg)
}
// Current input as chips (first = $json primary), each with × to disconnect.
// Wiring lives on the canvas; this panel just shows + lets you drop a wire.
function renderWire(n){
  const ups=n.from||[];
  if(!ups.length){$("pnWire").innerHTML='<span class="dim">no upstream — this is a start node. Drag a node\'s right-edge ● here (or the + on a wire) to give it an input.</span>';return;}
  $("pnWire").innerHTML=ups.map((u,i)=>
    '<span class="chip'+(i===0?" p":"")+'" title="'+(i===0?"$json (primary input)":'$node[&quot;'+esc(u)+'&quot;]')+'">'
    +(i===0?'<span class="intag">$json</span> ':"")+esc(u)
    +'<b class="x" data-rm="'+esc(u)+'" title="disconnect">×</b></span>').join("");
}
// Populate the type dropdown with only the types that make sense for THIS node's
// position: a start node (no upstream) can be input/ai/cmd; a node WITH upstream
// can be any consumer type but not an `input` trigger (which must have no from).
// The node's current type is always kept selectable so nothing vanishes.
function setTypeOptions(n){
  const hasUp=(n.from||[]).length>0;
  const allowed=hasUp?["ai","cmd","assemble","splitOut","aggregate","merge"]:["input","ai","cmd"];
  if(!allowed.includes(n.type))allowed.unshift(n.type);
  $("pnTypeSel").innerHTML=allowed.map(t=>'<option value="'+t+'">'+t+'</option>').join("");
  $("pnTypeSel").value=n.type;
}
// Change this node's type (resets its type-specific fields to the new type's
// starter, keeps wiring). The panel re-renders to show the new type's editor.
async function changeType(type){
  if(!selected)return;
  const{ok,data}=await api("/api/set-type",{method:"POST",body:JSON.stringify({path:current,node:selected,type})});
  if(!ok){setMsg("pnMsg","err",errs(data)||"type change failed");selectNode(selected);return;}
  await loadNodes();selectNode(selected);setMsg("pnMsg","ok","type → "+type);
}
async function disconnect(id){
  const n=nodes.find(x=>x.id===selected);if(!n)return;
  const from=(n.from||[]).filter(x=>x!==id);
  const{ok,data}=await api("/api/connect",{method:"POST",body:JSON.stringify({path:current,node:selected,from})});
  if(!ok)return setMsg("pnMsg","err",errs(data)||"disconnect failed");
  await loadNodes();selectNode(selected);
}
// transitive upstream ids of `id` (for the "earlier outputs" view).
function ancestorIds(id){
  const by={};nodes.forEach(n=>by[n.id]=n);
  const seen=new Set(),stack=[...((by[id]||{}).from||[])];
  while(stack.length){const x=stack.pop();if(seen.has(x)||!by[x])continue;seen.add(x);(by[x].from||[]).forEach(u=>stack.push(u));}
  return seen;
}
// chip × → disconnect that upstream
document.addEventListener("click",e=>{
  const tgt=/** @type {Element|null} */(e.target);if(!tgt||!tgt.closest)return;
  const x=/** @type {HTMLElement|null} */(tgt.closest(".chip .x[data-rm]"));
  if(x&&x.dataset.rm){e.stopPropagation();disconnect(x.dataset.rm);}
});
// Insert a brand-new step ON an edge source→target: create it, wire source→new,
// then repoint target from `source` to `new`. Composes the same endpoints the
// editor already uses, so each step is validated壞不落地.
async function insertBetween(source,target){
  let base="step",i=1,id=base;while(nodes.find(n=>n.id===id))id=base+(++i);
  let r=await api("/api/add-node",{method:"POST",body:JSON.stringify({path:current,id,type:"ai"})});
  if(!r.ok)return setMsg("canvasMsg","err",errs(r.data)||"insert failed");
  r=await api("/api/connect",{method:"POST",body:JSON.stringify({path:current,node:id,from:[source]})});
  if(!r.ok)return setMsg("canvasMsg","err",errs(r.data)||"insert failed");
  const t=nodes.find(n=>n.id===target);
  const tf=(t&&t.from||[]).map(x=>x===source?id:x);
  r=await api("/api/connect",{method:"POST",body:JSON.stringify({path:current,node:target,from:tf})});
  if(!r.ok)return setMsg("canvasMsg","err",errs(r.data)||"insert failed");
  await loadNodes();selectNode(id);setMsg("pnMsg","ok","inserted "+id+" — edit its prompt, then Save");
}
// one delegated listener — the cards are rebuilt every render, the port isn't.
document.addEventListener("pointerdown",e=>{
  const tgt=/** @type {Element|null} */(e.target);if(!tgt||!tgt.closest)return;
  const port=tgt.closest(".port");
  if(port){const c=/** @type {HTMLElement} */(port.closest(".node"));if(c)startConnect(c.dataset.id,e);return;}
  // body drag → reposition (not on a run button; only inside the canvas)
  const card=/** @type {HTMLElement} */(tgt.closest(".node"));
  if(card&&!tgt.closest(".noderun")&&$("graph").contains(card))startMove(card.dataset.id,e);
});

// ---- P3 drag-to-reposition + persist ----
// Capture the current (auto-laid-out) positions as absolute coords, so switching
// to manual mode on the first drag doesn't make nodes jump.
function snapshotPositions(){
  const g=$("graph");const base=g.getBoundingClientRect();
  nodes.forEach(n=>{const c=g.querySelector('.node[data-id="'+CSS.escape(n.id)+'"]');
    if(c){const r=c.getBoundingClientRect();layout[n.id]={x:(r.left-base.left)/zoom,y:(r.top-base.top)/zoom};}});
}
function saveLayout(){clearTimeout(layoutTimer);
  layoutTimer=setTimeout(()=>{api("/api/layout",{method:"POST",body:JSON.stringify({path:current,layout})});},400);}
function startMove(id,ev){
  const g=$("graph");const ox=ev.clientX,oy=ev.clientY;let moving=false,start;
  const move=e=>{
    if(!moving){
      if(Math.abs(e.clientX-ox)+Math.abs(e.clientY-oy)<4)return; // under threshold → still a click
      ev.preventDefault();
      if(!manual){snapshotPositions();manual=true;renderGraph();}
      start=layout[id]||{x:0,y:0};moving=true;movingNode=true;
    }
    const nx=Math.max(0,start.x+(e.clientX-ox)/zoom),ny=Math.max(0,start.y+(e.clientY-oy)/zoom);
    layout[id]={x:nx,y:ny};
    const c=g.querySelector('.node[data-id="'+CSS.escape(id)+'"]');
    if(c){c.style.left=nx+"px";c.style.top=ny+"px";}
    const svg=g.querySelector("svg.wires");if(svg)drawWires(svg,g);
  };
  const up=()=>{document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",up);
    if(moving){saveLayout();setTimeout(()=>{movingNode=false;},0);}}; // let the trailing click see movingNode
  document.addEventListener("pointermove",move);document.addEventListener("pointerup",up);
}

function selectNode(id){
  selected=id;const n=nodes.find(x=>x.id===id);if(!n)return;
  // a kept draft for this node overrides the saved values in the EDITABLE fields, so
  // reopening shows what you were typing (not the stale saved value). Wiring / type /
  // output still come from the saved node — only your edited fields are the draft.
  const d=drafts[id];const eff=d?{...n,...d}:n;
  $("modal").classList.remove("hidden");
  $("pnId").value=n.id;$("pnType").innerHTML=typeBadge(n.type)+'<span style="margin-left:6px">'+esc(TYPE_GLYPH[n.type]||n.type)+'</span>';
  setTypeOptions(n);
  const isCmd=n.type==="cmd";
  $("pnPrompt").value=isCmd?(eff.run||""):(eff.prompt||"");
  renderWire(n);   // current input as chips (× to disconnect) — wiring is on the canvas, not typed
  $("pnFromWrap").classList.toggle("hidden",n.type==="input"); // input is a trigger — no `from`
  $("pnPromptCol").classList.toggle("hidden",n.type==="input"); // a trigger has no prompt — hide the whole prompt column
  $("pnCols").classList.toggle("trigger",n.type==="input");     // …and collapse the grid to 2 columns so there's no empty gap
  // INPUT: an `input` trigger shows its params form (runtime values); any other
  // node shows its direct inputs' outputs (click to insert) + the outputs of
  // EARLIER upstream steps (read-only — wire one in to reference it).
  const ups=n.from||[];
  const inField=(u,i)=>{const r=results[u];const tag=i===0?'$json':('$node["'+u+'"]');
    const val=r?esc(r.output||r.error||"(empty)"):'<span class="dim">(run to see)</span>';
    return '<div class="infield" onclick="insertVar(\''+u+'\','+(i===0)+')" title="click to insert into the prompt">'
      +'<span class="ins">↵ insert</span><span class="intag">'+tag+'</span> ← '+u
      +'<div class="inval">'+val+'</div></div>';};
  if(n.type==="input"){$("pnInput").innerHTML=renderParamsForm(n);$("pnEarlier").innerHTML="";}
  else{
    $("pnInput").innerHTML=ups.length?ups.map(inField).join(""):"";  // no-upstream note already shown by the chips area above
    // earlier steps = transitive ancestors not directly wired — their outputs, so you
    // can SEE every prior step's data. Lives in its own box so loadItems (which owns
    // #pnInput after a run) never clobbers it. Click → insert a cross-step reference
    // {{ $node["id"] }} WITHOUT wiring it into from: (the engine resolves ancestor refs).
    const earlier=[...ancestorIds(n.id)].filter(u=>!ups.includes(u));
    $("pnEarlier").innerHTML=earlier.length?'<div class="dim" style="margin-top:4px">earlier outputs (click to reference — 跨步取值)</div>'
      +earlier.map(u=>{const r=results[u];const val=r?esc(r.output||r.error||"(empty)"):'<span class="dim">(run to see)</span>';
        return '<div class="infield" onclick="insertEarlier(\''+u+'\')" title="insert {{ $node[&quot;'+esc(u)+'&quot;] }} at the cursor — a cross-step reference, does not change from:">'
          +'<span class="ins">↵ insert ref</span><span class="intag">'+esc(u)+'</span><div class="inval">'+val+'</div></div>';}).join(""):"";
  }
  // OUTPUT column — for ai nodes the output-schema editor sits above the actual
  // output; every other type has none, so the box clears. (It's an EDITOR, built
  // here on a full render — never on a run; refreshSelectedOutput leaves it alone,
  // which keeps an unsaved schema edit from being wiped mid-run.)
  $("pnSchema").innerHTML=n.type==="ai"?renderSchemaEditor(eff):"";
  if(n.type==="ai")schemaPreview();
  $("pnTypeFields").innerHTML=renderTypeFields(eff);   // P2-a: type-specific editor (draft-aware)
  if(invalid[id])setMsg("pnMsg","err","⚠ "+invalid[id]);else setMsg("pnMsg","","");
  renderPreview();
  refreshSelectedOutput();   // the actual output/status/items — the ONLY part a run redraws
  panelDirty=!!d;updateDirty();   // dirty iff this node has a kept draft
}
// status labels for the output column — shared by selectNode + refreshSelectedOutput.
const STATUS_LAB={ran:'<span class="g-ran">✓ ran · called the model</span>',cached:'<span class="g-cached">⊘ cached · reused, no call</span>',failed:'<span class="g-failed">✗ failed</span>',skipped:'<span class="g-skipped">– skipped</span>',running:'<span class="g-running"><span class="spin">◌</span> running…</span>',pending:'<span class="g-pending">○ queued…</span>'};
// Redraw ONLY the output region (status glyph, output text, per-item) of the open
// node — never the editors. A run stream (onNode) calls this, so a re-run shows the
// new result WITHOUT rebuilding the prompt/schema/type fields. That rebuild is what
// used to wipe an unsaved edit the instant you hit re-run. While queued/running the
// OLD output is stale → dim + a status line; the real output replaces it when
// onResult streams back (loadItems is guarded on status the same way).
function refreshSelectedOutput(){
  if(!selected)return;const n=nodes.find(x=>x.id===selected);if(!n)return;
  const ro=results[selected];
  const busy=ro&&(ro.status==="running"||ro.status==="pending");
  $("pnOut").className="mbody"+(ro&&ro.status==="failed"?" out err":(busy?" dim":(ro?"":" dim")));
  $("pnOut").textContent=ro?(ro.status==="running"?"running…":(ro.status==="pending"?"queued — waiting its turn…":(ro.error||ro.output||"(empty)"))):"Run to see this node's output.";
  $("pnOutStatus").innerHTML=ro?(STATUS_LAB[ro.status]||""):"";
  if(n.type!=="input")loadItems(selected);   // P1-b: per-item content (items model)
}
// P2-a: type-specific config the panel can set without dropping to raw YAML —
// splitOut/aggregate `field`, merge `mode`/`key`, cmd `mode`, input `params`.
// (assemble/ai edit `prompt` in the middle column.)
function renderTypeFields(n){
  const opt=(cur,v)=>'<option value="'+v+'"'+(cur===v?" selected":"")+'>'+v+'</option>';
  if(n.type==="input")return renderParamsEditor(n);   // the field-definition editor
  if(n.type==="splitOut"||n.type==="aggregate")
    return '<label>field — property to '+(n.type==="splitOut"?"split out":"aggregate")+' (blank = whole item)</label>'
      +'<input id="tfField" spellcheck="false" value="'+esc(n.field||"")+'" placeholder="e.g. items">';
  if(n.type==="merge"){
    const m=n.mode||"append";
    return '<label>mode — how to combine the two inputs</label>'
      +'<select id="tfMode" onchange="onMergeMode()">'+opt(m,"append")+opt(m,"byPosition")+opt(m,"byKey")+'</select>'
      +'<div id="tfKeyWrap"'+(m==="byKey"?"":' class="hidden"')+' style="margin-top:8px">'
      +'<label>key — property both sides join on</label>'
      +'<input id="tfKey" spellcheck="false" value="'+esc(n.key||"")+'" placeholder="e.g. id"></div>';
  }
  if(n.type==="cmd"){
    const m=n.mode||"once";
    return '<label>mode — run the command…</label>'
      +'<select id="tfMode">'+opt(m,"once")+opt(m,"perItem")+'</select>'
      +'<div class="dim" style="font-size:11px;margin-top:4px">once = whole input at once · perItem = once per input item</div>';
  }
  if(n.type==="write"){
    const m=n.mode||"overwrite";
    return '<label>path — output file (supports {{date}} / {{datetime}})</label>'
      +'<input id="tfPath" spellcheck="false" value="'+esc(n.path||"")+'" placeholder="e.g. out/{{date}}.md">'
      +'<label style="margin-top:8px">mode</label>'
      +'<select id="tfMode">'+opt(m,"overwrite")+opt(m,"append")+'</select>'
      +'<div class="dim" style="font-size:11px;margin-top:4px">writes the upstream\'s text to the file when this node runs</div>';
  }
  // ai output schema is NOT here — it describes the OUTPUT shape, so it lives in
  // the OUTPUT column (renderSchemaEditor → #pnSchema), not the INPUT form.
  return "";
}
function onMergeMode(){const w=$("tfKeyWrap");if(w)w.classList.toggle("hidden",$("tfMode").value!=="byKey");}

// ── ai OUTPUT SCHEMA editor ──────────────────────────────────────────────────
// Lives in the OUTPUT column (schema = the shape this node must return). Two-level:
// pick an OUTPUT FORMAT first, then only JSON exposes fields. Maps to what the
// engine actually supports (schema.ts: a flat field→type map; top level MUST be a
// JSON object):
//   text → no schema      (model returns plain text, unvalidated — the common case)
//   json → { f: type, … } (native object output; per-field type via the dropdown)
//   list → { _list: array}(engine forbids a bare top-level array, so we wrap the
//                          list in a reserved `_list` field; downstream reads
//                          {{ $json._list }}. `_list` is pure UI sugar — zero
//                          engine changes. `_` prefix dodges the `$`-eaten tokenizer
//                          and collides with nothing, verified across render/items/
//                          splitOut/aggregate/merge/schema.)
//
//   detect on load          render (one wrap, format toggles VISIBILITY only)
//   ─────────────           ──────────────────────────────────────────────────
//   no schema      → text   ┌ output format  (•Text)(JSON)(List)
//   {_list:array}  → list   │ text: "plain text — no validation"
//   else           → json   │ json: [name][type▾][×] rows + "+ add field"
//                           │ list: locked _list row
//                           └ preview — the JSON the model must return
// Non-destructive: switching format never clears #pnSchemaRows, so a misclick
// can't nuke fields you built (CLAUDE.md: one expected action, no hidden effects).
// collectSchema() reads the ACTIVE format at save time.
function schemaMode(n){
  const s=n.schema;
  if(!s||typeof s!=="object"||!Object.keys(s).length)return "text";
  const keys=Object.keys(s);
  if(keys.length===1&&keys[0]==="_list"&&s._list==="array")return "list";
  return "json";
}
const SCHEMA_SAMPLE={string:'"…"',number:"0",boolean:"true",array:'["…"]',object:"{…}"};
const FMT_LABELS={text:"Text",json:"JSON",list:"List"};
function fmtBtn(v,label,mode){return '<button type="button" class="fmtbtn'+(v===mode?" on":"")+'" data-fmt="'+v+'" onclick="onSchemaFormat(this)">'+label+'</button>';}
// Collapsible: the header is always visible (shows the active format as a chip);
// the body (selector + helper + fields + preview) only appears when expanded.
// Starts collapsed so the common case (Text, nothing to set) stays compact. The
// open/closed state is a sticky preference (module-level), so a save/re-run that
// rebuilds the panel keeps it as you left it — no surprise collapse mid-edit.
let schemaOpen=false;
function renderSchemaEditor(n){
  const mode=schemaMode(n);
  // only JSON mode owns named fields; text/list start the json editor empty so a
  // later switch to JSON is a clean slate (list has no user fields, just `_list`).
  const fields=mode==="json"?(n.schema||{}):{};
  const rows=Object.entries(fields).map(([nm,t])=>schemaRow(nm,t)).join("");
  return '<div id="pnSchemaWrap" class="schemawrap '+(schemaOpen?"":"collapsed ")+'fmt-'+mode+'" data-fmt="'+mode+'">'
    +'<div class="schemahdr" onclick="toggleSchema()" title="展開設定輸出格式">'
      +'<span class="caret"></span>'
      +'<label style="margin:0">output format</label>'
      +'<span id="pnFmtNow" class="fmtnow">'+FMT_LABELS[mode]+'</span>'
    +'</div>'
    +'<div class="schemabody">'
      +'<div class="fmtsel">'+fmtBtn("text","Text",mode)+fmtBtn("json","JSON",mode)+fmtBtn("list","List",mode)+'</div>'
      +'<div class="schema-text dim" style="font-size:11px;margin-top:8px">model returns plain text — no validation (most common)</div>'
      +'<div class="schema-json">'
        +'<div id="pnSchemaRows">'+rows+'</div>'
        +'<button type="button" class="addparam" onclick="addSchemaRow()">+ add field</button>'
      +'</div>'
      +'<div class="schema-list dim" style="font-size:11px;margin-top:8px">system wraps your list in a reserved field <code>_list</code> — downstream reads <code>{{ $json._list }}</code></div>'
      +'<div id="pnSchemaPrev"></div>'
      +'<div class="dim" style="font-size:11px;margin-top:6px">if set: output is parsed + validated as JSON; a mismatch retries once, then fails</div>'
    +'</div>'
    +'</div>';
}
// collapse/expand only — does not touch the format or fields (no hidden effects).
function toggleSchema(){schemaOpen=!schemaOpen;const w=$("pnSchemaWrap");if(w)w.classList.toggle("collapsed",!schemaOpen);}
// one JSON field: [name][type ▾][×]. Reuses the input editor's .paramrow / .pf-*
// styles; the dropdown carries array/object too (engine validates the container).
function schemaRow(name,type){
  type=type||"string";
  const topt=v=>'<option value="'+v+'"'+(type===v?" selected":"")+'>'+v+'</option>';
  return '<div class="paramrow">'
    +'<input class="pf-name" spellcheck="false" placeholder="field name" value="'+esc(name||"")+'" oninput="schemaPreview()">'
    +'<select class="pf-type" title="value type" onchange="schemaPreview()">'+topt("string")+topt("number")+topt("boolean")+topt("array")+topt("object")+'</select>'
    +'<button type="button" class="pf-del" title="remove field" onclick="this.closest(\'.paramrow\').remove();schemaPreview();markDirty()">×</button>'
    +'</div>';
}
function addSchemaRow(){const c=$("pnSchemaRows");if(c){c.insertAdjacentHTML("beforeend",schemaRow());/** @type {any} */(c.lastElementChild).querySelector(".pf-name").focus();schemaPreview();markDirty();}}
// switch format: toggle visibility only — NEVER touch #pnSchemaRows (non-destructive).
function onSchemaFormat(btn){
  const fmt=btn.dataset.fmt;const wrap=$("pnSchemaWrap");if(!wrap)return;
  // keep expanded while picking; preserve collapsed only if it was already collapsed
  const wasCollapsed=wrap.classList.contains("collapsed");
  wrap.className="schemawrap"+(wasCollapsed?" collapsed":"")+" fmt-"+fmt;wrap.dataset.fmt=fmt;
  wrap.querySelectorAll(".fmtbtn").forEach(b=>b.classList.toggle("on",b===btn));
  const now=$("pnFmtNow");if(now)now.textContent=FMT_LABELS[fmt]||fmt;   // sync the collapsed chip
  schemaPreview();markDirty();   // changing the output format is an unsaved edit
}
// live "model returns:" example built from the active format + current fields.
function schemaPreview(){
  const wrap=$("pnSchemaWrap");if(!wrap)return;
  const prev=$("pnSchemaPrev");if(!prev)return;
  const fmt=wrap.dataset.fmt;
  if(fmt==="text"){prev.innerHTML="";return;}
  let body;
  if(fmt==="list"){body='{ "_list": [ "…", "…" ] }';}
  else{
    const parts=[];
    document.querySelectorAll("#pnSchemaRows .paramrow").forEach(r=>{
      const nm=/** @type {any} */(r.querySelector(".pf-name")).value.trim();if(!nm)return;
      const t=/** @type {any} */(r.querySelector(".pf-type")).value;
      parts.push('"'+esc(nm)+'": '+(SCHEMA_SAMPLE[t]||'"…"'));
    });
    body=parts.length?"{ "+parts.join(", ")+" }":"{ }";
  }
  prev.innerHTML='<div class="dim" style="font-size:11px;margin-top:8px">preview — model returns:</div><code class="prevcode">'+body+'</code>';
}
// read the ACTIVE format into a schema value for saveNode. text → null (no schema);
// json → {field:type} (null if no named fields); list → {_list:array}.
function collectSchema(){
  const wrap=$("pnSchemaWrap");if(!wrap)return null;
  const fmt=wrap.dataset.fmt;
  if(fmt==="text")return null;
  if(fmt==="list")return {_list:"array"};
  const out=/** @type {any} */({});
  document.querySelectorAll("#pnSchemaRows .paramrow").forEach(r=>{
    const nm=/** @type {any} */(r.querySelector(".pf-name")).value.trim();if(!nm)return;
    out[nm]=/** @type {any} */(r.querySelector(".pf-type")).value;
  });
  return Object.keys(out).length?out:null;
}
// render an Item[] (the n8n items model) item by item — value per item, with the
// paired-item lineage tag when present. null = not run yet; [] = ran, 0 items.
function renderItems(items){
  if(items==null)return '<span class="dim">(run to see)</span>';
  if(!items.length)return '<span class="dim">(0 items)</span>';
  return '<div class="itemcount">×'+items.length+' item'+(items.length===1?'':'s')+'</div>'
    +items.map((it,i)=>{
      const v=it.json;const txt=typeof v==="string"?v:JSON.stringify(v,null,2);
      const paired=it.pairedItem!=null?' <span class="dim" title="derived from input item '+it.pairedItem+'">↤'+it.pairedItem+'</span>':'';
      return '<div class="itemrow"><span class="itemidx">item '+i+'</span>'+paired
        +'<div class="itemval">'+esc(txt)+'</div></div>';
    }).join("");
}
// P1-b: pull /api/items (each upstream's items + this node's output items) and
// render them per-item in the panel — so the editor SHOWS the items model, not
// just a flattened blob. Guards on `selected` so a slow fetch can't clobber a
// panel the user already moved off.
async function loadItems(id){
  if(selected!==id)return;
  const{ok,data}=await api("/api/items?path="+encodeURIComponent(current)+"&node="+encodeURIComponent(id));
  if(!ok||selected!==id)return;
  // /api/items serves the LAST cached output — stale while this node is queued or
  // running. Don't paint it over the "running…"/"queued…" indicator selectNode set,
  // or the user sees an old result next to a live spinner (looks like THIS run's).
  const st=results[id]&&results[id].status;
  if(st==="running"||st==="pending")return;
  if(data.output&&data.output.length){$("pnOut").className="mbody";$("pnOut").innerHTML=renderItems(data.output);}
  const n=nodes.find(x=>x.id===id);if(!n)return;
  const ups=n.from||[];
  if(ups.length&&data.inputs){
    $("pnInput").innerHTML=ups.map((u,i)=>{const tag=i===0?'$json':('$node["'+u+'"]');
      return '<div class="infield" onclick="insertVar(\''+u+'\','+(i===0)+')" title="click to insert into the prompt">'
        +'<span class="ins">↵ insert</span><span class="intag">'+tag+'</span> ← '+u
        +'<div class="inval">'+renderItems(data.inputs[u]||null)+'</div></div>';}).join("");
  }
}
function schedulePreview(){clearTimeout(previewTimer);previewTimer=setTimeout(renderPreview,350);}
async function renderPreview(){
  if(!selected)return;const n=nodes.find(x=>x.id===selected);
  // ai AND assemble both render a {{ }} prompt template — preview applies to both.
  if(!n||(n.type!=="ai"&&n.type!=="assemble")){$("pnRendered").textContent="(rendered preview is for ai / assemble steps)";return;}
  const{ok,data}=await api("/api/render",{method:"POST",body:JSON.stringify({path:current,node:selected,template:$("pnPrompt").value})});
  if(!ok)return;
  if(data.noUpstream){$("pnRendered").textContent=data.rendered||"(empty)";return;}
  $("pnRendered").className="mbody";$("pnRendered").style.color="var(--ran)";
  $("pnRendered").innerHTML=esc(data.rendered)+(data.haveInputs?"":'<div class="dim" style="margin-top:6px;color:var(--dim)">↑ {{ }} stay literal until you ▷ Run to here (fills from real input)</div>');
}
// inline rename via /api/rename — the engine rewrites the key + every downstream
// from: + every prompt $('id') ref, and moves the cached output, all atomically
// (壞不落地). No-op if unchanged; reverts the field on failure.
let renaming=false;
async function renameSelected(){
  if(!selected||renaming)return;
  const to=$("pnId").value.trim();
  if(!to||to===selected){$("pnId").value=selected;return;}
  renaming=true;
  const{ok,data}=await api("/api/rename",{method:"POST",body:JSON.stringify({path:current,node:selected,to})});
  renaming=false;
  if(!ok){setMsg("pnMsg","err",errs(data)||"rename failed");$("pnId").value=selected;return;}
  selected=to;setMsg("pnMsg","ok","renamed ✓");await loadNodes();selectNode(to);
}
function closeNodeNow(){selected=null;panelDirty=false;updateDirty();$("modal").classList.add("hidden");}
// The node's OWN editable fields, read live from the panel → [[field,value],…].
// SINGLE SOURCE for both saveNode (POSTs each to /api/set) and the draft sent on a
// run (draftOverride). Each node type owns different fields — write exactly those,
// not always prompt. (key before mode for merge: setting mode=byKey while key is
// unset would be a NEW validate error, rejected, leaving mode unsaved.) A null
// value = "remove this field" (e.g. a schema switched back to Text).
function panelFieldSets(n){
  const sets=[];
  if(n.type==="cmd"){sets.push(["run",$("pnPrompt").value]);if($("tfMode"))sets.push(["mode",$("tfMode").value]);}
  else if(n.type==="assemble"){sets.push(["prompt",$("pnPrompt").value]);}
  else if(n.type==="ai"){
    sets.push(["prompt",$("pnPrompt").value]);
    const sc=collectSchema();   // reads the active OUTPUT FORMAT (text→null/json/list)
    if(sc)sets.push(["schema",sc]);
    else if(n.schema)sets.push(["schema",null]); // had a schema, now cleared → remove (parse drops null)
  }
  else if(n.type==="splitOut"||n.type==="aggregate"){if($("tfField"))sets.push(["field",$("tfField").value]);}
  else if(n.type==="merge"){if($("tfKey"))sets.push(["key",$("tfKey").value]);if($("tfMode"))sets.push(["mode",$("tfMode").value]);}
  else if(n.type==="write"){if($("tfPath"))sets.push(["path",$("tfPath").value]);if($("tfMode"))sets.push(["mode",$("tfMode").value]);}
  else if(n.type==="input"){if($("pnParams"))sets.push(["params",collectParams()]);}
  return sets;
}
// the open panel's unsaved draft as the run API's `overrides` — or undefined when
// nothing is dirty (so the run uses the saved flow). Only the open node can be
// dirty, so it's always THIS node's fields. The server applies it IN MEMORY (file
// untouched), so you see the result of your edit without having to save first.
function draftOverride(){
  if(!selected||!panelDirty)return undefined;
  const n=nodes.find(x=>x.id===selected);if(!n)return undefined;
  return {node:selected,fields:Object.fromEntries(panelFieldSets(n))};
}
// Save the open node's fields to the flow file. Returns true on success (the guard
// uses this: a failed save must NOT let you leave + lose the edit). Wiring is no
// longer typed here — it's managed live on the canvas + input chips — so Save only
// writes this node's own fields.
async function saveNode(){
  const n=nodes.find(x=>x.id===selected);if(!n)return false;
  for(const [f,v] of panelFieldSets(n)){
    const r=await api("/api/set",{method:"POST",body:JSON.stringify({path:current,node:selected,field:f,value:v})});
    if(!r.ok){setMsg("pnMsg","err",errs(r.data)||"save failed");return false;}
  }
  delete drafts[selected];   // saved → the draft IS the file now, drop it
  await loadNodes();selectNode(selected);   // re-render from saved → panelDirty cleared, ● gone
  setMsg("pnMsg","ok","saved ✓");   // after the re-render (selectNode clears pnMsg) so it actually shows
  return true;
}
// the in-flight run's AbortController, or null when nothing is running. Aborting it
// = Stop: the fetch cancels → the server sees the socket close → it stops the runner
// and kills the current child. Also the re-entry guard (one run at a time).
let runAbort=null;
function setRunning(on){
  runAbort=on?new AbortController():null;
  const b=$("stopBtn");if(b)b.classList.toggle("hidden",!on);
}
// Stop: abort the in-flight run. The currently-running node's subprocess is killed
// and every still-queued node is dropped — you keep whatever already finished.
function stopRun(){if(runAbort)runAbort.abort();}
// read an NDJSON stream, calling onNode for each node result as it arrives.
// Stoppable: a Stop aborts the fetch; we treat that as a clean end (not an error),
// drop the unfinished pending/running placeholders, and leave settled nodes intact.
async function streamRun(url,bodyObj){
  setRunning(true);
  const signal=runAbort.signal;
  try{
    const r=await fetch(url,{method:"POST",body:JSON.stringify(bodyObj),signal});
    if(!r.ok)return{ok:false,data:await r.json().catch(()=>({}))};
    const reader=r.body.getReader(),dec=new TextDecoder();let buf="";
    while(true){const{done,value}=await reader.read();if(done)break;
      buf+=dec.decode(value,{stream:true});let i;
      while((i=buf.indexOf("\n"))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(line){try{onNode(JSON.parse(line));}catch(e){}}}}
    return{ok:true};
  }catch(e){
    if(signal.aborted){   // Stop, not a failure — tidy the canvas back to a stable state
      clearRunning(nodes.map(n=>n.id));renderGraph();
      if(selected)refreshSelectedOutput();
      setMsg("canvasMsg","","■ 已中止 · 停在已完成的節點");
      return{ok:true,stopped:true};
    }
    throw e;
  }finally{
    setRunning(false);
  }
}
function onNode(rec){
  if(rec.error&&!rec.id){setMsg("canvasMsg","err",rec.error);return;}
  results[rec.id]={status:rec.status,output:rec.output,error:rec.error,items:rec.items};
  renderGraph();                       // each node flips the instant it finishes
  // ONLY the output region — never a full selectNode, which would rebuild the prompt
  // /schema editors and wipe whatever you typed but haven't saved (the re-run bug).
  if(selected===rec.id)refreshSelectedOutput();
}
async function runNode(force){
  if(!selected||runAbort)return;   // already running — Stop it first
  $("pnOut").className="mbody dim";$("pnOut").textContent="running…";$("pnOutStatus").innerHTML='<span class="g-running">◌ running…</span>';
  const ids=[selected,...ancestors(selected)];
  setPendingUI(ids);
  // overrides = the panel's unsaved draft → run what's on screen, no save needed.
  const r=await streamRun("/api/run-node",{path:current,node:selected,profile:$("profile").value,fresh:!!force,input:collectInput(),overrides:draftOverride()});
  if(!r.ok){clearRunning(ids);renderGraph();return setMsg("pnMsg","err",errs(r.data)||"run failed");}
}
// run-to-here straight from a node's ▷ button — runs inline, NO modal.
// The result shows on the card itself (see renderGraph). Click the card body
// (not ▷) if you want to open the editor panel.
async function runTo(id,fresh){
  if(runAbort)return;   // already running — Stop it first
  const ids=[id,...ancestors(id)];
  setPendingUI(ids);
  // a card ▷/↻ runs the SAVED flow — unless it's the open node, where the panel's
  // unsaved draft (if any) is what you mean to run. (draftOverride targets `selected`.)
  const overrides=id===selected?draftOverride():undefined;
  const r=await streamRun("/api/run-node",{path:current,node:id,profile:$("profile").value,fresh:!!fresh,input:collectInput(),overrides});
  if(!r.ok){clearRunning(ids);renderGraph();return setMsg("canvasMsg","err",errs(r.data)||"run failed");}
}
// click a variable in INPUT → insert it into the prompt at the cursor (no typos)
function insertVar(id,primary){
  const expr=primary?'{{ $json }}':'{{ $node["'+id+'"] }}';
  const ta=$("pnPrompt");const s=ta.selectionStart??ta.value.length,e=ta.selectionEnd??s;
  ta.value=ta.value.slice(0,s)+expr+ta.value.slice(e);
  ta.focus();ta.selectionStart=ta.selectionEnd=s+expr.length;
  markDirty();   // a programmatic .value change fires no input event — mark it ourselves
  schedulePreview();
}
// click an EARLIER (transitive, not-yet-wired) output → insert {{ $node["id"] }} as a
// pure CROSS-STEP REFERENCE. It does NOT touch `from:` — the engine now resolves a
// reference to any ancestor (validate allows it, run loads the ancestor's items), so
// the earlier node stays a reference, not a forced data-flow input. This keeps the
// two distinct: "connected nodes" = data flow (from:), "earlier outputs" = cross-ref.
// Just a text splice at the cursor (same as insertVar) — no /api/connect, no reload.
function insertEarlier(u){ insertVar(u,false); }
async function deleteNode(){
  if(!selected)return;
  const{ok,data}=await api("/api/delete-node",{method:"POST",body:JSON.stringify({path:current,node:selected})});
  if(!ok)return setMsg("pnMsg","err",errs(data)||"delete failed");
  closeNodeNow();await loadNodes();   // node's gone — nothing to save, skip the guard
}
// Add a step via the engine's nodeStarter (server-side, single source of truth
// for each type's minimal fields). The node is unwired — drag/edit `from` next.
async function addNode(){
  const type=$("addType")?$("addType").value:"ai";
  let i=1,id;do{id="step"+(nodes.length+i);i++;}while(nodes.some(n=>n.id===id));
  const{ok,data}=await api("/api/add-node",{method:"POST",body:JSON.stringify({path:current,id,type})});
  if(!ok)return setMsg("canvasMsg","err",errs(data)||"add failed");
  await loadNodes();selectNode(id);
}
async function runAll(fresh){
  if(runAbort)return;   // a run is already in flight — Stop it first
  setPendingUI(nodes.map(n=>n.id));
  // if a node panel is open with unsaved edits, Run all runs THAT draft too (in-memory).
  const r=await streamRun("/api/run",{path:current,profile:$("profile").value,fresh:!!fresh,input:collectInput(),overrides:draftOverride()});
  if(!r.ok){results={};renderGraph();return setMsg("canvasMsg","err",errs(r.data)||"run failed");}
}
let rawOn=false;
async function toggleRaw(){
  if(!rawOn)closeNodeNow();   // hide the panel when going to raw; drafts stay in memory
  rawOn=!rawOn;
  if(rawOn){const{data}=await api("/api/read?path="+encodeURIComponent(current));$("yaml").value=data.yaml||"";
    $("nodeView").classList.add("hidden");$("rawView").classList.remove("hidden");$("rawBtn").textContent="◧ nodes";}
  else{showNodes();loadNodes();}
}
function showNodes(){rawOn=false;$("rawView").classList.add("hidden");$("nodeView").classList.remove("hidden");$("rawBtn").textContent="{ } raw";}
async function saveRaw(){const{ok,data}=await api("/api/save",{method:"POST",body:JSON.stringify({path:current,yaml:$("yaml").value})});
  setMsg("rawMsg",ok?"ok":"err",ok?"saved ✓":errs(data));}
function setMsg(id,cls,t){const e=$(id);if(!e)return;e.className="msg "+cls;e.textContent=t;}

// ---- unsaved-edit tracking (auto-kept drafts, no leave guard) ----
// Any FLOW edit captures the open node's live fields as its draft (drafts[selected]).
// <input>/<select>/<textarea> raise input/change; button-driven edits (schema format/
// add/remove rows, programmatic prompt inserts) call markDirty() directly. Two controls
// are NOT flow edits and so must NOT mark a draft: the rename field (#pnId, commits on
// its own via renameSelected) and the input node's runtime test-value form (.paramin →
// inputVals, sent with each run like CLI --input, never saved to the flow).
function markDirty(){
  if(!selected)return;
  const n=nodes.find(x=>x.id===selected);if(!n)return;
  const was=!!drafts[selected];
  drafts[selected]=Object.fromEntries(panelFieldSets(n)); // the live edit IS the draft
  panelDirty=true;updateDirty();
  if(!was)renderGraph();   // first edit on this node → paint its ● marker on the canvas
}
function isFlowEdit(t){return t&&t.id!=="pnId"&&!(t.classList&&t.classList.contains("paramin"));}
$("modal").addEventListener("input",e=>{if(isFlowEdit(/** @type {any} */(e.target)))markDirty();});
$("modal").addEventListener("change",e=>{if(isFlowEdit(/** @type {any} */(e.target)))markDirty();});
// reflect dirty state: the footer "● 未儲存" chip + Save/Reset button emphasis. Optional
// ($ guards null), so it's safe to call before the elements exist.
function updateDirty(){
  const chip=$("pnDirty");if(chip)chip.classList.toggle("hidden",!panelDirty);
  const sb=$("pnSaveBtn");if(sb)sb.classList.toggle("dirty",panelDirty);
  const rb=$("pnResetBtn");if(rb)rb.classList.toggle("hidden",!panelDirty); // Reset only when there's a draft
}
// ↩ Reset — throw away THIS node's draft, re-render from the saved value. The only
// way to discard an edit now (leaving never discards — drafts are kept).
function resetNode(){
  if(!selected||!drafts[selected])return;
  delete drafts[selected];
  selectNode(selected);   // re-render from saved → panelDirty=false (no draft)
  renderGraph();           // drop the ● marker on the canvas
  setMsg("pnMsg","","reset to saved");
}
// close / Esc just hide the panel — the draft is KEPT, reopening restores it. No prompt.
function closeNode(){closeNodeNow();}
function trySelect(id){if(id!==selected)selectNode(id);}   // switching keeps both nodes' drafts
// last-ditch native guard for a genuine tab close / refresh — the only place a kept
// draft can actually be lost. Standard returnValue prompt, not a JS confirm().
window.addEventListener("beforeunload",e=>{if(Object.keys(drafts).length){e.preventDefault();e.returnValue="";}});
window.addEventListener("keydown",e=>{if(e.key!=="Escape")return;
  if(runAbort){stopRun();return;}   // Esc while running = Stop (before closing any panel)
  if(!$("modal").classList.contains("hidden"))closeNode();});
boot();

// Migration bridge: these handlers are still referenced by inline onclick= in
// app.html (and in runtime-generated card markup), so a module must expose them
// on window. Converting to addEventListener is the follow-up.
Object.assign(window,{listFlows,createFlow,back,toggleRaw,runAll,runNode,saveNode,deleteNode,closeNode,addNode,saveRaw,renameSelected,schedulePreview,insertVar,insertEarlier,runTo,setInputVal,onMergeMode,addParamRow,addSchemaRow,onSchemaFormat,toggleSchema,schemaPreview,changeType,markDirty,resetNode,zoomBy,zoomReset,zoomFit,stopRun,toggleRefs});
