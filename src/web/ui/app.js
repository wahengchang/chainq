// chain editor — single-page app logic, served as a native ES module (no build,
// no bundler). Extracted from app.html inline <script> so the UI is a real module
// file, not a blob inside HTML. Next steps (eng review): // @ts-check strictness
// and a canvas/panel/api split.

const $=(id)=>document.getElementById(id);
const api=(u,o)=>fetch(u,o).then(async r=>({ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))}));
const esc=s=>(s==null?"":String(s)).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const errs=d=>(d.errors||[]).map(e=>"✗ "+e.node+": "+e.message).join("\n");
const G={ran:"✓",cached:"⊘",failed:"✗",skipped:"–",pending:"○",running:"◌"};
// node-type display — collection operators (see the items model) get a symbol +
// accent so split/aggregate/merge read differently from per-item ai/cmd steps.
const TYPE_GLYPH={ai:"✦ ai",cmd:"$ cmd",assemble:"⊕ assemble",splitOut:"⤙ split out",aggregate:"⤚ aggregate",merge:"⋈ merge",input:"▶ input"};
const COLLECTION=new Set(["splitOut","aggregate","merge"]);
const typeChip=t=>'<span class="ntype'+(COLLECTION.has(t)?" col":"")+'">'+esc(TYPE_GLYPH[t]||t)+'</span>';
let current=null,nodes=[],selected=null,results={},previewTimer=null;
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
  if(!names.length)return '<span class="dim">no params — this input emits one empty item. Add params in { } raw.</span>';
  return '<div class="dim" style="margin-bottom:6px">runtime input — sent with each run, like CLI <code>--input</code> (not saved to the flow)</div>'
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
// transitive upstream of a node (its input cone)
function ancestors(id){const set=new Set();let stack=[...(nodes.find(n=>n.id===id)?.from||[])];
  while(stack.length){const c=stack.pop();if(set.has(c))continue;set.add(c);const n=nodes.find(x=>x.id===c);if(n)stack=stack.concat(n.from||[]);}return [...set];}
function setRunningUI(ids){ids.forEach(id=>results[id]={status:"running"});renderGraph();}
// a run rejected before it streams (e.g. a 400 from the input contract) must not
// leave nodes stuck spinning — drop the "running" placeholders we optimistically set.
function clearRunning(ids){ids.forEach(id=>{if(results[id]&&results[id].status==="running")delete results[id];});}

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
  setMsg("canvasMsg","","");nodes=data.nodes;renderGraph();
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
  const d=document.createElement("div");d.className="node "+(r?r.status:"")+(multi?" multi":"")+(col?" col":"");
  d.dataset.id=n.id;
  // ×N item-count badge: how many items this node emitted (items model). Shown
  // after a run streams the count back; hidden for the 1-in-1-out base case.
  const xn=(r&&r.items!=null&&r.items!==1)?'<span class="xn" title="items emitted on this wire">×'+r.items+'</span>':'';
  const glyph=r?('<span class="glyph g-'+r.status+(r.status==="running"?" spin":"")+'">'+G[r.status]+'</span>'):'<span class="glyph g-pending">○</span>';
  const BADGE={ran:"✓ ran · called the model",cached:"⊘ cached · reused, no call",failed:"✗ failed",skipped:"– skipped"};
  let out="";
  if(r&&r.status==="running")out='<div class="nodeout dim">◌ running…</div>';
  else if(r&&(r.error||r.output)){
    const badge='<div class="outbadge g-'+r.status+'">'+(BADGE[r.status]||r.status)+'</div>';
    out='<div class="nodeout'+(r.status==="failed"?" bad":"")+'">'+badge+esc(r.error||r.output)+'</div>';
  }
  const fromLine=(n.from||[]).length
    ? '<div class="npreview" style="color:var(--accent)">from ['+esc(n.from.join(", "))+']'+(multi?" ← 多輸入":"")+'</div>' : '';
  d.innerHTML='<div class="noderun-wrap">'
      +'<button class="noderun" title="run to here (reuse cache)" onclick="event.stopPropagation();runTo(\''+n.id+'\')">▷</button>'
      +'<button class="noderun" title="re-run fresh — really call the model" onclick="event.stopPropagation();runTo(\''+n.id+'\',true)">↻</button>'
    +'</div>'
    +'<div class="nh">'+glyph+'<span class="nn">'+esc(n.id)+'</span>'+xn+typeChip(n.type)+'</div>'
    +fromLine
    +'<div class="npreview">'+esc((n.prompt||n.run||"").slice(0,70))+'</div>'+out
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
  const base=wrap.getBoundingClientRect();
  const card=id=>wrap.querySelector('.node[data-id="'+CSS.escape(id)+'"]');
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
      const mx=(x1+x2)/2;
      paths+='<path d="M'+x1+','+y1+' C'+mx+','+y1+' '+mx+','+y2+' '+x2+','+y2+'" fill="none" stroke="var(--accent)" stroke-width="2" opacity="0.7"/>';
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
function nodeUnder(e){const el=document.elementFromPoint(e.clientX,e.clientY);return el?el.closest(".node"):null;}
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
// one delegated listener — the cards are rebuilt every render, the port isn't.
document.addEventListener("pointerdown",e=>{
  if(!e.target.closest)return;
  const port=e.target.closest(".port");
  if(port){const c=port.closest(".node");if(c)startConnect(c.dataset.id,e);return;}
  // body drag → reposition (not on a run button; only inside the canvas)
  const card=e.target.closest(".node");
  if(card&&!e.target.closest(".noderun")&&$("graph").contains(card))startMove(card.dataset.id,e);
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
  $("pnId").value=n.id;$("pnType").textContent=n.type;
  const isCmd=n.type==="cmd";
  $("pnPrompt").value=isCmd?(n.run||""):(n.prompt||"");
  $("pnFrom").value=(n.from||[]).join(", ");
  $("pnFromWrap").classList.toggle("hidden",n.type==="input"); // input is a trigger — no `from`
  // INPUT: an `input` trigger shows its params form (runtime values); any other
  // node shows each upstream's last output (click to insert into the prompt).
  const ups=n.from||[];
  $("pnInput").innerHTML = n.type==="input"
    ? renderParamsForm(n)
    : !ups.length
    ? '<span class="dim">no upstream — this is a start node</span>'
    : ups.map((u,i)=>{const r=results[u];const tag=i===0?'$json':('$node["'+u+'"]');
        const val=r?esc(r.output||r.error||"(empty)"):'<span class="dim">(run to see)</span>';
        return '<div class="infield" onclick="insertVar(\''+u+'\','+(i===0)+')" title="click to insert into the prompt">'
          +'<span class="ins">↵ insert</span><span class="intag">'+tag+'</span> ← '+u
          +'<div class="inval">'+val+'</div></div>';}).join("");
  // OUTPUT
  const ro=results[n.id];
  $("pnOut").className="mbody"+(ro&&ro.status==="failed"?" out err":(ro&&ro.status==="running"?" dim":(ro?"":" dim")));
  $("pnOut").textContent=ro?(ro.status==="running"?"running…":(ro.error||ro.output||"(empty)")):"Run to see this node's output.";
  const lab={ran:'<span class="g-ran">✓ ran · called the model</span>',cached:'<span class="g-cached">⊘ cached · reused, no call</span>',failed:'<span class="g-failed">✗ failed</span>',skipped:'<span class="g-skipped">– skipped</span>',running:'<span class="g-running">◌ running…</span>'};
  $("pnOutStatus").innerHTML=ro?(lab[ro.status]||""):"";
  $("pnTypeFields").innerHTML=renderTypeFields(n);   // P2-a: type-specific editor
  setMsg("pnMsg","","");renderPreview();
  if(n.type!=="input")loadItems(id);   // P1-b: show the per-item content (items model)
}
// P2-a: type-specific config the panel can set without dropping to raw YAML —
// splitOut/aggregate `field`, merge `mode`/`key`, cmd `mode`. ai/assemble/input
// have none here (assemble/ai edit `prompt`, input edits `params`).
function renderTypeFields(n){
  const opt=(cur,v)=>'<option value="'+v+'"'+(cur===v?" selected":"")+'>'+v+'</option>';
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
  else if(n.type==="ai"||n.type==="assemble"){sets.push(["prompt",$("pnPrompt").value]);}
  else if(n.type==="splitOut"||n.type==="aggregate"){if($("tfField"))sets.push(["field",$("tfField").value]);}
  else if(n.type==="merge"){if($("tfKey"))sets.push(["key",$("tfKey").value]);if($("tfMode"))sets.push(["mode",$("tfMode").value]);}
  for(const [f,v] of sets){
    const r=await api("/api/set",{method:"POST",body:JSON.stringify({path:current,node:selected,field:f,value:v})});
    if(!r.ok)return setMsg("pnMsg","err",errs(r.data)||"save failed");
  }
  if(n.type!=="input"){   // input is a trigger — it must not have a `from`
    const r=await api("/api/set-from",{method:"POST",body:JSON.stringify({path:current,node:selected,from:$("pnFrom").value})});
    if(!r.ok)return setMsg("pnMsg","err",errs(r.data)||"save failed");
  }
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
  setRunningUI(ids);
  const r=await streamRun("/api/run-node",{path:current,node:selected,profile:$("profile").value,fresh:!!force,input:collectInput()});
  if(!r.ok){clearRunning(ids);renderGraph();return setMsg("pnMsg","err",errs(r.data)||"run failed");}
}
// run-to-here straight from a node's ▷ button — runs inline, NO modal.
// The result shows on the card itself (see renderGraph). Click the card body
// (not ▷) if you want to open the editor panel.
async function runTo(id,fresh){
  const ids=[id,...ancestors(id)];
  setRunningUI(ids);
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
  setRunningUI(nodes.map(n=>n.id));
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
Object.assign(window,{listFlows,createFlow,back,toggleRaw,runAll,runNode,saveNode,deleteNode,closeNode,addNode,saveRaw,renameSelected,schedulePreview,insertVar,runTo,setInputVal,onMergeMode});
