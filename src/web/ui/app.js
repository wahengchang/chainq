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
    +'<button type="button" class="pf-del" title="remove field" onclick="this.closest(\'.paramrow\').remove()">×</button>'
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
function addParamRow(){const c=$("pnParams");if(c){c.insertAdjacentHTML("beforeend",paramRow());/** @type {any} */(c.lastElementChild).querySelector(".pf-name").focus();}}
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
async function open(path){current=path;selected=null;results={};inputVals={};layout={};manual=false;$("path").textContent=path;
  $("create").classList.add("hidden");$("editor").classList.remove("hidden");showNodes();await loadLayout();await loadNodes();}
// load saved node positions; any saved layout switches the canvas to free positioning.
async function loadLayout(){const{data}=await api("/api/layout?path="+encodeURIComponent(current));
  layout=(data&&data.layout)||{};manual=Object.keys(layout).length>0;}
function back(){$("editor").classList.add("hidden");$("create").classList.remove("hidden");listFlows();}

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
  const d=document.createElement("div");d.className="node "+(r?r.status:"")+(multi?" multi":"")+(col?" col":"")+(bad?" invalid":"");
  d.dataset.id=n.id;
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
    +'<div class="nh">'+typeBadge(n.type)+'<span class="nn">'+esc(n.id)+'</span>'+xn+glyph+typeChip(n.type)+'</div>'
    +fromLine
    +'<div class="npreview">'+esc((n.prompt||n.run||"").slice(0,70))+'</div>'+out+warnLine
    +'<div class="port" title="drag onto another node to connect →"></div>';
  d.onclick=()=>{if(connecting||movingNode)return;selectNode(n.id);}; // a drag (connect or reposition) must not also open the panel
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
  drawWires(svg,g);
}
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
    (n.from||[]).forEach(f=>{
      const fe=card(f);if(!fe)return;
      const fr=fe.getBoundingClientRect();
      const x1=fr.right-base.left,y1=fr.top+fr.height/2-base.top;
      const x2=tr.left-base.left, y2=tr.top+tr.height/2-base.top;
      const mx=(x1+x2)/2,my=(y1+y2)/2;
      paths+='<path d="M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2+'" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0.7"/>';
      // a "+" on each edge → insert a new step between source and target (#4).
      // Skip it if the midpoint would sit over a node (multi-column edges) — an
      // invisible button there would steal that node's clicks.
      const cx=base.left+mx,cy=base.top+my;
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
  const x1=sr.right-base.left,y1=sr.top+sr.height/2-base.top; // wrap-relative (matches drawWires)
  const temp=document.createElementNS("http://www.w3.org/2000/svg","path");
  temp.setAttribute("fill","none");temp.setAttribute("stroke","var(--accent)");
  temp.setAttribute("stroke-width","2");temp.setAttribute("stroke-dasharray","5,4");
  svg.appendChild(temp);connecting=true;g.classList.add("connecting");
  const move=e=>{
    const x2=e.clientX-base.left,y2=e.clientY-base.top,mx=(x1+x2)/2;
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
    if(c){const r=c.getBoundingClientRect();layout[n.id]={x:r.left-base.left,y:r.top-base.top};}});
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
    const nx=Math.max(0,start.x+(e.clientX-ox)),ny=Math.max(0,start.y+(e.clientY-oy));
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
  $("modal").classList.remove("hidden");
  $("pnId").value=n.id;$("pnType").innerHTML=typeBadge(n.type)+'<span style="margin-left:6px">'+esc(TYPE_GLYPH[n.type]||n.type)+'</span>';
  setTypeOptions(n);
  const isCmd=n.type==="cmd";
  $("pnPrompt").value=isCmd?(n.run||""):(n.prompt||"");
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
    // earlier steps = transitive upstreams not directly wired — their outputs, so
    // you can SEE every prior step's data. Lives in its own box so loadItems (which
    // owns #pnInput after a run) never clobbers it. read-only (wire one in to use).
    const earlier=[...ancestorIds(n.id)].filter(u=>!ups.includes(u));
    $("pnEarlier").innerHTML=earlier.length?'<div class="dim" style="margin-top:4px">earlier outputs (click to wire in + insert)</div>'
      +earlier.map(u=>{const r=results[u];const val=r?esc(r.output||r.error||"(empty)"):'<span class="dim">(run to see)</span>';
        return '<div class="infield" onclick="insertEarlier(\''+u+'\')" title="wire '+esc(u)+' into from: and insert {{ $node[&quot;'+esc(u)+'&quot;] }} at the cursor">'
          +'<span class="ins">↵ wire + insert</span><span class="intag">'+esc(u)+'</span><div class="inval">'+val+'</div></div>';}).join(""):"";
  }
  // OUTPUT
  const ro=results[n.id];
  // while a node is queued or running its OLD output is stale — never show it as
  // if it were this run's result. Dim + a status line; the real output replaces it
  // when onResult streams back (and loadItems is guarded the same way).
  const busy=ro&&(ro.status==="running"||ro.status==="pending");
  $("pnOut").className="mbody"+(ro&&ro.status==="failed"?" out err":(busy?" dim":(ro?"":" dim")));
  $("pnOut").textContent=ro?(ro.status==="running"?"running…":(ro.status==="pending"?"queued — waiting its turn…":(ro.error||ro.output||"(empty)"))):"Run to see this node's output.";
  const lab={ran:'<span class="g-ran">✓ ran · called the model</span>',cached:'<span class="g-cached">⊘ cached · reused, no call</span>',failed:'<span class="g-failed">✗ failed</span>',skipped:'<span class="g-skipped">– skipped</span>',running:'<span class="g-running"><span class="spin">◌</span> running…</span>',pending:'<span class="g-pending">○ queued…</span>'};
  $("pnOutStatus").innerHTML=ro?(lab[ro.status]||""):"";
  $("pnTypeFields").innerHTML=renderTypeFields(n);   // P2-a: type-specific editor
  if(invalid[id])setMsg("pnMsg","err","⚠ "+invalid[id]);else setMsg("pnMsg","","");
  renderPreview();
  if(n.type!=="input")loadItems(id);   // P1-b: show the per-item content (items model)
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
  if(n.type==="ai"){
    // schema is an OPTIONAL advanced field — keep it folded so the common case
    // (just a prompt) stays uncluttered. Default collapsed; auto-open when this
    // node already has a schema so an existing contract is never hidden.
    const hasSchema=!!n.schema;
    return '<details id="tfSchemaFold" class="fold"'+(hasSchema?' open':'')+'>'
      +'<summary>schema — structured output (optional, JSON field→type)'+(hasSchema?' <span class="dim">· set</span>':'')+'</summary>'
      +'<textarea id="tfSchema" spellcheck="false" placeholder=\'{ "text": "string", "n": "number" }\' '
      +'style="width:100%;height:54px;margin-top:4px;box-sizing:border-box;font:inherit">'+esc(n.schema?JSON.stringify(n.schema):"")+'</textarea>'
      +'<div class="dim" style="font-size:11px;margin-top:4px">if set: output is parsed + validated as JSON; a mismatch retries once, then fails</div>'
      +'</details>';
  }
  return "";
}
function onMergeMode(){const w=$("tfKeyWrap");if(w)w.classList.toggle("hidden",$("tfMode").value!=="byKey");}
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
function closeNode(){selected=null;$("modal").classList.add("hidden");}
async function saveNode(){
  const n=nodes.find(x=>x.id===selected);if(!n)return;
  // each node type owns different fields — write exactly those, not always prompt.
  // (key before mode for merge: setting mode=byKey while key is unset would be a
  // NEW validate error and get rejected, leaving mode unsaved.)
  const sets=[];
  if(n.type==="cmd"){sets.push(["run",$("pnPrompt").value]);if($("tfMode"))sets.push(["mode",$("tfMode").value]);}
  else if(n.type==="assemble"){sets.push(["prompt",$("pnPrompt").value]);}
  else if(n.type==="ai"){
    sets.push(["prompt",$("pnPrompt").value]);
    const sv=$("tfSchema")?$("tfSchema").value.trim():"";
    if(sv){let obj;try{obj=JSON.parse(sv);}catch(e){return setMsg("pnMsg","err","schema is not valid JSON");}sets.push(["schema",obj]);}
    else if(n.schema)sets.push(["schema",null]); // had a schema, now cleared → remove (parse drops null)
  }
  else if(n.type==="splitOut"||n.type==="aggregate"){if($("tfField"))sets.push(["field",$("tfField").value]);}
  else if(n.type==="merge"){if($("tfKey"))sets.push(["key",$("tfKey").value]);if($("tfMode"))sets.push(["mode",$("tfMode").value]);}
  else if(n.type==="write"){if($("tfPath"))sets.push(["path",$("tfPath").value]);if($("tfMode"))sets.push(["mode",$("tfMode").value]);}
  else if(n.type==="input"){if($("pnParams"))sets.push(["params",collectParams()]);}
  for(const [f,v] of sets){
    const r=await api("/api/set",{method:"POST",body:JSON.stringify({path:current,node:selected,field:f,value:v})});
    if(!r.ok)return setMsg("pnMsg","err",errs(r.data)||"save failed");
  }
  // wiring is no longer typed here — it's managed live on the canvas + the input
  // chips (× to disconnect), so Save only writes this node's own fields.
  await loadNodes();selectNode(selected);
  setMsg("pnMsg","ok","saved ✓");   // after the re-render (selectNode clears pnMsg) so it actually shows
}
// read an NDJSON stream, calling onNode for each node result as it arrives
async function streamRun(url,bodyObj){
  const r=await fetch(url,{method:"POST",body:JSON.stringify(bodyObj)});
  if(!r.ok)return{ok:false,data:await r.json().catch(()=>({}))};
  const reader=r.body.getReader(),dec=new TextDecoder();let buf="";
  while(true){const{done,value}=await reader.read();if(done)break;
    buf+=dec.decode(value,{stream:true});let i;
    while((i=buf.indexOf("\n"))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+1);if(line){try{onNode(JSON.parse(line));}catch(e){}}}}
  return{ok:true};
}
function onNode(rec){
  if(rec.error&&!rec.id){setMsg("canvasMsg","err",rec.error);return;}
  results[rec.id]={status:rec.status,output:rec.output,error:rec.error,items:rec.items};
  renderGraph();                       // each node flips the instant it finishes
  if(selected===rec.id)selectNode(selected);
}
async function runNode(force){
  if(!selected)return;
  $("pnOut").className="mbody dim";$("pnOut").textContent="running…";$("pnOutStatus").innerHTML='<span class="g-running">◌ running…</span>';
  const ids=[selected,...ancestors(selected)];
  setPendingUI(ids);
  const r=await streamRun("/api/run-node",{path:current,node:selected,profile:$("profile").value,fresh:!!force,input:collectInput()});
  if(!r.ok){clearRunning(ids);renderGraph();return setMsg("pnMsg","err",errs(r.data)||"run failed");}
}
// run-to-here straight from a node's ▷ button — runs inline, NO modal.
// The result shows on the card itself (see renderGraph). Click the card body
// (not ▷) if you want to open the editor panel.
async function runTo(id,fresh){
  const ids=[id,...ancestors(id)];
  setPendingUI(ids);
  const r=await streamRun("/api/run-node",{path:current,node:id,profile:$("profile").value,fresh:!!fresh,input:collectInput()});
  if(!r.ok){clearRunning(ids);renderGraph();return setMsg("canvasMsg","err",errs(r.data)||"run failed");}
}
// click a variable in INPUT → insert it into the prompt at the cursor (no typos)
function insertVar(id,primary){
  const expr=primary?'{{ $json }}':'{{ $node["'+id+'"] }}';
  const ta=$("pnPrompt");const s=ta.selectionStart??ta.value.length,e=ta.selectionEnd??s;
  ta.value=ta.value.slice(0,s)+expr+ta.value.slice(e);
  ta.focus();ta.selectionStart=ta.selectionEnd=s+expr.length;
  schedulePreview();
}
// click an EARLIER (transitive, not-yet-wired) output → wire it into `from:` AND
// insert {{ $node["id"] }} in one move. The reference is invalid until the node
// is wired (validate.ts), so a bare insert would render to a broken prompt — so
// we append it to `from` (NOT as primary: $json stays the first input) first.
// Wiring reloads + re-renders the panel, which would reset #pnPrompt to the saved
// value — so we capture the live text + cursor and any UNSAVED edits BEFORE the
// reload and restore them with the reference spliced in, matching insertVar's
// "never lose what you typed" behaviour.
async function insertEarlier(u){
  const n=nodes.find(x=>x.id===selected);if(!n)return;
  if((n.from||[]).includes(u))return insertVar(u,false); // already wired — plain insert
  const ta=$("pnPrompt");const expr='{{ $node["'+u+'"] }}';
  const s=ta.selectionStart??ta.value.length,e=ta.selectionEnd??s;
  const next=ta.value.slice(0,s)+expr+ta.value.slice(e),caret=s+expr.length;
  const from=[...(n.from||[]),u];
  const{ok,data}=await api("/api/connect",{method:"POST",body:JSON.stringify({path:current,node:selected,from})});
  if(!ok)return setMsg("pnMsg","err",errs(data)||"wire failed");
  await loadNodes();selectNode(selected);
  const t2=$("pnPrompt");t2.value=next;t2.focus();t2.selectionStart=t2.selectionEnd=caret;
  schedulePreview();
  setMsg("pnMsg","ok","wired "+u+" in · inserted reference — Save to keep");
}
async function deleteNode(){
  if(!selected)return;
  const{ok,data}=await api("/api/delete-node",{method:"POST",body:JSON.stringify({path:current,node:selected})});
  if(!ok)return setMsg("pnMsg","err",errs(data)||"delete failed");
  closeNode();await loadNodes();
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
  setPendingUI(nodes.map(n=>n.id));
  const r=await streamRun("/api/run",{path:current,profile:$("profile").value,fresh:!!fresh,input:collectInput()});
  if(!r.ok){results={};renderGraph();return setMsg("canvasMsg","err",errs(r.data)||"run failed");}
}
let rawOn=false;
async function toggleRaw(){rawOn=!rawOn;
  if(rawOn){const{data}=await api("/api/read?path="+encodeURIComponent(current));$("yaml").value=data.yaml||"";
    $("nodeView").classList.add("hidden");$("rawView").classList.remove("hidden");$("rawBtn").textContent="◧ nodes";}
  else{showNodes();loadNodes();}
}
function showNodes(){rawOn=false;$("rawView").classList.add("hidden");$("nodeView").classList.remove("hidden");$("rawBtn").textContent="{ } raw";}
async function saveRaw(){const{ok,data}=await api("/api/save",{method:"POST",body:JSON.stringify({path:current,yaml:$("yaml").value})});
  setMsg("rawMsg",ok?"ok":"err",ok?"saved ✓":errs(data));}
function setMsg(id,cls,t){const e=$(id);if(!e)return;e.className="msg "+cls;e.textContent=t;}
window.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("modal").classList.contains("hidden"))closeNode();});
boot();

// Migration bridge: these handlers are still referenced by inline onclick= in
// app.html (and in runtime-generated card markup), so a module must expose them
// on window. Converting to addEventListener is the follow-up.
Object.assign(window,{listFlows,createFlow,back,toggleRaw,runAll,runNode,saveNode,deleteNode,closeNode,addNode,saveRaw,renameSelected,schedulePreview,insertVar,insertEarlier,runTo,setInputVal,onMergeMode,addParamRow,changeType});
