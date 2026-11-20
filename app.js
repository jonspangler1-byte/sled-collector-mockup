(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const MAKERS=window.MAKERS_RAW.map(r=>({id:r[0],name:r[1],type:r[2],years:r[3],models:r[4],area:r[5],book:r[6],p:window.PROFILES[r[0]]||null}));
const M=id=>MAKERS.find(m=>m.id==id);
const FREE=window.FREE_MAKERS||{};
const isFree=m=>!!m&&Object.prototype.hasOwnProperty.call(FREE,m.id);
const disp=m=>m?(FREE[m.id]||(window.MAKER_LABELS||{})[m.id]||m.name):"Unknown maker";
const companyOf=m=>m&&(window.COMPANIES||[]).find(c=>c.brands.some(b=>b.maker==m.id));
const brandsOf=m=>{const c=companyOf(m);return c?c.brands.filter(b=>b.maker==m.id):[]};
const brandBox=m=>{const c=companyOf(m);if(!c)return "";const seen={};
  return `<h3 class="sec">Company & brands</h3><div class="card brandbox"><div class="bb-h"><b>${esc(c.name)}</b><div class="small muted">${esc(c.note)}</div></div>${c.brands.map(b=>{const bm=M(b.maker),here=b.maker==m.id,lk=!premium()&&!isFree(bm);
   return `<a class="bb-r${here?" here":""}" href="#/maker/${b.maker}"><span class="tx"><span class="n">${esc(b.name)}</span><span class="small muted"> · matrix #${b.maker}${here?" · this page":""}</span></span>${isFree(bm)?'<span class="free-pill">Free</span>':(lk?'<span class="lock-pill">🔒 Premium</span>':'<span class="lock-pill">Premium</span>')}</a>`}).join("")}</div>`};
const models=m=>(window.MODELS||{})[m.id]||[];
const mImgs=x=>x.imgs&&x.imgs.length?x.imgs:(x.img?[x.img]:[]);
const firstSentence=t=>{const m=t.match(/^.*?(?:[a-z0-9)”"]{3}|\d)\.(?=\s+[A-Z“"])/);return m?m[0]:t};
const canSell=()=>premium(); // posting sleds AND sale ads now requires paid membership (Jonathan, 18 Nov 2026)
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem("svc_"+k))??d}catch(e){return d}},set:(k,v)=>localStorage.setItem("svc_"+k,JSON.stringify(v))};
// Photo store (fix 19 Nov 2026): photos go to IndexedDB, which has far more room than localStorage (~5 MB on
// iPhone Safari). Saved sleds keep "idb:<key>" refs. Older posts with inline photos are left as they are; they
// are only moved into IndexedDB (written there first, then the ref swapped in) if localStorage runs out of room.
const PH={db:null,cache:new Map(),rev:new Map()};
function phOpen(){return new Promise(res=>{try{const r=indexedDB.open("svc_photos",1);r.onupgradeneeded=()=>r.result.createObjectStore("p");r.onsuccess=()=>res(r.result);r.onerror=r.onblocked=()=>res(null)}catch(e){res(null)}})}
function phLoadAll(db){return new Promise(res=>{try{const rq=db.transaction("p","readonly").objectStore("p").openCursor();rq.onsuccess=()=>{const c=rq.result;if(c){PH.cache.set(c.key,c.value);PH.rev.set(c.value,c.key);c.continue()}else res()};rq.onerror=()=>res()}catch(e){res()}})}
function phPut(entries){return new Promise((res,rej)=>{try{const tx=PH.db.transaction("p","readwrite"),st=tx.objectStore("p");entries.forEach(([k,v])=>st.put(v,k));tx.oncomplete=()=>res();tx.onerror=tx.onabort=()=>rej(tx.error||new Error("photo store failed"))}catch(e){rej(e)}})}
const phURL=u=>typeof u==="string"&&u.startsWith("idb:")?(PH.cache.get(u.slice(4))||""):u;
async function storePics(list){if(!PH.db)return list;const out=[],put=[];
  list.forEach((u,i)=>{if(typeof u==="string"&&u.startsWith("data:")){let k=PH.rev.get(u);if(!k){k="p"+Date.now().toString(36)+i+Math.random().toString(36).slice(2,7);put.push([k,u])}out.push("idb:"+k)}else out.push(u)});
  if(put.length){await phPut(put);put.forEach(([k,v])=>{PH.cache.set(k,v);PH.rev.set(v,k)})}return out}
const isQuota=e=>!!e&&(e.name==="QuotaExceededError"||e.code===22||e.code===1014||/quota/i.test(String(e.message||e)));
async function migrateInlinePhotos(){if(!PH.db)return false;let moved=false;
  const fix=async arr=>{for(const x of arr){if(x&&Array.isArray(x.imgs)&&x.imgs.some(u=>String(u).startsWith("data:"))){x.imgs=await storePics(x.imgs);x.img=x.imgs[0];moved=true}else if(x&&String(x.img||"").startsWith("data:")){x.img=(await storePics([x.img]))[0];moved=true}}};
  const sl=LS.get("sleds",[]),li=LS.get("listings",[]),ed=LS.get("edits",{}),le=LS.get("ledits",{});
  await fix(sl);await fix(li);await fix(Object.values(ed));await fix(Object.values(le));
  if(moved){LS.set("sleds",sl);LS.set("listings",li);LS.set("edits",ed);LS.set("ledits",le)}return moved}
async function lsSave(fn){try{fn()}catch(e){if(!isQuota(e))throw e;if(await migrateInlinePhotos()){fn();return}throw e}}
function saveErr(e){console.error(e);toast(isQuota(e)?"Couldn't save: this phone's storage for the app is full. Nothing was lost. Try fewer photos, or tell Sled Finder.":"Couldn't save: "+(e&&e.message||e),6000)}
// Demo roles: free (never paid), premium (paid member), lapsed (membership ran out), admin (Jonathan / Sled Finder).
const ROLES={free:"Free (never paid)",premium:"Paid member",lapsed:"Membership lapsed",admin:"Admin · Sled Finder (Jonathan)"};
const role=()=>{const r=LS.get("role",null);return ROLES[r]?r:(LS.get("premium",false)?"premium":"free")};
const setRole=r=>{LS.set("role",r);LS.set("premium",r==="premium"||r==="admin")};
const premium=()=>{const r=role();return r==="premium"||r==="admin"};
const isAdmin=()=>role()==="admin";
const lapsed=()=>role()==="lapsed";
const userSleds=()=>LS.get("sleds",[]);
const normPics=s=>{const o=Object.assign({},s);o.imgs=(o.imgs&&o.imgs.length?o.imgs:(o.img?[o.img]:[])).map(phURL).filter(Boolean);o.img=o.imgs[0]||"";o.years=o.years||o.year||"Unknown";return o};
const allSleds=()=>{const ov=LS.get("edits",{}),del=LS.get("deleted",[]);return userSleds().concat(window.SAMPLE_SLEDS.map(s=>ov[s.id]?Object.assign({},s,ov[s.id]):s)).filter(s=>!del.includes(s.id)).map(normPics)};
const allListings=()=>{const ov=LS.get("ledits",{}),del=LS.get("ldeleted",[]);return LS.get("listings",[]).concat(window.SALE_LISTINGS.map(l=>ov[l.id]?Object.assign({},l,ov[l.id]):l)).filter(l=>!del.includes(l.id)).map(normPics)};
// Grouping: each submission is its own record (one user, one location); same maker + model are grouped for display.
const modelKey=s=>s.maker+"|"+String(s.model||"").toLowerCase().replace(/[“”"']/g,"").replace(/\s+/g," ").trim();
const sameModel=s=>allSleds().filter(x=>modelKey(x)===modelKey(s)&&(x.shared||isOwn(x)));
// Swipeable gallery with dots; locked items show the lock tile instead.
const gallery=(imgs,locked)=>locked?lockedPh("detail-ph"):(imgs.length<2?`<div class="detail-ph" style="background-image:url('${imgs[0]||""}')"></div>`:
  `<div class="gal"><div class="gal-track">${imgs.map((u,i)=>`<div class="detail-ph gal-slide" style="background-image:url('${u}')" aria-label="Photo ${i+1} of ${imgs.length}"></div>`).join("")}</div><div class="gal-count">1 / ${imgs.length}</div><div class="dots">${imgs.map((u,i)=>`<i class="${i?"":"on"}"></i>`).join("")}</div></div>`);
function bindGalleries(){document.querySelectorAll(".gal").forEach(g=>{const t=g.querySelector(".gal-track"),d=[...g.querySelectorAll(".dots i")],c=g.querySelector(".gal-count");
  t.onscroll=()=>{const i=Math.round(t.scrollLeft/t.clientWidth);d.forEach((x,j)=>x.classList.toggle("on",j===i));c.textContent=(i+1)+" / "+d.length};
  d.forEach((x,j)=>x.onclick=()=>t.scrollTo({left:j*t.clientWidth,behavior:"smooth"}))})}
// Multi-photo picker: real file upload (resized in the browser) plus demo photos. First photo = cover.
function resizeFile(file){return new Promise(res=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,1000/Math.max(im.width,im.height));const c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.72))};im.src=r.result};r.readAsDataURL(file)})}
const pickerHTML=(id,req)=>`<div class="picker" id="${id}"><div class="pk-thumbs"></div><div class="row2"><label class="btn pk-up">📷 Add photos${req?" *":""}<input type="file" accept="image/*" multiple hidden></label><button type="button" class="btn pk-demo">＋ Demo photo</button></div><small class="muted pk-help">Add several photos. The first one is the cover; tap a photo to make it the cover.</small></div>`;
function picker(id,initial,demo){const root=$("#"+id),T=root.querySelector(".pk-thumbs");let pics=(initial||[]).slice();
  const draw=()=>{T.innerHTML=pics.map((u,i)=>`<div class="pk-t" data-i="${i}" style="background-image:url('${u}')">${i===0?'<span class="pk-cover">Cover</span>':""}<button type="button" class="pk-x" data-x="${i}" aria-label="Remove">×</button></div>`).join("")||'<div class="pk-empty">No photos yet</div>';
    T.querySelectorAll(".pk-x").forEach(b=>b.onclick=e=>{e.stopPropagation();pics.splice(+b.dataset.x,1);draw()});
    T.querySelectorAll(".pk-t").forEach(t=>t.onclick=()=>{const i=+t.dataset.i;if(i){const [p]=pics.splice(i,1);pics.unshift(p);draw();toast("Cover photo set")}})};
  root.querySelector("input[type=file]").onchange=async e=>{for(const f of [...e.target.files].slice(0,10)){pics.push(await resizeFile(f))}e.target.value="";draw()};
  root.querySelector(".pk-demo").onclick=()=>{const left=demo.filter(u=>!pics.includes(u));pics.push(left.length?left[0]:demo[Math.floor(Math.random()*demo.length)]);draw();toast("Demo photo added (sample image)")};
  draw();return ()=>pics.slice()}
// Editing rule: Admin (Sled Finder) can edit/delete ANY submission or sale ad. Paid members only their OWN. Maker histories are never user-editable.
const canEdit=item=>!!item&&(isAdmin()||(!!(item.mine||item.userAdded)&&premium()));
function saveSled(s){if(String(s.id).startsWith("u")){const u=userSleds().map(x=>x.id===s.id?s:x);LS.set("sleds",u)}else{const ov=LS.get("edits",{});ov[s.id]=s;LS.set("edits",ov)}}
function saveListing(l){if(String(l.id).startsWith("ul")){LS.set("listings",LS.get("listings",[]).map(x=>x.id===l.id?l:x))}else{const ov=LS.get("ledits",{});ov[l.id]=l;LS.set("ledits",ov)}}
function deleteListing(id){if(String(id).startsWith("ul")){LS.set("listings",LS.get("listings",[]).filter(x=>x.id!==id))}else{const d=LS.get("ldeleted",[]);d.push(id);LS.set("ldeleted",d)}}
function deleteSled(id){if(String(id).startsWith("u")){LS.set("sleds",userSleds().filter(x=>x.id!==id))}else{const d=LS.get("deleted",[]);d.push(id);LS.set("deleted",d)}}
const editBar=(item,editHref,kind)=>{const own=!!(item.mine||item.userAdded);
  const btns=lbl=>`<div class="row2"><a class="btn" href="${editHref}">✎ ${lbl}</a><button class="btn" data-del="${item.id}" data-kind="${kind}" style="color:var(--red);border-color:var(--red)">Delete</button></div>`;
  if(isAdmin())return btns(own?"Edit "+kind:"Admin edit")+(own?"":'<p class="legend" style="margin:6px 0 0;padding:0">Admin (Sled Finder): you can correct or remove any post or ad for accuracy.</p>');
  if(!own)return "";
  return premium()?btns("Edit "+kind):`<a class="btn" href="#/upgrade">🔒 ${lapsed()?"Renew":"Upgrade"} to edit your submissions</a>`};
const editedNote=x=>x&&x.editedBy?`<span class="edited">✎ Edited by ${esc(x.editedBy)}</span>`:"";
// Membership gate: posting and viewing the Sled Maker and Model Database require paid membership.
const lapsedText=n=>`Your membership has lapsed. ${n?`Your ${n} earlier post${n==1?"":"s"} stay`:"Your earlier posts stay"} in Sled Finder and come back as soon as you renew.`;
const gate=(title,text)=>`<div class="gate"><div class="gl">🔒</div><b>${title}</b><p>${text}</p><a class="btn gold" href="#/upgrade">${lapsed()?"Renew membership · $15/yr":"Join · $15/yr"}</a><a class="small" href="#/terms">Terms &amp; Community Guidelines (draft)</a></div>`;
const databaseGate=()=>gate(lapsed()?"Membership lapsed":"The Sled Maker and Model Database is for members",lapsed()?lapsedText(0)+" Renew to see the Sled Maker and Model Database again.":"Subscribers (paid members) can view and add their sleds, and search and map others' sleds. Free members can still browse the free makers' galleries and Sleds for Sale.");
const dbIntro=()=>`<h3 class="sec" id="database">Sled Maker and Model Database</h3><p class="legend">Subscribers (paid members) can view and add their sleds, and search and map others' sleds.</p><p class="legend db-links"><a href="#/identify">📷 Photo ID${premium()?"":" 🔒"}</a><a href="#/map">🗺 Sled Picker Map${premium()?"":" 🔒"}</a><a href="#/search">Search</a>${premium()?'<a href="#/add">＋ Add a sled</a>':""}</p>`;
const ackHTML=()=>`<label class="ack"><input type="checkbox" name="ack" required><span>I agree my post and photos become part of Sled Finder and may be edited or removed by Sled Finder for accuracy. <a href="#/terms" target="_blank">Read the Terms</a></span></label>`;
// Maker on a post: a real maker id, or 0 = unknown with an optional custom text ("Likely Pratt").
const mk=s=>s&&+s.maker?disp(M(s.maker)):(s&&s.makerText?s.makerText+" (unconfirmed)":"Unknown maker");
const makerFields=(id,E)=>`<label>Maker<select name="maker" id="${id}"><option value="0">Unknown maker</option><option value="custom">Custom…</option>${makerOpts()}</select></label>
  <label class="${E&&!+E.maker&&E.makerText?"":"hide"}" id="${id}-cw">Custom maker<input name="makerText" value="${esc(E&&E.makerText||"")}" placeholder="e.g. Likely Pratt or Kalamazoo"><small class="hint">Saved as typed and shown as unconfirmed. Sled Finder may reassign it later.</small></label>`;
function bindMaker(id,E){const s=$("#"+id),w=$("#"+id+"-cw");if(E)s.value=+E.maker?E.maker:(E.makerText?"custom":"0");const f=()=>w.classList.toggle("hide",s.value!=="custom");s.onchange=f;f()}
const makerVals=f=>{const v=f.get("maker");return v==="custom"?{maker:0,makerText:String(f.get("makerText")||"").trim()}:{maker:+v,makerText:""}};
const liked=()=>LS.get("liked",{});
document.title=window.APP_NAME+" — clickable mockup";
$("#sideTitle").textContent=window.APP_NAME;

function toast(t,ms){const e=$("#toast");e.textContent=t;e.classList.add("show");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("show"),ms||1900)}
function bar(title,{back=false,sub="",act=""}={}){
  $("#appbar").innerHTML=(back?'<button class="back" onclick="history.length>1?history.back():location.hash=\'#/home\'" aria-label="Back">‹</button>':"")+
  '<h2>'+esc(title)+(sub?'<span class="sub">'+esc(sub)+'</span>':"")+'</h2>'+(isAdmin()?'<span class="badge-prem">Admin</span>':premium()?'<span class="badge-prem">Premium</span>':(lapsed()?'<span class="badge-prem" style="background:#b9a98c">Lapsed</span>':""))+act;
}
function tab(t){document.querySelectorAll(".tabbar a").forEach(a=>a.classList.toggle("on",a.dataset.tab===t))}
const isOwn=s=>!!(s.mine||s.userAdded);
const hidden=s=>{const m=M(s.maker);return !premium()&&!isOwn(s)&&!!m&&!isFree(m)};
const lockedPh=(cls,tag="a")=>`<${tag} class="${cls} lockph"${tag==="a"?' href="#/upgrade"':""}><span class="lk">🔒</span><span class="lt">Premium maker. Upgrade to see</span></${tag}>`;
const tileHref=s=>hidden(s)?"#/upgrade":"#/sled/"+s.id;
const tileTh=s=>hidden(s)?lockedPh("th","div"):`<div class="th" style="background-image:url('${s.img}')"></div>`;
const groupList=(arr,cur,showMk)=>`<div class="list card">${arr.map(x=>`<a class="mrow" href="${tileHref(x)}"><span class="gthumb">${hidden(x)?'<span class="glk">🔒</span>':`<span style="background-image:url('${x.img}')"></span>`}</span><span class="tx"><div class="n">@${esc(x.user)}${x.id===cur?" · this entry":""}${isOwn(x)?" (you)":""}</div>${showMk?`<div class="d">${esc(mk(x))} · ${esc(x.model)}</div>`:""}<div class="d">📅 ${esc(x.years)} · 📍 ${esc(x.locType==="na"?"Location NA":(x.town||"—"))} · ${x.imgs.length} photo${x.imgs.length==1?"":"s"}${hidden(x)?" · Premium maker":""}</div></span><span class="lk">›</span></a>`).join("")}</div>`;
const nudge=s=>{const m=+s.maker&&M(s.maker);return isOwn(s)&&m&&!isFree(m)&&!premium()?`<a class="nudge" href="#/upgrade">🔒 Unlock the full history of ${esc(disp(m))} →</a>`:""};
const makerName=id=>disp(M(id));
const sampleTag=s=>s.user&&!s.userAdded?' <span class="sample-tag">Example data</span>':"";
const initials=u=>u.replace(/[^a-z]/gi," ").trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();

function postCard(s){
  const L=liked()[s.id];
  return `<article class="card post">${hidden(s)?lockedPh("ph"):`<a href="#/sled/${s.id}"><div class="ph" style="background-image:url('${s.img}')">${s.imgs&&s.imgs.length>1?`<span class="pcount">▣ ${s.imgs.length}</span>`:""}</div></a>`}
  <div class="meta"><div class="who"><span class="av">${initials(s.user)}</span>@${esc(s.user)}${sampleTag(s)}</div>
  <a href="#/sled/${s.id}" style="text-decoration:none"><div class="t">${esc(mk(s))} ${esc(s.model)}</div>
  <div class="m">Est. ${esc(s.years)} · ${esc(s.condition)}${s.town&&s.locType!=="na"?" · 📍 "+esc(s.town):""}</div></a>${editedNote(s)}${nudge(s)}
  <div class="bar"><button data-like="${s.id}">${L?"♥":"♡"} ${s.likes+(L?1:0)}</button><span>💬 Comment</span><span>↗ Share</span></div></div></article>`;
}
function bindLikes(){document.querySelectorAll("[data-like]").forEach(b=>b.onclick=()=>{const l=liked();l[b.dataset.like]=!l[b.dataset.like];LS.set("liked",l);route()})}

const R={};
const STATE_NAMES={"illinois":"IL","wisconsin":"WI","michigan":"MI","indiana":"IN","iowa":"IA","minnesota":"MN","ohio":"OH","pennsylvania":"PA","new york":"NY","maine":"ME","massachusetts":"MA","california":"CA","texas":"TX","colorado":"CO","missouri":"MO"};
async function geocode(city,state,zip){
  city=(city||"").trim();state=(state||"").trim();zip=(zip||"").trim();
  let st=state.length>2?(STATE_NAMES[state.toLowerCase()]||state.toUpperCase()):state.toUpperCase();
  const key=(city+", "+st).toLowerCase();
  if(city&&window.TOWN_COORDS[key])return {lat:window.TOWN_COORDS[key][0],lng:window.TOWN_COORDS[key][1],how:"table"};
  try{ // low-volume Nominatim fallback (mockup only), rounded to town level
    const q=zip?`postalcode=${encodeURIComponent(zip)}`:`city=${encodeURIComponent(city)}&state=${encodeURIComponent(st)}`;
    if(zip||city){const ac=window.AbortController?new AbortController():null;const to=setTimeout(()=>ac&&ac.abort(),4000);const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&${q}`,{headers:{"Accept":"application/json"},signal:ac?ac.signal:undefined});clearTimeout(to);
      const j=await r.json();if(j&&j[0])return {lat:Math.round(+j[0].lat*100)/100,lng:Math.round(+j[0].lon*100)/100,how:"nominatim"};}
  }catch(e){}
  if(window.STATE_CENTROIDS[st])return {lat:window.STATE_CENTROIDS[st][0],lng:window.STATE_CENTROIDS[st][1],how:"state"};
  return null;
}
const locLine=s=>s.locType==="na"?"Unknown / NA (no map pin)":(s.town?`${s.locType==="now"?"Now in":"Found in"} ${s.town}`:"");
const makerOpts=()=>MAKERS.slice().sort((a,b)=>disp(a).localeCompare(disp(b))).map(m=>`<option value="${m.id}">${esc(disp(m))}</option>`).join("");
function teaser(m){
  const p=m.p, ms=models(m);
  const line=p&&p.text?firstSentence(p.text[0]):"[History coming soon] No written history for this maker yet.";
  const ml=(m.models||"").split(/,\s*/).filter(Boolean);
  return `<div class="teaser"><p class="eyebrow" style="margin:0 0 6px">From the Premium profile 🔒</p>
  <p class="t1">${esc(line)}</p><p class="t2">${esc(p&&p.text?(p.text.slice(1).join(" ")||"More history, dates and sources in Premium."):"Premium will add the company history as it is researched.")}</p>
  ${ml.length?`<div class="mlist"><b>Models (${ml.length})</b>${ml.map((x,i)=>`<span class="${i>0?"bl":""}">${esc(i>0?"████████":x)}</span>`).join("")}</div>`:""}
  ${p&&(p.ad||p.img)?`<div class="tad" style="background-image:url('${p.ad||p.img}')"><span>🔒 Period ad &amp; photos</span></div>`:""}
  <a class="btn gold" href="#/upgrade" style="margin-top:10px">Unlock ${esc(disp(m))} · $15/yr</a></div>`;
}
R.home=()=>{bar(window.APP_SHORT,{sub:"Rosebud Sled Museum",act:'<a class="act" href="#/search" aria-label="Search">⌕</a>'});tab("home");
  const feed=allSleds().filter(s=>s.shared);
  const free=MAKERS.filter(isFree);
  return `<div class="hero" style="background-image:url(images/hero-flexible-flyer-3c-deck-p60.jpg)"><div class="in"><b>Coasting Through History</b><span>American sled makers, 1850–1990 · tap for the timeline</span></div><a href="#/timeline" style="position:absolute;inset:0;z-index:2" aria-label="Timeline"></a></div>
  <div class="chips"><a class="chip on" href="#/database">Sled Maker and Model Database</a><a class="chip" href="#/identify">📷 Photo ID ${premium()?"":"🔒"}</a><a class="chip" href="#/idhelp">What sled is this?</a><a class="chip" href="#/map">🗺 Sled Picker Map ${premium()?"":"🔒"}</a><a class="chip" href="#/sale">Sleds for Sale</a><a class="chip" href="#/search">Search</a><a class="chip" href="#/timeline">Timeline ${premium()?"":"🔒"}</a><a class="chip" href="#/articles">Articles ${premium()?"":"🔒"}</a></div>
  <div class="pad" style="padding-top:12px;padding-bottom:0"><a class="btn pine" href="#/identify">📷 Identify a sled from a photo${premium()?"":" 🔒"}</a>${orderMagBtn("margin-top:10px")}</div>
  ${premium()?"":dbIntro()+databaseGate()}
  ${!premium()?"":`<h3 class="sec">What sled is this? <a href="#/idhelp">See all</a></h3>
  <div style="padding:0 16px">${window.ID_POSTS.slice(0,1).map(q=>`<a class="card idcard" href="#/idhelp"><div class="th" style="background-image:url('${q.img}')"></div><div><div class="small" style="font-weight:600">@${esc(q.user)} <span class="sample-tag">Example</span></div><div style="font-size:.84rem;margin-top:3px">${esc(q.q)}</div><div class="small muted" style="margin-top:3px">${q.answers.length} answer${q.answers.length==1?"":"s"} · Help identify →</div></div></a>`).join("")}</div>`}
  <h3 class="sec">Free makers <a href="#/makers">All 61</a></h3>
  <div class="hscroll">${free.map(m=>`<a class="card mk" href="#/maker/${m.id}"><div class="th" style="background-image:url('${(mImgs(models(m).find(x=>mImgs(x).length)||{})[0])||""}')"></div><div class="n">${esc(disp(m))}</div><div class="d">${esc(m.area)}</div></a>`).join("")}</div>
  ${premium()?"":`<a class="promo" href="#/upgrade"><img class="cv" src="images/vintage-runner-tuxedo-racer-cover-p1.jpg" alt=""><div><b>Become a member</b><span style="display:block;opacity:.8;margin-bottom:2px">${Object.keys(FREE).length} free · ${61-Object.keys(FREE).length} premium</span><span>Post your sleds, use the Sled Maker and Model Database, full histories, period ads, the timeline, no-frills magazine articles and selling. $15/year.</span></div></a>`}
  <h3 class="sec">Sleds for Sale <a href="#/sale">See all</a></h3>
  <div class="hscroll">${window.SALE_LISTINGS.slice(0,4).map(l=>`<a class="card mk" href="#/listing/${l.id}"><div class="th" style="background-image:url('${l.img}')"></div><div class="n">${l.price?esc(l.price)+" · ":""}${esc(l.title.replace("[sample] ",""))}</div><div class="d">${esc(l.town)} · Ships: ${esc(l.ship)}</div></a>`).join("")}</div>
  ${premium()?dbIntro()+`<div class="feed">${feed.map(postCard).join("")}</div>`:""}`;
};
R.database=()=>{const html=R.home();setTimeout(()=>{const el=$("#database"),v=$("#view");if(el&&v)v.scrollTop=Math.max(0,el.offsetTop-8)},0);return html};
R.collection=()=>{bar("My Collection",{sub:"@sample_collector",act:'<a class="act" href="#/add" aria-label="Add">＋</a>'});tab("collection");
  const mine=allSleds().filter(s=>s.mine||s.userAdded);
  if(!premium())return lapsed()?`<div class="lapsed-ghost">${mine.slice(0,4).map(()=>'<div class="lgt"></div>').join("")}</div>${gate("Membership lapsed",lapsedText(mine.length)+" While it's lapsed, your posts are hidden, including from you.")}`
    :gate("Post your sleds with membership","Cataloging and sharing sleds is part of Sled Finder membership ($15/yr). Free members can browse the free makers' curated galleries, the maker directory and Sleds for Sale.");
  const makers=new Set(mine.map(s=>s.maker));
  return `<div class="stats"><div><b>${mine.length}</b><span>Sleds</span></div><div><b>${makers.size}</b><span>Makers</span></div><div><b>${mine.filter(s=>s.shared).length}</b><span>Shared</span></div></div>
  <div class="chips"><span class="chip on">All</span><span class="chip">Shared</span><span class="chip">Private</span><span class="chip">By maker</span><a class="chip" href="#/upgrade">🖨 Insurance list ${premium()?"":"🔒"}</a></div>
  <div class="grid2">${mine.map(s=>`<a class="card tile" href="#/sled/${s.id}"><div class="th" style="background-image:url('${s.img}')"></div><span class="vis">${s.shared?"Shared":"🔒 Private"}</span><div class="n">${esc(mk(s))}</div><div class="d">${esc(s.model)} · ${esc(s.years)}</div><div class="d">📍 ${esc(s.locType==="na"?"Location NA":(s.town||"—"))}</div>${s.editedBy?'<div class="d edited-s">✎ Edited by Sled Finder</div>':""}${+s.maker&&M(s.maker)&&!isFree(M(s.maker))&&!premium()?'<div class="d" style="color:var(--red);font-weight:600">🔒 Unlock full history</div>':""}</a>`).join("")}</div>
  <p class="legend" style="margin-bottom:20px">Sleds marked as samples are example data for this mockup. Sleds you add here are stored only in this browser. Paid members can edit or delete their own posts.</p>`;
};
R.add=(editId)=>{const E=editId?allSleds().find(x=>x.id==editId):null;
  const draft=!editId?LS.get("idDraft",null):null;
  if(!editId&&!premium()){bar("Add a Sled",{sub:"Members only"});tab("add");return gate(lapsed()?"Membership lapsed":"Posting sleds is for members",lapsed()?lapsedText(allSleds().filter(isOwn).length)+" Renew to post again.":"Adding and sharing your sleds is part of Sled Finder membership ($15/yr).")}
  if(editId&&!canEdit(E))return R.upgrade("Editing your own submissions is a paid-member feature.");
  const pre=E||(draft?{maker:draft.maker,makerText:draft.makerText||"",model:draft.model||"",years:draft.years||"",zip:draft.zip||""}:null);
  const adminEdit=E&&isAdmin()&&!isOwn(E);
  bar(E?(adminEdit?"Admin edit":"Edit Sled"):"Add a Sled",{back:!!E,sub:E?(adminEdit?"@"+E.user+" · as Sled Finder":"Your submission"):"Members"});tab(E?"collection":"add");
  const v=k=>E&&E[k]!=null?esc(E[k]):(draft&&draft[k]!=null?esc(draft[k]):"");
  const pics=["collection-red-swirl-deck-photos-p28.jpg","collection-pictorial-deck-photos-p31.jpg","sherwood-bros-sled-top-owner-horizontal.jpg","whx-young-america-c1855-p51.jpg","paris-dirigo-clipper-p56.jpg"];
  setTimeout(()=>{
    const getPics=picker("addpk",E?E.imgs:[],pics.map(p=>"images/"+p));
    bindMaker("addmk",pre);
    if(E){$("#addf").condition.value=E.condition;const lt=$("#addf").querySelector(`input[name=locType][value=${E.locType||"found"}]`);if(lt)lt.checked=true;$("#addf").shared.checked=!!E.shared}
    if(draft){if(draft.years)$("#addf").years.value=draft.years;if(draft.zip)$("#addf").zip.value=draft.zip;if(draft.model)$("#addf").model.value=draft.model}
    $("#addunk").onclick=()=>{$("#addf").years.value="Unknown"};
    $("#addf").onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector("button[type=submit]");if(btn.disabled)return;const lbl=btn.textContent;btn.disabled=true;btn.textContent="Saving…";try{const f=new FormData(e.target);
      const lt=f.get("locType"),city=f.get("city"),st=f.get("state"),zip=f.get("zip");
      let g=null,town="NA";
      if(lt!=="na"){g=(city||st||zip)?await geocode(city,st,zip):null;town=city?(city+(st?", "+st.toUpperCase():"")):(zip?"ZIP "+zip:(st?st.toUpperCase():""));
        if(!town&&E){town=E.town;g=E.lat!=null?{lat:E.lat,lng:E.lng,how:E.geo}:null}}
      const base=E?Object.assign({},E):{id:"u"+Date.now(),user:"you",userAdded:true,mine:true,likes:0};
      const s=Object.assign(base,makerVals(f),{model:f.get("model")||"Untitled sled",years:String(f.get("years")||"").trim()||"Unknown",year:undefined,size:f.get("size")||"—",condition:f.get("condition"),found:f.get("found")||"—",notes:f.get("notes")||"",shared:!!f.get("shared"),locType:lt,town:town,lat:g?g.lat:null,lng:g?g.lng:null,geo:g?g.how:null,imgs:getPics().length?await storePics(getPics()):["images/collection-red-swirl-deck-photos-p28.jpg"],img:undefined});s.img=s.imgs[0];if(adminEdit)s.editedBy="Sled Finder";
      if(E){await lsSave(()=>saveSled(s));toast("Changes saved")}else{await lsSave(()=>{const u=userSleds();u.unshift(s);LS.set("sleds",u)});try{LS.set("idDraft",null)}catch(x){}toast("Sled saved to your collection")}
      location.hash="#/sled/"+s.id}catch(err){saveErr(err)}finally{btn.disabled=false;btn.textContent=lbl}};
  });
  const [ci,stt]=(E&&E.town&&E.town!=="NA"&&!/^ZIP /.test(E.town))?E.town.split(/,\s*/):["",""];
  return `<form class="form" id="addf">
  ${pickerHTML("addpk",false)}
  ${makerFields("addmk",pre)}
  <label>Model<input name="model" value="${v("model")}" placeholder="e.g. Speedster, Lightning Guider"></label>
  <label>Estimated years of manufacture<span class="inl"><input name="years" value="${v("years")}" placeholder="e.g. c. 1925–1935"><button type="button" class="btn sm" id="addunk">Unknown</button></span><small class="hint">Your best estimate. Leave blank or tap Unknown if you're not sure.</small></label>
  <label>Size<input name="size" value="${v("size")}" placeholder="e.g. 42 in."></label>
  <label>Condition<select name="condition"><option>Excellent</option><option selected>Good</option><option>Fair</option><option>Poor</option><option>Restored</option></select></label>
  <label>Where found<input name="found" value="${v("found")}" placeholder="Estate sale, barn, auction…"></label>
  <fieldset class="locset"><legend>Map location (town level only)</legend>
  <div class="seg"><label><input type="radio" name="locType" value="found" checked> Where it was found / sourced</label><label><input type="radio" name="locType" value="now"> Where it is now</label><label><input type="radio" name="locType" value="na"> Unknown / NA (no map pin)</label></div>
  <div class="row2"><label>City<input name="city" value="${esc(ci||"")}" placeholder="Schaumburg"></label><label>State<input name="state" value="${esc(stt||"")}" placeholder="IL" maxlength="20"></label></div>
  <label>or ZIP<input name="zip" inputmode="numeric" maxlength="5" placeholder="60193"></label>
  <small class="muted" style="font-size:.7rem">Only the town shows on the map. Never enter a street address. Choose NA if you don't know.</small></fieldset>
  <label>Notes<textarea name="notes" placeholder="Stencils, stamps, repairs, provenance…">${v("notes")}</textarea></label>
  <label class="toggle"><span>Share in the Sled Maker and Model Database<small>Off = only you can see it</small></span><span class="sw"><input type="checkbox" name="shared" checked><i></i></span></label>
  ${adminEdit?'<p class="legend" style="margin:0;padding:0">Saving marks this post “Edited by Sled Finder”.</p>':ackHTML()}
  <button class="btn solid" type="submit">${E?"Save changes":"Save sled"}</button>
  ${E?"":`<p class="legend" style="margin:0">Paid members can edit or delete their own posts later.</p>${draft?'<p class="legend" style="margin:0">Maker, years and origin ZIP were filled from the photo ID demo. You can change anything before you save.</p>':""}<a class="btn" href="#/identify">📷 Identify from a photo first</a><a class="btn" href="#/idhelp">Not sure? Ask “What sled is this?”</a>`}</form>`;
};
R.edit=id=>R.add(id);
R.sled=id=>{const s=allSleds().find(x=>x.id==id);if(!s)return R.home();const m=+s.maker?M(s.maker):null;
  if(!premium()){bar("Sled",{back:true});tab(isOwn(s)?"collection":"home");return isOwn(s)&&lapsed()?gate("Membership lapsed",lapsedText(allSleds().filter(isOwn).length)):databaseGate()}
  bar(m?disp(m):"Sled",{back:true,sub:s.model});tab(s.mine||s.userAdded?"collection":"home");
  const grp=sameModel(s);
  return `${gallery(s.imgs,hidden(s))}
  <div class="title-block"><h1>${esc(mk(s))} ${esc(s.model)}</h1><div class="small muted" style="margin-top:4px">@${esc(s.user)}${sampleTag(s)} · ${s.shared?"Shared":"🔒 Private"}</div>${editedNote(s)}</div>
  ${nudge(s)?`<div style="padding:8px 16px 0">${nudge(s)}</div>`:""}<dl class="dl"><div><dt>Maker</dt><dd>${m?`<a href="#/maker/${m.id}">${esc(disp(m))}</a>`:(s.makerText?esc(s.makerText)+' <span class="unconf">unconfirmed</span>':"Unknown maker")}</dd></div><div><dt>Model</dt><dd>${esc(s.model)}</dd></div><div><dt>Est. years made</dt><dd>${esc(s.years)}</dd></div><div><dt>Size</dt><dd>${esc(s.size)}</dd></div><div><dt>Condition</dt><dd>${esc(s.condition)}</dd></div><div><dt>Where found</dt><dd>${esc(s.found)}</dd></div>${s.town||s.locType==="na"?`<div><dt>Map location</dt><dd>${esc(locLine(s))}${!s.userAdded?" [sample]":""}${s.lat!=null?' · <a href="#/map">Sled Picker Map</a>':""}</dd></div>`:""}<div><dt>Notes</dt><dd>${esc(s.notes)}</dd></div></dl>
  ${isOwn(s)&&m&&!isFree(m)&&!premium()?teaser(m):""}<div style="padding:16px;display:flex;flex-direction:column;gap:10px">${m?`<a class="btn pine" href="#/maker/${m.id}">About ${esc(disp(m))}</a>`:`<a class="btn pine" href="#/unknown">Unknown / unconfirmed makers</a>`}${editBar(s,"#/edit/"+s.id,"sled")}</div>
  ${m&&grp.length>1?`<h3 class="sec">${esc(mk(s))} ${esc(s.model)}: ${grp.length} collectors</h3>${groupList(grp,s.id)}`:""}`;
};
R.makers=()=>{bar("Makers",{sub:"61 American sled companies",act:'<a class="act" href="#/map" aria-label="Sled Picker Map">🗺</a>'});tab("makers");
  setTimeout(()=>{const i=$("#mq");i.oninput=()=>{const q=i.value.toLowerCase();document.querySelectorAll(".mrow").forEach(r=>r.style.display=r.dataset.s.includes(q)?"":"none")}});
  const row=m=>`<a class="mrow" href="#/maker/${m.id}" data-s="${esc((disp(m)+" "+m.name+" "+m.area+" "+m.models+" "+(companyOf(m)?companyOf(m).name+" "+companyOf(m).brands.map(b=>b.name).join(" "):"")).toLowerCase())}"><span class="num">${m.id}</span><span class="tx"><div class="n">${esc(disp(m))}</div><div class="d"><span class="dot ${m.book?"blk":"grn"}"></span>${esc(m.area||"Location unknown")}${m.years?" · "+esc(m.years):""}</div>${companyOf(m)?`<div class="d co">Brand of ${esc(companyOf(m).name)}</div>`:""}</span>${isFree(m)?'<span class="free-pill">Free</span>':(premium()?'<span class="lk">›</span>':'<span class="lk">🔒</span>')}</a>`;
  const free=MAKERS.filter(isFree),rest=MAKERS.filter(m=>!isFree(m));
  return `<div class="search"><span>⌕</span><input id="mq" placeholder="Search 61 makers, towns, models"></div>
  <p class="legend"><span class="dot blk"></span>Listed in Joan Palicia's books &nbsp; <span class="dot grn"></span>Jonathan Spangler's finds</p>
  <p class="legend" style="margin-top:8px;font-weight:600;color:var(--ink-soft)">${free.length} free makers · ${rest.length} premium</p>
  <h3 class="sec">Free makers (${free.length}) <span class="small muted" style="font-family:var(--sans)">limited gallery</span></h3><div class="list card">${free.map(row).join("")}</div>
  <h3 class="sec">${premium()?"Premium profiles":"Premium · name & dates only"} (${rest.length}) ${premium()?"":'<a href="#/upgrade">Unlock</a>'}</h3><div class="list card">${rest.map(row).join("")}</div>
  <h3 class="sec">Unknown / unconfirmed makers</h3><div class="list card"><a class="mrow" href="#/unknown"><span class="num">?</span><span class="tx"><div class="n">Sleds with an unknown or custom maker</div><div class="d">${allSleds().filter(s=>!+s.maker&&(s.shared||isOwn(s))).length} posts · not filed under any real maker</div></span>${premium()?'<span class="lk">›</span>':'<span class="lk">🔒</span>'}</a></div><div style="height:16px"></div>`;
};
function lockBox(title,sub){return `<div class="locked"><div class="blur">Company history, founders, factory locations, model guide with dates, catalog numbers and identifying marks, and period advertisements from the trade press. This text is a placeholder that sits behind the paywall in the mockup.</div><div class="ov">🔒<b>${title}</b><span>${sub}</span><a class="btn gold" href="#/upgrade">See Premium · $15/yr</a></div></div>`}
R.maker=id=>{const m=M(id);if(!m)return R.makers();const p=m.p,free=isFree(m),P=premium(),ms=models(m);
  bar(disp(m),{back:true,sub:P?"Premium profile":(free?"Free · limited":"Premium maker · locked")});tab("makers");
  const facts=`<dl class="facts"><div><dt>Production area</dt><dd>${esc(m.area||"—")}</dd></div><div><dt>Years (matrix)</dt><dd>${esc(m.years||"—")}</dd></div><div><dt>Sled type</dt><dd>${esc(m.type||"—")}</dd></div><div><dt>Source</dt><dd>${m.book?"Palicia's books":"Spangler find"}</dd></div></dl>`;
  const mcard=(x,i)=>{const im=mImgs(x);return `<${im.length?`a href="#/mphotos/${m.id}/${i}"`:"div"} class="card tile">${im.length?`<div class="th" style="background-image:url('${im[0]}')">${im.length>1?`<span class="pcount">▣ ${im.length}</span>`:""}</div>`:`<div class="th nophoto">${x.sample?"[sample model]":"No photo yet"}</div>`}<div class="n">${esc(x.n)}${x.sample?' <span class="sample-tag">Placeholder</span>':""}</div><div class="d">${esc(x.d)}</div></${im.length?"a":"div"}>`};
  let body="";
  if(P){
    body=`${p&&p.img?`<figure class="fig"><img src="${p.img}" alt=""><figcaption>${esc(p.cap)}</figcaption></figure>`:""}
    ${p?`<div class="mp-head" style="padding-top:6px"><div class="small" style="font-weight:600">${esc(p.head)}</div><div class="conf" style="margin-top:4px">Confidence: ${esc(p.conf)}</div></div><div class="prose">${p.text.map(t=>`<p>${esc(t)}</p>`).join("")}</div>`:`<div class="prose"><p class="muted">[History coming soon] No written history for this maker yet.</p></div>`}
    <h3 class="sec">Models & brands (matrix)</h3><div class="prose"><p>${esc(m.models||"—")}</p></div>
    ${brandsOf(m).length>1?brandsOf(m).map(b=>{const bi=ms.map((x,i)=>[x,i]).filter(([x])=>x.brand===b.name);return `<h3 class="sec">${esc(b.name)} models (${bi.length})</h3>${bi.length?`<div class="grid2">${bi.map(([x,i])=>mcard(x,i)).join("")}</div>`:'<p class="small muted" style="padding:0 16px">No models catalogued yet.</p>'}`}).join(""):(ms.length?`<h3 class="sec">Model gallery (${ms.length})</h3><div class="grid2">${ms.map(mcard).join("")}</div>`:"")}
    ${p&&p.ad?`<h3 class="sec">Period advertisement</h3><figure class="fig"><img src="${p.ad}" alt=""><figcaption>${esc(p.adcap)}</figcaption></figure>`:""}
    <p class="src">${p?"History condensed from the Rosebud Sled Museum company briefs (Jonathan Spangler, Nov 2026), which list full sources.":"Name, place and dates from Jonathan Spangler's sled manufacturer matrix."}</p>`;
  }else if(free){
    const n=window.FREE_GALLERY_COUNT||5, shown=ms.slice(0,n), more=ms.length-shown.length;
    body=`<h3 class="sec">Model gallery <span class="small muted" style="font-family:var(--sans)">${shown.length} of ${ms.length}</span></h3><div class="grid2">${shown.map(mcard).join("")}</div>
    ${lockBox(more>0?`${more} more models & photos`:"Complete model list","The complete model list, extra photos, full history and period ads are Premium.")}
    ${p?`<h3 class="sec">History</h3><div class="prose"><p>${esc(firstSentence(p.text[0]))}</p></div>`+lockBox("Full history is Premium","Founders, factories, dates and sources."):""}
    ${p&&p.ad?`<h3 class="sec">Period advertisement</h3>`+lockBox("Period ads are Premium","Trade-press and catalog ads."):""}`;
  }else{
    body=`<div class="prose"><p class="muted">Free members see the name, place and dates. Premium unlocks the history, model gallery and period ads.</p></div>${lockBox("Premium maker","History, model gallery and period advertisements.")}`;
  }
  return `<div class="mp-head"><p class="eyebrow">Maker #${m.id} of 61 ${free?'· <span class="free-pill">Free</span>':""}</p><h1>${esc(disp(m))}</h1>${disp(m)!==m.name?`<div class="small muted">Matrix entry: ${esc(m.name)}</div>`:""}</div>${facts}${brandBox(m)}${body}
  <h3 class="sec">Collectors' sleds by model</h3>${!premium()?databaseGate():(()=>{const G={};allSleds().filter(s=>s.maker==m.id&&(s.shared||isOwn(s))).forEach(s=>{(G[modelKey(s)]=G[modelKey(s)]||[]).push(s)});const ks=Object.keys(G);
    return ks.length?ks.map(k=>{const g=G[k];return `<p class="grp-h"><b>${esc(disp(m))} ${esc(g[0].model)}</b> · ${g.length} collector${g.length==1?"":"s"}</p>${groupList(g)}`}).join(""):'<p class="small muted" style="padding:0 16px">No shared sleds yet.</p>'})()}<div style="height:20px"></div>`;
};
R.search=()=>{bar("Search",{back:true,sub:"Makers, models, collectors"});tab("home");
  setTimeout(()=>{const i=$("#q"),out=$("#res");const run=()=>{const q=i.value.trim().toLowerCase();
    if(!q){out.innerHTML='<p class="legend">Try “Flyer”, “Chicago”, “Speedster” or “Garton”.</p>';return}
    const mk=MAKERS.filter(m=>(disp(m)+" "+m.name+" "+m.models+" "+m.area).toLowerCase().includes(q));
    const sl=premium()?allSleds().filter(s=>s.shared||s.mine||s.userAdded).filter(s=>(mk(s)+" "+s.model+" "+s.user+" "+s.years).toLowerCase().includes(q)):[];
    out.innerHTML=`<h3 class="sec">Makers (${mk.length})</h3><div class="list card">${mk.map(m=>`<a class="mrow" href="#/maker/${m.id}"><span class="num">${m.id}</span><span class="tx"><div class="n">${esc(disp(m))}</div><div class="d">${esc(m.area)} · ${esc(m.models||"")}</div></span>${isFree(m)?'<span class="free-pill">Free</span>':premium()?"›":"🔒"}</a>`).join("")||'<div class="mrow">No makers</div>'}</div>
    ${premium()?`<h3 class="sec">Collectors' sleds (${sl.length})</h3><div class="grid2">${sl.map(s=>`<a class="card tile" href="${tileHref(s)}">${tileTh(s)}<div class="n">${esc(mk(s))}</div><div class="d">${esc(s.model)} · ${esc(s.years)}</div><div class="d">@${esc(s.user)}</div></a>`).join("")}</div>`:`<h3 class="sec">Collectors' sleds</h3>${databaseGate()}`}`};
    i.oninput=run;i.value=LS.get("lastq","Paris");run();i.addEventListener("change",()=>LS.set("lastq",i.value))});
  return `<div class="search"><span>⌕</span><input id="q" placeholder="Search makers, models, collectors" autofocus></div><div id="res"></div>`;
};
R.idhelp=()=>{bar("What sled is this?",{back:true,sub:"Community ID help"});tab("home");
  if(!premium())return databaseGate();
  return `<div class="pad"><a class="btn pine" href="#/identify">📷 Identify from a photo</a><a class="btn solid" style="margin-top:10px" href="#/add">Post a photo for community ID</a></div>
  <div class="feed">${window.ID_POSTS.map(q=>`<article class="card post"><div class="ph" style="background-image:url('${q.img}')"></div><div class="meta"><div class="who"><span class="av">${initials(q.user)}</span>@${esc(q.user)} <span class="sample-tag">Example data</span></div><div style="font-size:.88rem">${esc(q.q)}</div>
  ${q.answers.map(a=>`<div style="margin-top:8px;padding:8px 10px;background:var(--stone);border-radius:10px;font-size:.8rem">${esc(a)}</div>`).join("")}
  <div class="bar"><span>💬 ${q.answers.length} answers</span><span>✋ I know this one</span></div></div></article>`).join("")}</div>`;
};
R.timeline=()=>{if(!premium())return paywall("The Coasting Through History timeline is part of Premium.");
  bar("Coasting Through History",{back:true,sub:"Sledding in America"});tab("home");
  return `<p class="legend" style="margin-top:14px">From the Rosebud Sled Museum timeline prepared for the Gail Borden Public Library display (Jan 2027). Green dots are Illinois stories.</p>
  <ol class="tl">${window.TIMELINE.map(t=>`<li class="${t.il?"il":""}"><div class="y">${esc(t.y)}${t.il?"<em>Illinois</em>":""}</div><p>${esc(t.t)}</p></li>`).join("")}</ol>`;
};
function magazine(){return window.MAGAZINE||{articles:[],orderUrl:"https://rosebudsledmuseum.com/#magazine",cover:"images/vintage-runner-tuxedo-racer-cover-p1.jpg"}}
// Online-only exclusive articles (not printed in the magazine). Titles and
// teasers are placeholders only — no invented historical facts.
const EXCLUSIVES=[
  {id:"placeholder-1",title:"PLACEHOLDER: Online-only article 1",dek:"A short exclusive will be published here. This is a placeholder title and teaser only — no article has been written yet."},
  {id:"placeholder-2",title:"PLACEHOLDER: Online-only article 2",dek:"Reserved for a future short article that will not appear in the printed Vintage Runner."},
  {id:"placeholder-3",title:"PLACEHOLDER: Online-only article 3",dek:"Placeholder only. The finished piece will be added later; nothing here is a historical claim."}
];
const exclusivePlaceholderBody="This is placeholder copy for the mockup. The exclusive article has not been written yet. When it is ready, it will be a short, online-only piece for paid members, and it will not be printed in the magazine.";
// Order link for everyone (all tiers): the magazine section on rosebudsledmuseum.com (same link the app already uses).
const orderMagBtn=(st)=>`<a class="btn gold" href="${esc(magazine().orderUrl)}" target="_blank" rel="noopener"${st?` style="${st}"`:""}>📖 Order Vintage Runner Magazine</a>`;
function magCta(){
  const M=magazine();
  return `<div class="art-cta"><div><b>Want the photographs and the layout?</b><p>These are no-frills text editions for reading in the app. The printed Vintage Runner keeps the photos, catalog plates and original design.</p><p class="small muted">${esc(M.orderPrices||"")}. ${esc(M.shipping||"")}</p></div><a class="btn pine" href="${esc(M.orderUrl)}" target="_blank" rel="noopener">Order the print edition</a></div>`;
}
function artBlocks(blocks){
  return (blocks||[]).map(b=>{
    if(b.type==="h") return `<h3 class="art-h">${esc(b.text)}</h3>`;
    if(b.type==="p") return `<p>${esc(b.text)}</p>`;
    if(b.type==="quote") return `<blockquote class="art-q"><p>${esc(b.text)}</p>${b.cite?`<cite>${esc(b.cite)}</cite>`:""}</blockquote>`;
    if(b.type==="caption") return `<p class="art-cap">${esc(b.text)}</p>`;
    if(b.type==="note") return `<p class="art-note">${esc(b.text)}</p>`;
    if(b.type==="catalog") return `<ol class="art-cat">${(b.items||[]).map(it=>`<li><b>${esc(it.name)}</b><span>${esc([it.maker,it.place,it.years].filter(Boolean).join(" · "))}</span></li>`).join("")}</ol>`;
    if(b.type==="results") return `<div class="art-res"><h4>${esc(b.title||"Results")}</h4>${(b.groups||[]).map(g=>`<div class="art-res-g"><div class="art-res-h">${esc(g.name)}</div><ol>${(g.places||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div>`).join("")}</div>`;
    if(b.type==="timeline") return `<ol class="art-years">${(b.items||[]).map(it=>`<li><b>${esc(it.year)}</b><span>${esc(it.text)}</span></li>`).join("")}</ol>`;
    return "";
  }).join("");
}
R.articles=()=>R.magazine();
R.magazine=()=>{
  const M=magazine(), arts=M.articles||[], P=premium();
  bar("Articles",{back:true,sub:P?"Vintage Runner · Issue 1 + exclusives":"Titles and teasers"});tab("home");
  const go=(href,n,title,dek,extra)=>`<a class="art-row" href="${href}"><span class="art-n">${n}</span><span class="art-meta"><b>${esc(title)}</b><em>${esc(dek)}</em>${extra||""}</span><span class="${P?"art-go":"art-lock"}">${P?"›":"🔒"}</span></a>`;
  const exTags=`<span class="art-tags"><span class="sample-tag">PLACEHOLDER</span><span class="sample-tag">Online only</span></span>`;
  return `<div class="art-issue">
  <div style="margin:0 0 14px">${orderMagBtn()}</div>
  <h3 class="sec" style="margin:0 0 8px">Exclusive (online only)</h3>
  <p class="legend" style="margin:0 0 10px">Short articles for paid members, not printed in the magazine. Free and lapsed members can read the titles and teasers. Opening an article is part of Premium. Titles marked PLACEHOLDER are standing in until the real pieces are written — they are not finished articles and make no historical claims.</p>
  <div class="art-list">${EXCLUSIVES.map((a,i)=>go("#/exclusive/"+a.id,String(i+1).padStart(2,"0"),a.title,a.dek,exTags)).join("")}</div>
  <div class="art-hero" style="margin-top:22px"><img src="${esc(M.cover)}" alt="Vintage Runner cover"><div><div class="eyebrow">${esc(M.issue)} · ${esc(M.edition)}</div><b>Vintage Runner</b><p>No-frills text editions of the articles, to read in the app. The printed magazine keeps the photographs and the layout.</p></div></div>
  ${magCta()}
  <p class="legend" style="margin:8px 0 4px">Print copies are sold separately; Apple only allows digital content in an in-app subscription.${P?"":" Opening Issue 1 articles is part of Premium."}</p>
  <div class="art-list">${arts.map((a,i)=>go("#/article/"+a.id,String(i+1).padStart(2,"0"),a.title,a.dek,a.byline?`<span class="small muted">By ${esc(a.byline)}</span>`:"")).join("")}</div></div>`;
};
R.exclusive=id=>{
  const a=EXCLUSIVES.find(x=>x.id===id);
  if(!a)return R.magazine();
  if(!premium())return paywall("Exclusive articles are included with Premium. They are short, online-only pieces and are not printed in the magazine.");
  bar("Exclusive",{back:true,sub:"Online only · not in the magazine"});tab("home");
  return `<article class="art-read">
    <div class="mock-banner">PLACEHOLDER · online only · not printed in the magazine · no article written yet</div>
    <p class="eyebrow">Exclusive · Online only</p>
    <h1>${esc(a.title)}</h1>
    <p class="art-dek">${esc(a.dek)}</p>
    <div class="art-body"><p class="art-note">${esc(exclusivePlaceholderBody)}</p></div>
    <p class="legend"><a href="#/articles">Back to Articles</a></p>
  </article>`;
};
R.article=id=>{if(!premium())return paywall("Vintage Runner articles are included with Premium. The print magazine is sold separately.");
  const M=magazine(), arts=M.articles||[], a=arts.find(x=>x.id===id);
  if(!a)return R.magazine();
  const i=arts.indexOf(a), prev=arts[i-1], next=arts[i+1];
  bar("Vintage Runner",{back:true,sub:(a.kicker||"Issue 1")+" · text edition"});tab("home");
  return `<article class="art-read">
    <p class="eyebrow">${esc(a.kicker||M.issue||"")}${a.dateline?" · "+esc(a.dateline):""}</p>
    <h1>${esc(a.title)}</h1>
    ${a.fullTitle&&a.fullTitle!==a.title?`<p class="art-full">${esc(a.fullTitle)}</p>`:""}
    <p class="art-dek">${esc(a.dek)}</p>
    ${a.byline?`<p class="art-by">By ${esc(a.byline)}</p>`:""}
    <div class="art-body">${artBlocks(a.blocks)}</div>
    <nav class="art-next">${prev?`<a href="#/article/${prev.id}">‹ ${esc(prev.title)}</a>`:"<span></span>"}${next?`<a href="#/article/${next.id}">${esc(next.title)} ›</a>`:"<span></span>"}</nav>
    ${magCta()}
    <p class="legend"><a href="#/articles">All Issue 1 articles</a></p>
  </article>`;
};
function paywall(reason){return R.upgrade(reason)}
R.upgrade=(reason)=>{bar(window.APP_NAME+" Premium",{back:true,sub:"Mock paywall"});tab("");
  if(premium()){return `<div class="mock-banner">MOCKUP · no real payment was taken</div><div class="pad" style="text-align:center"><p style="font-family:var(--serif);font-size:1.6rem;margin:20px 0 6px">${isAdmin()?"Admin preview (Sled Finder)":"You're previewing Premium"}</p><p class="small muted">All 61 makers, model lists, ads, the timeline, the articles and selling are unlocked in this demo.</p><div style="display:flex;flex-direction:column;gap:10px;margin-top:18px"><a class="btn pine" href="#/makers">Browse all 61 makers</a><a class="btn" href="#/articles">Read the articles</a><a class="btn" href="#/timeline">Open the timeline</a><button class="btn" id="cancelP">End preview (back to Free)</button></div></div>`}
  setTimeout(()=>{$("#buy").onclick=()=>{const was=lapsed();setRole("premium");toast(was?"Mockup: membership renewed, your posts are back":"Mockup: Premium unlocked, no payment taken");location.hash=was?"#/collection":"#/makers"}});
  const r=(t,f,p)=>`<div class="r"><span>${t}</span><span class="${f?"yes":"no"}">${f===true?"✓":f||"—"}</span><span class="yes">✓</span></div>`;
  return `<div class="mock-banner">MOCKUP · no real payment · nothing is charged</div>
  <div class="pw-hero"><p class="eyebrow" style="color:#e7b7a5">${esc(window.APP_NAME)} Premium</p><h1>${lapsed()?"Welcome back. Renew to bring your posts back.":"Post, see and sell sleds. All 61 makers."}</h1><p>${esc(typeof reason==="string"?reason:(lapsed()?lapsedText(allSleds().filter(isOwn).length):"Your research library and community for antique sleds."))}</p></div>
  <div class="compare"><div class="r h"><span>What you get</span><span>Free</span><span>Premium</span></div>
  ${r("Search makers & models",true)}${r("Browse Sleds for Sale",true)}${r("Maker profiles",`${Object.keys(FREE).length} free, limited`)}${r("Curated model galleries","Limited")}${r("Post & catalog your sleds",false)}${r("Sled Maker and Model Database (view, add, search &amp; map)",false)}${r("“What sled is this?” ID help",false)}${r("All 61 company histories",false)}${r("Complete model lists & extra photos",false)}${r("Period advertisements",false)}${r("Sell your sleds",false)}${r("Edit & delete your own submissions",false)}${r("Coasting Through History timeline",false)}${r("Vintage Runner articles (text)",false)}${r("Exclusive articles (online only, not printed)","Titles only")}${r("Printable insurance list",false)}</div>
  <div class="price"><div><div class="small muted">Yearly · renews automatically</div><b>$15.00 / year</b></div><span class="badge-prem">Best value</span></div>
  <div class="pad"><button class="btn gold" id="buy">${lapsed()?"Renew membership (mock)":"Start Premium (mock)"}</button><a class="btn" style="margin-top:10px;border:0" href="#/home">Not now</a></div>
  <p class="fine">In the real app, payment would go through the App Store. The subscription renews each year unless cancelled at least 24 hours before renewal in your phone's Settings. This mockup does not charge anything. If a membership lapses, your posts stay in Sled Finder and come back when you renew. See the <a href="#/terms">Terms &amp; Community Guidelines (draft)</a>.</p>`;
};
R.profile=()=>{bar("Profile",{sub:ROLES[role()]});tab("profile");
  setTimeout(()=>{document.querySelectorAll("input[name=role]").forEach(r=>r.onchange=()=>{setRole(r.value);toast("Demo role: "+ROLES[r.value]);route()})});
  const mine=allSleds().filter(s=>s.mine||s.userAdded);
  return `<div class="prof"><span class="av big">SC</span><div><h1>@sample_collector</h1><div class="small muted">Example profile · ${mine.length} sleds · joined 2026</div></div></div>
  <div class="menu"><a href="#/collection">My collection <span>›</span></a><a href="#/idhelp">My ID requests <span>›</span></a><a href="#/upgrade">Subscription <span class="small muted">${ROLES[role()]} ›</span></a><a href="${esc(magazine().orderUrl)}" target="_blank" rel="noopener">📖 Order Vintage Runner Magazine <span>↗</span></a></div>
  <h3 class="sec">Demo role switcher</h3><div class="menu roles">${Object.keys(ROLES).map(k=>`<label><span>${ROLES[k]}</span><input type="radio" name="role" value="${k}" ${role()===k?"checked":""}></label>`).join("")}</div>
  <div class="menu"><a href="#/database">Sled Maker and Model Database ${premium()?"":"🔒"}<span>›</span></a><a href="#/identify">Identify a sled from a photo ${premium()?"":"🔒"}<span>›</span></a><a href="#/map">Sled Picker Map ${premium()?"":"🔒"}<span>›</span></a><a href="#/timeline">Coasting Through History ${premium()?"":"🔒"}<span>›</span></a><a href="#/articles">Vintage Runner articles ${premium()?"":"🔒"}<span>›</span></a><a href="#/makers">Sled makers directory <span>›</span></a></div>
  <div class="menu"><a href="#/profile" onclick="return false">About · Rosebud Sled Museum, Schaumburg, IL <span></span></a><a href="#/profile" onclick="return false">Privacy: private sleds are visible only to you <span></span></a><a href="#/terms">Terms &amp; Community Guidelines (draft) <span>›</span></a></div>
  <p class="legend" style="padding-bottom:24px">Clickable mockup for review. No accounts, servers or payments.</p>`;
};
R.sale=()=>{bar("Sleds for Sale",{sub:"Collector marketplace",act:`<a class="act" href="${canSell()?"#/sell":"#/upgrade"}" aria-label="Sell">${canSell()?"＋":"🔒"}</a>`});tab("sale");
  const all=allListings(),L=all.filter(l=>premium()||!l.mine),hid=all.length-L.length;
  return `<div class="pad" style="padding-bottom:4px">${canSell()?'<a class="btn solid" href="#/sell">＋ Post a sled for sale</a>':'<a class="btn" href="#/upgrade">🔒 Post a sled for sale <span class="small" style="text-transform:none;letter-spacing:0">· Premium members</span></a>'}</div>
  <p class="legend">Anyone can browse listings. Posting a listing is for paid members. Locations are shown by town only.</p>${hid&&lapsed()?`<p class="legend" style="color:var(--red)">🔒 ${hid} of your listing${hid==1?" is":"s are"} hidden while your membership is lapsed. ${hid==1?"It stays":"They stay"} in Sled Finder and come${hid==1?"s":""} back when you renew.</p>`:""}
  <div class="feed" style="margin-top:12px">${L.map(l=>`<a class="card post" href="#/listing/${l.id}" style="text-decoration:none"><div class="ph" style="background-image:url('${l.img}')"></div><div class="meta"><div class="who"><span class="av">${initials(l.user)}</span>@${esc(l.user)} ${l.mine?'<span class="sample-tag" style="background:#e5efe9;color:var(--pine);border-color:#bcd3c5">Your listing</span>':'<span class="sample-tag">Example data</span>'}</div><div class="t">${l.price?esc(l.price)+" · ":""}${esc(l.title)}</div><div class="m">${esc(mk(l))}${l.model?" · "+esc(l.model):""} · Est. ${esc(l.years)}${l.condition?" · "+esc(l.condition):""}</div><div class="m">📍 ${esc(l.town)} · 📦 Ships: ${esc(l.ship)}</div><div class="m">✉ ${esc(l.email)}</div>${l.desc?`<p class="snip">${esc(l.desc)}</p>`:""}${editedNote(l)}</div></a>`).join("")}</div>`;
};
R.listing=id=>{const l=allListings().find(x=>x.id==id);if(!l)return R.sale();
  if(l.mine&&!premium()){bar("For Sale",{back:true});tab("sale");return gate("Membership lapsed",lapsedText(1))}
  bar("For Sale",{back:true,sub:l.price||"Price not listed"});tab("sale");
  return `${gallery(l.imgs,false)}
  <div class="title-block"><h1>${esc(l.title)}</h1><div style="font-family:var(--serif);font-size:1.6rem;font-weight:700;color:var(--red);margin-top:4px">${l.price?esc(l.price):'<span class="muted" style="font-size:1rem">Price not listed · contact seller</span>'}</div><div class="small muted">@${esc(l.user)} ${l.mine?"· Your listing":'<span class="sample-tag">Example data</span>'}</div>${editedNote(l)}</div>
  <dl class="dl"><div><dt>Maker</dt><dd>${+l.maker&&M(l.maker)?`<a href="#/maker/${l.maker}">${esc(makerName(l.maker))}</a>`:(l.makerText?esc(l.makerText)+' <span class="unconf">unconfirmed</span>':"Unknown maker")}</dd></div><div><dt>Model</dt><dd>${esc(l.model||"—")}</dd></div><div><dt>Est. years made</dt><dd>${esc(l.years)}</dd></div><div><dt>Condition</dt><dd>${esc(l.condition)}</dd></div><div><dt>Location</dt><dd>${esc(l.town)}</dd></div><div><dt>Can ship?</dt><dd>${esc(l.ship)}</dd></div><div><dt>Contact</dt><dd><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></dd></div></dl>${l.desc?`<div class="prose" style="padding-top:12px"><p>${esc(l.desc)}</p></div>`:""}
  <div class="pad"><a class="btn solid" href="mailto:${esc(l.email)}?subject=${encodeURIComponent("Your sled listing: "+l.title)}">✉ Email seller</a><div style="margin-top:10px">${editBar(l,"#/editlisting/"+l.id,"listing")}</div><p class="legend" style="margin:10px 0 0">Opens your email app. Sample listings use example.com addresses, which don't reach anyone. No sale happens in the app.</p></div>`;
};
R.editlisting=id=>R.sell(id);
R.sell=(editId)=>{const E=editId?allListings().find(x=>x.id==editId):null;
  if(editId&&!canEdit(E))return R.upgrade("Editing your own submissions is a paid-member feature.");
  if(!editId&&!canSell())return R.upgrade("Selling your sleds is a paid-member feature. Browsing listings stays free.");
  const adminEdit=E&&isAdmin()&&!E.mine;
  bar(E?(adminEdit?"Admin edit · listing":"Edit Listing"):"Post a Sled for Sale",{back:true,sub:adminEdit?"@"+E.user+" · as Sled Finder":"Saved in this browser only"});tab("sale");
  const pics=["sale-flexible-flyer-eagle-deck.jpg","sale-hand-painted-sled.jpg","collection-red-swirl-deck-photos-p28.jpg","collection-pictorial-deck-photos-p31.jpg"];
  setTimeout(()=>{const getPics=picker("sellpk",E?normPics(E).imgs:[],pics.map(p=>"images/"+p));bindMaker("sellmk",E);$("#sellunk").onclick=()=>{$("#sellf").years.value="Unknown"};if(E){const F=$("#sellf");F.title.value=E.title;F.model.value=E.model||"";F.years.value=E.years&&E.years!=="Unknown"?E.years:"";F.condition.value=E.condition||"Good";F.price.value=(E.price||"").replace(/^\$/,"");F.town.value=E.town;F.ship.value=E.ship;F.email.value=E.email;F.desc.value=E.desc||"";$("#scount").textContent=F.desc.value.length+" / 500"}const ta=$("#sdesc"),sc=$("#scount");ta.oninput=()=>{sc.textContent=ta.value.length+" / 500"};
    $("#sellf").onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target);const P0=getPics();if(!P0.length){toast("Please add at least one photo");return}const P=await storePics(P0);
      const l=Object.assign({},E||{id:"ul"+Date.now(),user:"you",mine:true},makerVals(f),{years:String(f.get("years")||"").trim()||"Unknown",title:f.get("title"),ship:f.get("ship"),email:f.get("email"),model:f.get("model"),condition:f.get("condition"),price:f.get("price")?"$"+String(f.get("price")).replace(/^\$/,""):"",town:f.get("town"),imgs:P,img:P[0],desc:String(f.get("desc")||"").slice(0,500)});if(adminEdit)l.editedBy="Sled Finder";
      if(E){await lsSave(()=>saveListing(l));toast("Listing updated")}else{await lsSave(()=>{const u=LS.get("listings",[]);u.unshift(l);LS.set("listings",u)});toast("Listing posted (mockup)")}location.hash="#/listing/"+l.id}catch(err){saveErr(err)}}});
  return `<form class="form" id="sellf">${pickerHTML("sellpk",true)}
  <label>Sled name *<input name="title" required placeholder="e.g. Flexible Flyer No. 3C, original paint"></label>
  ${makerFields("sellmk",E)}
  <label>Model<input name="model" placeholder="Model name if known"></label>
  <label>Estimated years of manufacture<span class="inl"><input name="years" placeholder="e.g. c. 1925–1935"><button type="button" class="btn sm" id="sellunk">Unknown</button></span></label>
  <div class="row2"><label>Condition<select name="condition"><option>Excellent</option><option selected>Good</option><option>Fair</option><option>Poor</option><option>Restored</option></select></label><label>Price (optional)<input name="price" inputmode="decimal" placeholder="150"></label></div>
  <label>Location (town, state) *<input name="town" required placeholder="e.g. Schaumburg, IL"><small style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted)">Town only. Please don't post a street address.</small></label>
  <label>Can ship? *<select name="ship" required><option value="">Choose…</option><option>Yes</option><option>No</option></select></label>
  <label>Contact email *<input name="email" type="email" required placeholder="you@example.com"><small style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted)">Shown on your listing so buyers can email you.</small></label>
  <label>Description (optional)<textarea name="desc" id="sdesc" maxlength="500" placeholder="Markings, size, repairs, pickup or shipping…"></textarea><small id="scount" style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted);text-align:right">0 / 500</small></label>
  ${adminEdit?'<p class="legend" style="margin:0;padding:0">Saving marks this ad “Edited by Sled Finder”.</p>':ackHTML()}
  <button class="btn solid" type="submit">${E?"Save changes":"Post listing"}</button></form>`;
};

const MAP_MAKERS=window.MAP_MAKERS||[];
const mapByKey=k=>MAP_MAKERS.find(m=>m.key===k);
const mapLabel=m=>m?(m.short||m.label):"";
function mapKeyForSled(s){
  if(!s||!+s.maker)return null;
  if(+s.maker===2){
    const md=String(s.model||"").toLowerCase();
    if(/yankee/.test(md))return "yclipper";
    if(/fire\s*fly|firefly/.test(md))return "firefly";
    return null;
  }
  const e=MAP_MAKERS.find(x=>x.id==s.maker&&!x.brand);
  return e?e.key:null;
}
function idChoiceFromKey(key, customText){
  if(key==="unknown")return {maker:0,makerText:"",model:""};
  if(key==="custom")return {maker:0,makerText:customText||"",model:""};
  const m=mapByKey(key);
  if(!m)return {maker:0,makerText:"",model:""};
  return {maker:m.id,makerText:"",model:m.brand||""};
}
const ID_DEMO={
  high:{band:"likely",title:"Likely Flexible Flyer",note:"These are sample scores for the mockup. A real model is not running.",
    rows:[{key:"fflyer",pct:72},{key:"firefly",pct:14},{key:"paris",pct:6},{key:"snw",pct:4},{key:"garton",pct:2}]},
  low:{band:"low",title:"Low confidence — no clear match",note:"When scores are low, choose Unknown maker or type a Custom guess rather than accepting a weak suggestion.",
    rows:[{key:"acme",pct:22},{key:"pratt",pct:18},{key:"kal",pct:11},{key:"garton",pct:9},{key:"paris",pct:8}]}
};

R.identify=()=>{
  bar("Identify a sled",{back:true,sub:"Photo search · demo"});tab("home");
  if(!premium())return databaseGate()+`<p class="legend">The photo-ID spec left membership as an open question. This mockup follows the existing membership pattern: running an identification, like the Sled Picker Map and the Sled Maker and Model Database, is for paid members. Posting after a match still needs membership too.</p>`;
  setTimeout(()=>{
    const preview=$("#idpreview"), file=$("#idfile"), go=$("#idgo"), results=$("#idresults"), hint=$("#idhint");
    const showPreview=src=>{preview.style.backgroundImage=`url('${src}')`;preview.classList.add("has");preview.dataset.src=src;go.disabled=false;hint.textContent="You can retake or choose a different photo, then run the demo identification."};
    file.onchange=async ev=>{const f=ev.target.files&&ev.target.files[0];if(!f)return;try{showPreview(await resizeFile(f))}catch(e){const r=new FileReader();r.onload=()=>showPreview(r.result);r.readAsDataURL(f)}};
    $("#idsample").onclick=()=>showPreview("images/flexible-flyer-3c-p60.jpg");
    const renderResults=(mode,busy)=>{
      if(busy){results.innerHTML=`<div class="id-busy"><span class="spin"></span> Identifying…</div>`;results.classList.remove("hide");return}
      const demo=ID_DEMO[mode]||ID_DEMO.high, low=demo.band==="low";
      const rows=demo.rows.map((r,i)=>{const m=mapByKey(r.key);return `<label class="id-row"><input type="radio" name="idpick" value="${r.key}" ${!low&&i===0?"checked":""}><span class="id-sw" style="background:${m?m.color:"#888"}"></span><span class="id-name">${esc(m?m.label:r.key)}</span><span class="id-pct">${r.pct}%</span><span class="id-bar"><i style="width:${r.pct}%;background:${m?m.color:"#888"}"></i></span></label>`}).join("");
      results.classList.remove("hide");
      results.innerHTML=`<div class="id-banner">Demo — sample results, not a real identification.</div>
        <div class="id-head"><b>${esc(demo.title)}</b><p>${esc(demo.note)}</p></div>
        <div class="id-list">${rows}</div>
        ${low?`<div class="id-low"><p>You can file this as <b>Unknown maker</b> or type a <b>Custom</b> guess (for example, “Likely Pratt or Kalamazoo”).</p>
          <div class="row2" style="margin-top:8px"><button type="button" class="btn sm" id="idunk">Unknown maker</button><button type="button" class="btn sm" id="idcustbtn">Custom…</button></div>
          <label class="hide" id="idcustwrap" style="margin-top:8px">Custom maker<input id="idcustom" placeholder="e.g. Likely Pratt or Kalamazoo"></label></div>`:""}
        <div class="id-fields form">
          <label>Estimated years of manufacture<input id="idyears" placeholder="e.g. c. 1925–1935"><small class="hint">The demo does not guess years. Leave blank if you are not sure.</small></label>
          <label>Origin ZIP<input id="idzip" inputmode="numeric" maxlength="5" placeholder="60193"><small class="hint">Town / ZIP level only. Never enter a street address.</small></label>
        </div>
        <button type="button" class="btn solid" id="idconfirm">${low?"Continue with a selection":"Confirm and add this sled"}</button>
        <button type="button" class="btn" id="idcorrect">Correct — pick a different maker</button>
        <div id="idcorrectbox" class="id-correct form hide">
          <label>Maker<select id="idalt"><option value="unknown">Unknown maker</option><option value="custom">Custom…</option>${MAP_MAKERS.map(m=>`<option value="${m.key}">${esc(m.label)}</option>`).join("")}</select></label>
          <label class="hide" id="idaltcw">Custom maker<input id="idaltcustom" placeholder="e.g. Likely Pratt or Kalamazoo"></label>
          <button type="button" class="btn pine" id="idaltgo">Use this maker and add the sled</button>
        </div>
        <button type="button" class="btn" id="iddone">I'm done — just needed the ID</button>
        <p class="legend" style="margin:8px 0 0"><button type="button" class="linkish" id="idtoggle">${low?"Show typical sample results":"Show the low-confidence example"}</button></p>`;
      const goAdd=sel=>{LS.set("idDraft",Object.assign({},sel,{years:($("#idyears")||{}).value||"",zip:($("#idzip")||{}).value||""}));location.hash="#/add"};
      const picked=()=>{const r=results.querySelector('input[name=idpick]:checked');return r?idChoiceFromKey(r.value):null};
      const conf=$("#idconfirm");if(conf)conf.onclick=()=>{const custom=($("#idcustom")||{}).value;if(custom&&String(custom).trim()){goAdd(idChoiceFromKey("custom",String(custom).trim()));return}const sel=picked();if(!sel){toast("Pick a maker, or use Unknown / Custom");return}goAdd(sel)};
      const corr=$("#idcorrect");if(corr)corr.onclick=()=>{$("#idcorrectbox").classList.remove("hide");$("#idcorrectbox").scrollIntoView({block:"nearest"})};
      const alt=$("#idalt"),cw=$("#idaltcw");if(alt)alt.onchange=()=>cw.classList.toggle("hide",alt.value!=="custom");
      const altgo=$("#idaltgo");if(altgo)altgo.onclick=()=>goAdd(idChoiceFromKey(alt.value,($("#idaltcustom")||{}).value||""));
      const unk=$("#idunk");if(unk)unk.onclick=()=>goAdd(idChoiceFromKey("unknown"));
      const cb=$("#idcustbtn");if(cb)cb.onclick=()=>{$("#idcustwrap").classList.remove("hide");const i=$("#idcustom");if(i)i.focus()};
      const done=$("#iddone");if(done)done.onclick=()=>{toast("Identification not posted");location.hash="#/home"};
      const tog=$("#idtoggle");if(tog)tog.onclick=()=>renderResults(low?"high":"low",false);
    };
    go.onclick=()=>{if(!preview.dataset.src){toast("Add a photo first");return}renderResults("high",true);setTimeout(()=>renderResults("high",false),700)};
  });
  return `<div class="id-banner">Demo — sample results, not a real identification.</div>
    <div class="pad id-flow">
      <p class="id-lead">Take or upload a photo of a vintage sled. This mockup does not run a real model; it shows how ranked matches, confirm/correct, and the add-sled form will work.</p>
      <div class="id-preview" id="idpreview"><span>No photo yet</span></div>
      <div class="row2">
        <label class="btn">Upload a photo<input type="file" id="idfile" accept="image/*" hidden></label>
        <button type="button" class="btn" id="idsample">Use a sample photo</button>
      </div>
      <p class="small muted" id="idhint">In a real build, location data is stripped from the photo before it is stored or sent. This demo never leaves your browser.</p>
      <div class="id-angles">
        <b>Helpful angles</b>
        <ul>
          <li>Top-down of the whole sled</li>
          <li>Side profile of the runners</li>
          <li>Close-up of a decal or stamp</li>
          <li>Underside hardware / bolt patterns</li><li>Steering bar (front crossbar)</li><li>Bumper / front end</li>
        </ul>
        <p>One clear photo is enough for this demo. Extra angles can be added later.</p>
      </div>
      <button type="button" class="btn solid" id="idgo" disabled>Identify (demo)</button>
      <div id="idresults" class="id-results hide"></div>
    </div>`;
};

R.map=()=>{const locked=!premium();
  bar("Sled Picker Map",{back:true,sub:locked?"Preview · members can use the map":"Where picked sleds were found · demo"});tab("makers");
  const userPins=locked?[]:allSleds().filter(s=>s.userAdded&&(s.shared||isOwn(s))&&s.lat!=null&&s.locType!=="na").map(s=>{const key=mapKeyForSled(s);return key?Object.assign({key,fromUser:true},s):null}).filter(Boolean);
  const demo=window.MAP_DEMO||{count:200,label:"Demo — 200 sample pins, not real finds.",makers:["fflyer","firefly","yclipper","paris","snw","acme","autowheel","garton","pratt","kal"]};
  const demoKeys=new Set(demo.makers||[]);
  const NE_BOUNDS=[[39.7,-80.55],[47.45,-66.95]];
  const showNE=m=>{if(m&&m.fitBounds)m.fitBounds(NE_BOUNDS,{padding:[16,16],maxZoom:7,animate:false})};
  setTimeout(()=>{
    if(!window.L){$("#map").innerHTML='<p class="pad small">Map library could not load (offline?).</p>';return}
    const map=L.map("map",{zoomControl:!locked,attributionControl:true,dragging:!locked,scrollWheelZoom:!locked,doubleClickZoom:!locked,boxZoom:!locked,keyboard:!locked,touchZoom:!locked,maxZoom:11});
    showNE(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:11,attribution:"© OpenStreetMap contributors"}).addTo(map);
    const layer=L.layerGroup().addTo(map);
    const selected=()=>locked?[...demoKeys]:[...document.querySelectorAll(".map-mks input:checked")].map(i=>i.value);
    const draw=()=>{
      layer.clearLayers();
      const on=new Set(selected());
      const pins=(window.SAMPLE_MAP_PINS||[]).filter(p=>on.has(p.key)).map(p=>Object.assign({sample:true},p))
        .concat(userPins.filter(p=>on.has(p.key)));
      const counts={};
      pins.forEach(p=>{
        const ent=mapByKey(p.key), color=ent?ent.color:"#555", name=ent?ent.label:p.key;
        counts[p.key]=(counts[p.key]||0)+1;
        const isHome=!!p.home;
        const c=L.circleMarker([p.lat,p.lng],{radius:isHome?11:7,weight:2,color:"#fff",fillColor:color,fillOpacity:.92,interactive:!locked});
        if(!locked){
          const html=p.fromUser
            ? `<div class="mp-card"><a href="#/sled/${p.id}"><div class="mp-ph" style="background-image:url('${p.img||(p.imgs&&p.imgs[0])||""}')"></div></a><b>${esc(mk(p))}</b><br>${esc(p.model)} · Est. ${esc(p.years||"Unknown")}<br><span>📍 ${esc(p.town||"")} · your post</span><br><a href="#/sled/${p.id}">Open →</a></div>`
            : `<div class="mp-card"><span class="sample-tag">SAMPLE</span>${isHome?' <span class="sample-tag" style="background:#e5efe9;color:var(--pine);border-color:#bcd3c5">Company home</span>':""}<br><b>${esc(name)}</b><br>${p.model?esc(p.model)+" · ":""}Est. ${esc(p.years)}<br><span>${esc(p.town)} · ZIP ${esc(p.zip)}</span><br><span>Sample pin — not a real find.${isHome?" Auto-Wheel Coaster home: North Tonawanda, NY.":""}</span></div>`;
          c.bindPopup(html,{maxWidth:240});
        }
        layer.addLayer(c);
      });
      const rows=MAP_MAKERS.filter(m=>counts[m.key]).map(m=>`<span class="map-leg-i"><i style="background:${m.color}"></i>${esc(m.short)} ${counts[m.key]}</span>`).join("");
      const el=$("#mlegend");if(el)el.innerHTML=rows||'<span class="muted">No makers selected</span>';
      const n=pins.length, shownSample=pins.filter(x=>x.sample).length, mc=$("#mcount");
      if(mc)mc.textContent=n+" pin"+(n===1?"":"s")+" shown · "+on.size+" maker"+(on.size===1?"":"s")+(shownSample?` · ${shownSample} sample`:"");
    };
    if(!locked){
      document.querySelectorAll(".map-mks input").forEach(i=>i.onchange=draw);
      $("#mapdemo").onclick=()=>{document.querySelectorAll(".map-mks input").forEach(i=>i.checked=demoKeys.has(i.value));draw()};
      $("#mapall").onclick=()=>{document.querySelectorAll(".map-mks input").forEach(i=>i.checked=true);draw()};
      $("#mapnone").onclick=()=>{document.querySelectorAll(".map-mks input").forEach(i=>i.checked=false);draw()};
    }else{
      const prev=$("#mapPreview");if(prev)prev.onclick=()=>{setRole("premium");toast("Demo role: Paid member");route()};
    }
    draw();setTimeout(()=>{map.invalidateSize();showNE(map)},50);
  });
  const banner=`<div class="map-banner">${esc(demo.label||"Demo — 200 sample pins, not real finds.")}</div>`;
  const legend=`<div id="mlegend" class="map-legend"></div>`;
  if(locked)return `${banner}
    <p class="legend">A map of where picked sleds were found. This Northeast demo (Maine through Pennsylvania) has 200 sample pins across ten makers, at town / ZIP level only. They are not real finds.</p>
    ${legend}
    <div class="map-stage">
      <div id="map" class="mapbox"></div>
      <div class="map-veil" aria-hidden="true"></div>
      <div class="map-lock-card">
        <div class="gl">🔒</div>
        <b>The Sled Picker Map is for members</b>
        <p>${lapsed()?"Renew to pan, zoom and open pins.":"Join to pan, zoom and open pins. This preview shows the Northeast demo."}</p>
        <a class="btn gold" href="#/upgrade">${lapsed()?"Renew membership · $15/yr":"Join · $15/yr"}</a>
        <button type="button" class="btn" id="mapPreview">Preview as member (demo)</button>
      </div>
    </div>`;
  return `${banner}
    <p class="legend">A map of where picked sleds were found. Use the 25 black-list makers to colour-code and filter the pins. This Northeast demo (Maine through Pennsylvania) has exactly 200 sample pins across ten makers, at town / ZIP level only — never a street address. They are not real finds. Fire Fly and Yankee Clipper are listed separately from Flexible Flyer.</p>
    <div class="map-actions"><button type="button" class="btn sm" id="mapdemo">Demo 10 makers</button><button type="button" class="btn sm" id="mapall">All 25</button><button type="button" class="btn sm" id="mapnone">Clear</button><span id="mcount" class="muted"></span></div>
    <div class="map-mks">${MAP_MAKERS.map(m=>`<label class="map-mk"><input type="checkbox" value="${m.key}" ${demoKeys.has(m.key)?"checked":""}><i style="background:${m.color}"></i>${esc(m.short)}</label>`).join("")}</div>
    ${legend}
    <div id="map" class="mapbox"></div>
    <p class="legend" style="padding-bottom:16px">Sleds you add in this browser with an origin ZIP and a black-list maker also appear, marked as your post. Green-list, unknown and custom makers stay off this map for now.</p>`;
};

R.mphotos=(arg)=>{const [mid,idx]=String(arg).split(",");const m=M(mid),x=m&&models(m)[+idx];if(!x)return R.makers();
  const ok=premium()||(isFree(m)&&+idx<(window.FREE_GALLERY_COUNT||5));if(!ok)return R.upgrade("Extra model photos are part of Premium.");
  bar(x.n,{back:true,sub:disp(m)});tab("makers");
  return `${gallery(mImgs(x),false)}<div class="title-block"><h1>${x.brand?esc(x.n):esc(disp(m))+" "+esc(x.n)}</h1>${x.brand?`<p class="small muted" style="margin:4px 0 0">${esc(x.brand)} brand · ${esc(companyOf(m)?companyOf(m).name:disp(m))}</p>`:""}<p class="small muted" style="margin:6px 0 0">${esc(x.d)}</p></div><div class="pad"><a class="btn pine" href="#/maker/${m.id}">Back to ${esc(disp(m))}</a></div>`;
};

R.unknown=()=>{bar("Unknown / unconfirmed makers",{back:true,sub:"Not filed under any real maker"});tab("makers");
  if(!premium())return databaseGate();
  const arr=allSleds().filter(s=>!+s.maker&&(s.shared||isOwn(s))),G={};
  arr.forEach(s=>{const k=(s.makerText||"").trim()||"Unknown maker";(G[k]=G[k]||[]).push(s)});
  return `<p class="legend" style="margin-top:12px">Posts whose maker is unknown or typed in as a guess. They stay here, not under any of the 61 makers, until Sled Finder confirms and reassigns them.${isAdmin()?" As admin, open a post and use Admin edit to pick the real maker.":""}</p>
  ${Object.keys(G).sort().map(k=>`<p class="grp-h"><b>${esc(k==="Unknown maker"?k:k+" (unconfirmed)")}</b> · ${G[k].length} post${G[k].length==1?"":"s"}</p>${groupList(G[k],null,true)}`).join("")||'<p class="small muted" style="padding:0 16px">No posts yet.</p>'}<div style="height:20px"></div>`;
};
R.terms=()=>{bar("Terms & Guidelines",{back:true,sub:"Draft for review"});tab("profile");
  const S=(h,ps)=>`<h3 class="sec">${h}</h3><div class="prose">${ps.map(p=>`<p>${p}</p>`).join("")}</div>`;
  return `<div class="mock-banner">DRAFT · plain-language summary for review · not legal advice · have a lawyer review before launch</div>
  <div class="mp-head"><p class="eyebrow">Sled Finder</p><h1>Terms &amp; Community Guidelines</h1><div class="small muted">Draft, November 2026. Placeholder text for the mockup.</div></div>
  ${S("1. Membership",["Posting sleds, posting sale ads, and seeing other members' posts and photos (the Sled Maker and Model Database, the Sled Picker Map, “What sled is this?” and collectors' sleds on maker pages) require a paid Sled Finder membership, currently $15 a year, renewing automatically until you cancel.","Without a membership you can still browse the maker directory, the free makers' curated galleries and Sleds for Sale listings."])}
  ${S("2. Your posts and photos",["You keep ownership of the photos and information you post.","By posting, you give Sled Finder permission to store, show, resize and organize your posts and photos inside Sled Finder for other members to see, for as long as they stay in Sled Finder. Your posts become part of Sled Finder's shared record of antique sleds."])}
  ${S("3. Only post photos you own",["Post only photos you took yourself or have permission to use. Don't post other people's photos, catalog scans or ads unless you have the right to share them."])}
  ${S("4. Keep it accurate",["Give the maker, model, estimated years of manufacture and location as accurately as you can. A best guess is fine. Choose “Unknown” or use a custom maker such as “Likely Pratt” when you're not sure.","Use town-level locations only. Never post a street address."])}
  ${S("5. Sled Finder may edit or remove posts",["To keep the record accurate, Sled Finder may correct a post's maker, model, years, location, name or photos, or remove posts and ads. Corrected posts show a small “Edited by Sled Finder” note.","Sled Finder may remove posts that break these guidelines, such as photos you don't have the right to share, off-topic or offensive content, or spam."])}
  ${S("6. Editing and deleting your own posts",["Paid members can edit or delete their own posts and ads. You can't edit other members' posts or Sled Finder's own content, such as maker histories."])}
  ${S("7. If your membership lapses",["Your posts stay in Sled Finder. While your membership is lapsed you can't see the Sled Maker and Model Database, including your own posts, and you can't post or edit. When you renew, your posts come back.","[To decide: whether a lapsed member's posts stay visible to other paid members in the meantime.]"])}
  ${S("8. Sleds for Sale",["Buying and selling happen directly between members by email. Sled Finder isn't part of the sale and doesn't hold payments or guarantee items, descriptions or shipping."])}
  ${S("9. Be respectful",["Be kind and helpful, especially when helping identify sleds. No harassment, spam or misleading listings."])}
  ${S("10. Changes",["Sled Finder may update these terms. If changes are significant, members will be told in the app."])}
  <p class="fine">Draft for discussion between Jonathan Spangler and his advisers. This is not legal advice.</p>`;
};
window.__toast=toast;
function route(){
  const h=(location.hash||"#/home").slice(2).split("/");const fn=R[h[0]]||R.home;
  $("#view").innerHTML=fn(h.length>2?h.slice(1).join(","):h[1]);$("#view").scrollTop=0;bindLikes();bindGalleries();
  const c=$("#cancelP");if(c)c.onclick=()=>{setRole("free");toast("Back to Free");route()};
  const rs=$("#roleSel");if(rs){rs.value=role();rs.onchange=()=>{setRole(rs.value);toast("Demo role: "+ROLES[rs.value]);route()}}
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{const it=b.dataset.kind==="listing"?allListings().find(x=>x.id==b.dataset.del):allSleds().find(x=>x.id==b.dataset.del);if(!canEdit(it))return;if(!confirm("Delete this "+b.dataset.kind+"? (mockup)"))return;
    if(b.dataset.kind==="listing"){deleteListing(b.dataset.del);toast("Listing deleted");location.hash="#/sale"}
    else{deleteSled(b.dataset.del);toast("Sled deleted");location.hash=isOwn(it)?"#/collection":"#/home"}});
}
window.addEventListener("hashchange",route);
document.addEventListener("invalid",e=>{const t=e.target,l=t.closest("label");toast(t.name==="ack"?"Please tick the agreement box to save.":"Please fill in: "+(l?(l.childNodes[0].textContent||"").replace("*","").trim()||t.name:t.name),4000)},true);
$("#resetDemo").onclick=()=>{["premium","role","sleds","liked","lastq","edits","deleted","listings","ledits","ldeleted","idDraft"].forEach(k=>localStorage.removeItem("svc_"+k));location.hash="#/home";route();toast("Demo reset")};
Promise.race([phOpen(),new Promise(r=>setTimeout(()=>r(null),3000))]).then(async db=>{PH.db=db;if(db)await phLoadAll(db);route()});
})();
