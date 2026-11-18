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
// Demo roles: free (never paid), premium (paid member), lapsed (membership ran out), admin (Jonathan / Sled Finder).
const ROLES={free:"Free (never paid)",premium:"Paid member",lapsed:"Membership lapsed",admin:"Admin · Sled Finder (Jonathan)"};
const role=()=>{const r=LS.get("role",null);return ROLES[r]?r:(LS.get("premium",false)?"premium":"free")};
const setRole=r=>{LS.set("role",r);LS.set("premium",r==="premium"||r==="admin")};
const premium=()=>{const r=role();return r==="premium"||r==="admin"};
const isAdmin=()=>role()==="admin";
const lapsed=()=>role()==="lapsed";
const userSleds=()=>LS.get("sleds",[]);
const normPics=s=>{const o=Object.assign({},s);o.imgs=(o.imgs&&o.imgs.length?o.imgs:(o.img?[o.img]:[]));o.img=o.imgs[0]||"";o.years=o.years||o.year||"Unknown";return o};
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
function resizeFile(file){return new Promise(res=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,700/Math.max(im.width,im.height));const c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);res(c.toDataURL("image/jpeg",.72))};im.src=r.result};r.readAsDataURL(file)})}
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
// Membership gate: posting and viewing community posts require paid membership.
const lapsedText=n=>`Your membership has lapsed. ${n?`Your ${n} earlier post${n==1?"":"s"} stay`:"Your earlier posts stay"} in Sled Finder and come back as soon as you renew.`;
const gate=(title,text)=>`<div class="gate"><div class="gl">🔒</div><b>${title}</b><p>${text}</p><a class="btn gold" href="#/upgrade">${lapsed()?"Renew membership · $15/yr":"Join · $15/yr"}</a><a class="small" href="#/terms">Terms &amp; Community Guidelines (draft)</a></div>`;
const communityGate=()=>gate(lapsed()?"Membership lapsed":"Community posts are for members",lapsed()?lapsedText(0)+" Renew to see community posts again.":"Paid members post their sleds and see everyone's posts, photos, the map and ID help. Free members can still browse the free makers' galleries and Sleds for Sale.");
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

function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("show"),1900)}
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
    if(zip||city){const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=us&limit=1&${q}`,{headers:{"Accept":"application/json"}});
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
  <div class="chips"><a class="chip on" href="#/home">Community feed</a><a class="chip" href="#/idhelp">What sled is this?</a><a class="chip" href="#/map">🗺 Map</a><a class="chip" href="#/sale">Sleds for Sale</a><a class="chip" href="#/search">Search</a><a class="chip" href="#/timeline">Timeline ${premium()?"":"🔒"}</a><a class="chip" href="#/magazine">Magazine ${premium()?"":"🔒"}</a></div>
  ${premium()?"":`<h3 class="sec">Community feed</h3>${communityGate()}`}
  ${!premium()?"":`<h3 class="sec">What sled is this? <a href="#/idhelp">See all</a></h3>
  <div style="padding:0 16px">${window.ID_POSTS.slice(0,1).map(q=>`<a class="card idcard" href="#/idhelp"><div class="th" style="background-image:url('${q.img}')"></div><div><div class="small" style="font-weight:600">@${esc(q.user)} <span class="sample-tag">Example</span></div><div style="font-size:.84rem;margin-top:3px">${esc(q.q)}</div><div class="small muted" style="margin-top:3px">${q.answers.length} answer${q.answers.length==1?"":"s"} · Help identify →</div></div></a>`).join("")}</div>`}
  <h3 class="sec">Free makers <a href="#/makers">All 61</a></h3>
  <div class="hscroll">${free.map(m=>`<a class="card mk" href="#/maker/${m.id}"><div class="th" style="background-image:url('${(mImgs(models(m).find(x=>mImgs(x).length)||{})[0])||""}')"></div><div class="n">${esc(disp(m))}</div><div class="d">${esc(m.area)}</div></a>`).join("")}</div>
  ${premium()?"":`<a class="promo" href="#/upgrade"><img class="cv" src="images/vintage-runner-tuxedo-racer-cover-p1.jpg" alt=""><div><b>Become a member</b><span style="display:block;opacity:.8;margin-bottom:2px">${Object.keys(FREE).length} free · ${61-Object.keys(FREE).length} premium</span><span>Post your sleds, see the community feed, full histories, period ads, the timeline, the magazine and selling. $15/year.</span></div></a>`}
  <h3 class="sec">Sleds for Sale <a href="#/sale">See all</a></h3>
  <div class="hscroll">${window.SALE_LISTINGS.slice(0,4).map(l=>`<a class="card mk" href="#/listing/${l.id}"><div class="th" style="background-image:url('${l.img}')"></div><div class="n">${l.price?esc(l.price)+" · ":""}${esc(l.title.replace("[sample] ",""))}</div><div class="d">${esc(l.town)} · Ships: ${esc(l.ship)}</div></a>`).join("")}</div>
  ${premium()?`<h3 class="sec">Community feed</h3><div class="feed">${feed.map(postCard).join("")}</div>`:""}`;
};
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
  if(!editId&&!premium()){bar("Add a Sled",{sub:"Members only"});tab("add");return gate(lapsed()?"Membership lapsed":"Posting sleds is for members",lapsed()?lapsedText(allSleds().filter(isOwn).length)+" Renew to post again.":"Adding and sharing your sleds is part of Sled Finder membership ($15/yr).")}
  if(editId&&!canEdit(E))return R.upgrade("Editing your own submissions is a paid-member feature.");
  const adminEdit=E&&isAdmin()&&!isOwn(E);
  bar(E?(adminEdit?"Admin edit":"Edit Sled"):"Add a Sled",{back:!!E,sub:E?(adminEdit?"@"+E.user+" · as Sled Finder":"Your submission"):"Members"});tab(E?"collection":"add");
  const v=k=>E&&E[k]!=null?esc(E[k]):"";
  const pics=["collection-red-swirl-deck-photos-p28.jpg","collection-pictorial-deck-photos-p31.jpg","sherwood-bros-sled-top-owner-horizontal.jpg","whx-young-america-c1855-p51.jpg","paris-dirigo-clipper-p56.jpg"];
  setTimeout(()=>{
    const getPics=picker("addpk",E?E.imgs:[],pics.map(p=>"images/"+p));
    bindMaker("addmk",E);
    if(E){$("#addf").condition.value=E.condition;const lt=$("#addf").querySelector(`input[name=locType][value=${E.locType||"found"}]`);if(lt)lt.checked=true;$("#addf").shared.checked=!!E.shared}
    $("#addunk").onclick=()=>{$("#addf").years.value="Unknown"};
    $("#addf").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);
      const lt=f.get("locType"),city=f.get("city"),st=f.get("state"),zip=f.get("zip");
      let g=null,town="NA";
      if(lt!=="na"){g=(city||st||zip)?await geocode(city,st,zip):null;town=city?(city+(st?", "+st.toUpperCase():"")):(zip?"ZIP "+zip:(st?st.toUpperCase():""));
        if(!town&&E){town=E.town;g=E.lat!=null?{lat:E.lat,lng:E.lng,how:E.geo}:null}}
      const base=E?Object.assign({},E):{id:"u"+Date.now(),user:"you",userAdded:true,mine:true,likes:0};
      const s=Object.assign(base,makerVals(f),{model:f.get("model")||"Untitled sled",years:String(f.get("years")||"").trim()||"Unknown",year:undefined,size:f.get("size")||"—",condition:f.get("condition"),found:f.get("found")||"—",notes:f.get("notes")||"",shared:!!f.get("shared"),locType:lt,town:town,lat:g?g.lat:null,lng:g?g.lng:null,geo:g?g.how:null,imgs:getPics().length?getPics():["images/collection-red-swirl-deck-photos-p28.jpg"],img:undefined});s.img=s.imgs[0];if(adminEdit)s.editedBy="Sled Finder";
      if(E){saveSled(s);toast("Changes saved")}else{const u=userSleds();u.unshift(s);LS.set("sleds",u);toast("Sled saved to your collection")}
      location.hash="#/sled/"+s.id};
  });
  const [ci,stt]=(E&&E.town&&E.town!=="NA"&&!/^ZIP /.test(E.town))?E.town.split(/,\s*/):["",""];
  return `<form class="form" id="addf">
  ${pickerHTML("addpk",false)}
  ${makerFields("addmk",E)}
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
  <label class="toggle"><span>Share with the community<small>Off = only you can see it</small></span><span class="sw"><input type="checkbox" name="shared" checked><i></i></span></label>
  ${adminEdit?'<p class="legend" style="margin:0;padding:0">Saving marks this post “Edited by Sled Finder”.</p>':ackHTML()}
  <button class="btn solid" type="submit">${E?"Save changes":"Save sled"}</button>
  ${E?"":`<p class="legend" style="margin:0">Paid members can edit or delete their own posts later.</p><a class="btn" href="#/idhelp">Not sure? Ask “What sled is this?”</a>`}</form>`;
};
R.edit=id=>R.add(id);
R.sled=id=>{const s=allSleds().find(x=>x.id==id);if(!s)return R.home();const m=+s.maker?M(s.maker):null;
  if(!premium()){bar("Sled",{back:true});tab(isOwn(s)?"collection":"home");return isOwn(s)&&lapsed()?gate("Membership lapsed",lapsedText(allSleds().filter(isOwn).length)):communityGate()}
  bar(m?disp(m):"Sled",{back:true,sub:s.model});tab(s.mine||s.userAdded?"collection":"home");
  const grp=sameModel(s);
  return `${gallery(s.imgs,hidden(s))}
  <div class="title-block"><h1>${esc(mk(s))} ${esc(s.model)}</h1><div class="small muted" style="margin-top:4px">@${esc(s.user)}${sampleTag(s)} · ${s.shared?"Shared":"🔒 Private"}</div>${editedNote(s)}</div>
  ${nudge(s)?`<div style="padding:8px 16px 0">${nudge(s)}</div>`:""}<dl class="dl"><div><dt>Maker</dt><dd>${m?`<a href="#/maker/${m.id}">${esc(disp(m))}</a>`:(s.makerText?esc(s.makerText)+' <span class="unconf">unconfirmed</span>':"Unknown maker")}</dd></div><div><dt>Model</dt><dd>${esc(s.model)}</dd></div><div><dt>Est. years made</dt><dd>${esc(s.years)}</dd></div><div><dt>Size</dt><dd>${esc(s.size)}</dd></div><div><dt>Condition</dt><dd>${esc(s.condition)}</dd></div><div><dt>Where found</dt><dd>${esc(s.found)}</dd></div>${s.town||s.locType==="na"?`<div><dt>Map location</dt><dd>${esc(locLine(s))}${!s.userAdded?" [sample]":""}${s.lat!=null?' · <a href="#/map">Map</a>':""}</dd></div>`:""}<div><dt>Notes</dt><dd>${esc(s.notes)}</dd></div></dl>
  ${isOwn(s)&&m&&!isFree(m)&&!premium()?teaser(m):""}<div style="padding:16px;display:flex;flex-direction:column;gap:10px">${m?`<a class="btn pine" href="#/maker/${m.id}">About ${esc(disp(m))}</a>`:`<a class="btn pine" href="#/unknown">Unknown / unconfirmed makers</a>`}${editBar(s,"#/edit/"+s.id,"sled")}</div>
  ${m&&grp.length>1?`<h3 class="sec">${esc(mk(s))} ${esc(s.model)}: ${grp.length} collectors</h3>${groupList(grp,s.id)}`:""}`;
};
R.makers=()=>{bar("Makers",{sub:"61 American sled companies",act:'<a class="act" href="#/map" aria-label="Map">🗺</a>'});tab("makers");
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
  <h3 class="sec">Collectors' sleds by model</h3>${!premium()?communityGate():(()=>{const G={};allSleds().filter(s=>s.maker==m.id&&(s.shared||isOwn(s))).forEach(s=>{(G[modelKey(s)]=G[modelKey(s)]||[]).push(s)});const ks=Object.keys(G);
    return ks.length?ks.map(k=>{const g=G[k];return `<p class="grp-h"><b>${esc(disp(m))} ${esc(g[0].model)}</b> · ${g.length} collector${g.length==1?"":"s"}</p>${groupList(g)}`}).join(""):'<p class="small muted" style="padding:0 16px">No shared sleds yet.</p>'})()}<div style="height:20px"></div>`;
};
R.search=()=>{bar("Search",{back:true,sub:"Makers, models, collectors"});tab("home");
  setTimeout(()=>{const i=$("#q"),out=$("#res");const run=()=>{const q=i.value.trim().toLowerCase();
    if(!q){out.innerHTML='<p class="legend">Try “Flyer”, “Chicago”, “Speedster” or “Garton”.</p>';return}
    const mk=MAKERS.filter(m=>(disp(m)+" "+m.name+" "+m.models+" "+m.area).toLowerCase().includes(q));
    const sl=premium()?allSleds().filter(s=>s.shared||s.mine||s.userAdded).filter(s=>(mk(s)+" "+s.model+" "+s.user+" "+s.years).toLowerCase().includes(q)):[];
    out.innerHTML=`<h3 class="sec">Makers (${mk.length})</h3><div class="list card">${mk.map(m=>`<a class="mrow" href="#/maker/${m.id}"><span class="num">${m.id}</span><span class="tx"><div class="n">${esc(disp(m))}</div><div class="d">${esc(m.area)} · ${esc(m.models||"")}</div></span>${isFree(m)?'<span class="free-pill">Free</span>':premium()?"›":"🔒"}</a>`).join("")||'<div class="mrow">No makers</div>'}</div>
    ${premium()?`<h3 class="sec">Collectors' sleds (${sl.length})</h3><div class="grid2">${sl.map(s=>`<a class="card tile" href="${tileHref(s)}">${tileTh(s)}<div class="n">${esc(mk(s))}</div><div class="d">${esc(s.model)} · ${esc(s.years)}</div><div class="d">@${esc(s.user)}</div></a>`).join("")}</div>`:`<h3 class="sec">Collectors' sleds</h3>${communityGate()}`}`};
    i.oninput=run;i.value=LS.get("lastq","Paris");run();i.addEventListener("change",()=>LS.set("lastq",i.value))});
  return `<div class="search"><span>⌕</span><input id="q" placeholder="Search makers, models, collectors" autofocus></div><div id="res"></div>`;
};
R.idhelp=()=>{bar("What sled is this?",{back:true,sub:"Community ID help"});tab("home");
  if(!premium())return communityGate();
  return `<div class="pad"><a class="btn solid" href="#/add">📷 Post a photo for ID</a></div>
  <div class="feed">${window.ID_POSTS.map(q=>`<article class="card post"><div class="ph" style="background-image:url('${q.img}')"></div><div class="meta"><div class="who"><span class="av">${initials(q.user)}</span>@${esc(q.user)} <span class="sample-tag">Example data</span></div><div style="font-size:.88rem">${esc(q.q)}</div>
  ${q.answers.map(a=>`<div style="margin-top:8px;padding:8px 10px;background:var(--stone);border-radius:10px;font-size:.8rem">${esc(a)}</div>`).join("")}
  <div class="bar"><span>💬 ${q.answers.length} answers</span><span>✋ I know this one</span></div></div></article>`).join("")}</div>`;
};
R.timeline=()=>{if(!premium())return paywall("The Coasting Through History timeline is part of Premium.");
  bar("Coasting Through History",{back:true,sub:"Sledding in America"});tab("home");
  return `<p class="legend" style="margin-top:14px">From the Rosebud Sled Museum timeline prepared for the Gail Borden Public Library display (Jan 2027). Green dots are Illinois stories.</p>
  <ol class="tl">${window.TIMELINE.map(t=>`<li class="${t.il?"il":""}"><div class="y">${esc(t.y)}${t.il?"<em>Illinois</em>":""}</div><p>${esc(t.t)}</p></li>`).join("")}</ol>`;
};
R.magazine=()=>{if(!premium())return paywall("Vintage Runner Magazine is included with Premium.");
  bar("Vintage Runner",{back:true,sub:"Magazine · included"});tab("home");
  return `<div class="pad"><div class="card" style="display:flex;gap:14px;padding:14px;align-items:center"><img src="images/vintage-runner-tuxedo-racer-cover-p1.jpg" style="width:110px;border-radius:4px;box-shadow:0 4px 10px rgba(0,0,0,.25)" alt="Vintage Runner cover"><div><div class="eyebrow" style="margin:0 0 4px">Issue 1</div><b style="font-family:var(--serif);font-size:1.3rem">Vintage Runner Magazine</b><p class="small muted">Read on your phone. [Mockup: the reader is not built yet.]</p><button class="btn pine" style="padding:10px" onclick="window.__toast('Mockup: magazine reader would open here')">Read issue</button></div></div>
  <p class="legend">Print copies are still sold separately; Apple only allows digital content in an in-app subscription.</p></div>`;
};
function paywall(reason){return R.upgrade(reason)}
R.upgrade=(reason)=>{bar(window.APP_NAME+" Premium",{back:true,sub:"Mock paywall"});tab("");
  if(premium()){return `<div class="mock-banner">MOCKUP · no real payment was taken</div><div class="pad" style="text-align:center"><p style="font-family:var(--serif);font-size:1.6rem;margin:20px 0 6px">${isAdmin()?"Admin preview (Sled Finder)":"You're previewing Premium"}</p><p class="small muted">All 61 makers, model lists, ads, the timeline, the magazine and selling are unlocked in this demo.</p><div style="display:flex;flex-direction:column;gap:10px;margin-top:18px"><a class="btn pine" href="#/makers">Browse all 61 makers</a><a class="btn" href="#/timeline">Open the timeline</a><button class="btn" id="cancelP">End preview (back to Free)</button></div></div>`}
  setTimeout(()=>{$("#buy").onclick=()=>{const was=lapsed();setRole("premium");toast(was?"Mockup: membership renewed, your posts are back":"Mockup: Premium unlocked, no payment taken");location.hash=was?"#/collection":"#/makers"}});
  const r=(t,f,p)=>`<div class="r"><span>${t}</span><span class="${f?"yes":"no"}">${f===true?"✓":f||"—"}</span><span class="yes">✓</span></div>`;
  return `<div class="mock-banner">MOCKUP · no real payment · nothing is charged</div>
  <div class="pw-hero"><p class="eyebrow" style="color:#e7b7a5">${esc(window.APP_NAME)} Premium</p><h1>${lapsed()?"Welcome back. Renew to bring your posts back.":"Post, see and sell sleds. All 61 makers."}</h1><p>${esc(typeof reason==="string"?reason:(lapsed()?lapsedText(allSleds().filter(isOwn).length):"Your research library and community for antique sleds."))}</p></div>
  <div class="compare"><div class="r h"><span>What you get</span><span>Free</span><span>Premium</span></div>
  ${r("Search makers & models",true)}${r("Browse Sleds for Sale",true)}${r("Maker profiles",`${Object.keys(FREE).length} free, limited`)}${r("Curated model galleries","Limited")}${r("Post & catalog your sleds",false)}${r("See community posts, photos & map",false)}${r("“What sled is this?” ID help",false)}${r("All 61 company histories",false)}${r("Complete model lists & extra photos",false)}${r("Period advertisements",false)}${r("Sell your sleds",false)}${r("Edit & delete your own submissions",false)}${r("Coasting Through History timeline",false)}${r("Vintage Runner Magazine (digital)",false)}${r("Printable insurance list",false)}</div>
  <div class="price"><div><div class="small muted">Yearly · renews automatically</div><b>$15.00 / year</b></div><span class="badge-prem">Best value</span></div>
  <div class="pad"><button class="btn gold" id="buy">${lapsed()?"Renew membership (mock)":"Start Premium (mock)"}</button><a class="btn" style="margin-top:10px;border:0" href="#/home">Not now</a></div>
  <p class="fine">In the real app, payment would go through the App Store. The subscription renews each year unless cancelled at least 24 hours before renewal in your phone's Settings. This mockup does not charge anything. If a membership lapses, your posts stay in Sled Finder and come back when you renew. See the <a href="#/terms">Terms &amp; Community Guidelines (draft)</a>.</p>`;
};
R.profile=()=>{bar("Profile",{sub:ROLES[role()]});tab("profile");
  setTimeout(()=>{document.querySelectorAll("input[name=role]").forEach(r=>r.onchange=()=>{setRole(r.value);toast("Demo role: "+ROLES[r.value]);route()})});
  const mine=allSleds().filter(s=>s.mine||s.userAdded);
  return `<div class="prof"><span class="av big">SC</span><div><h1>@sample_collector</h1><div class="small muted">Example profile · ${mine.length} sleds · joined 2026</div></div></div>
  <div class="menu"><a href="#/collection">My collection <span>›</span></a><a href="#/idhelp">My ID requests <span>›</span></a><a href="#/upgrade">Subscription <span class="small muted">${ROLES[role()]} ›</span></a></div>
  <h3 class="sec">Demo role switcher</h3><div class="menu roles">${Object.keys(ROLES).map(k=>`<label><span>${ROLES[k]}</span><input type="radio" name="role" value="${k}" ${role()===k?"checked":""}></label>`).join("")}</div>
  <div class="menu"><a href="#/timeline">Coasting Through History ${premium()?"":"🔒"}<span>›</span></a><a href="#/magazine">Vintage Runner Magazine ${premium()?"":"🔒"}<span>›</span></a><a href="#/makers">Sled makers directory <span>›</span></a></div>
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
    $("#sellf").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const P=getPics();if(!P.length){toast("Please add at least one photo");return}
      const l=Object.assign({},E||{id:"ul"+Date.now(),user:"you",mine:true},makerVals(f),{years:String(f.get("years")||"").trim()||"Unknown",title:f.get("title"),ship:f.get("ship"),email:f.get("email"),model:f.get("model"),condition:f.get("condition"),price:f.get("price")?"$"+String(f.get("price")).replace(/^\$/,""):"",town:f.get("town"),imgs:P,img:P[0],desc:String(f.get("desc")||"").slice(0,500)});if(adminEdit)l.editedBy="Sled Finder";
      if(E){saveListing(l);toast("Listing updated")}else{const u=LS.get("listings",[]);u.unshift(l);LS.set("listings",u);toast("Listing posted (mockup)")}location.hash="#/listing/"+l.id}});
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
R.map=()=>{bar("Sled Map",{back:true,sub:"Shared sleds · town level"});tab("makers");
  if(!premium())return communityGate();
  const pts=allSleds().filter(s=>(s.shared||isOwn(s))&&s.lat!=null&&s.locType!=="na");
  const mks=[...new Set(pts.map(s=>s.maker))].map(M).filter(Boolean).sort((a,b)=>disp(a).localeCompare(disp(b)));
  setTimeout(()=>{
    if(!window.L){$("#map").innerHTML='<p class="pad small">Map library could not load (offline?).</p>';return}
    const map=L.map("map",{zoomControl:true}).setView([42.0,-85.0],5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:12,attribution:"© OpenStreetMap contributors"}).addTo(map);
    const layer=L.layerGroup().addTo(map);
    const draw=()=>{layer.clearLayers();const fm=$("#fmaker").value,ft=$("#ftype").value;let n=0;const b=[];
      pts.filter(s=>(fm==="all"||s.maker==fm)&&(ft==="all"||s.locType===ft)).forEach(s=>{n++;
        const ph=hidden(s)?`<a class="mp-lock" href="#/upgrade">🔒<br>Premium maker. Upgrade to see</a>`:`<a href="#/sled/${s.id}"><div class="mp-ph" style="background-image:url('${s.img}')"></div></a>`;
        const html=`<div class="mp-card">${ph}<b>${esc(mk(s))}</b><br>${esc(s.model)} · ${esc(s.years)}<br><span>${esc(locLine(s))}</span><br><span>@${esc(s.user)}${isOwn(s)?"":" · Example data"}</span><br><a href="${hidden(s)?"#/upgrade":"#/sled/"+s.id}">Open →</a></div>`;
        const c=L.circleMarker([s.lat,s.lng],{radius:9,weight:2,color:"#fff",fillColor:s.locType==="now"?"#1d3328":"#8a1c1c",fillOpacity:.95}).bindPopup(html,{maxWidth:220});
        layer.addLayer(c);b.push([s.lat,s.lng]);});
      $("#mcount").textContent=n+" sled"+(n==1?"":"s");if(b.length>1)map.fitBounds(b,{padding:[30,30],maxZoom:8});else if(b.length)map.setView(b[0],8);};
    $("#fmaker").onchange=draw;$("#ftype").onchange=draw;draw();setTimeout(()=>map.invalidateSize(),50);
  });
  return `<div class="mapf"><select id="fmaker"><option value="all">All makers</option>${mks.map(m=>`<option value="${m.id}">${esc(disp(m))}</option>`).join("")}<option value="0">Unknown / unconfirmed</option></select>
  <select id="ftype"><option value="all">Found + current</option><option value="found">Where found</option><option value="now">Where it is now</option></select></div>
  <div class="maplegend"><span><i style="background:#8a1c1c"></i>Found / sourced</span><span><i style="background:#1d3328"></i>Where it is now</span><span id="mcount" class="muted"></span></div>
  <div id="map" class="mapbox"></div>
  <p class="legend" style="padding-bottom:16px">Pins are placed at the town only, never a street address. Sample pins are example towns. Premium-maker photos from other collectors stay locked for free members.</p>`;
};
R.mphotos=(arg)=>{const [mid,idx]=String(arg).split(",");const m=M(mid),x=m&&models(m)[+idx];if(!x)return R.makers();
  const ok=premium()||(isFree(m)&&+idx<(window.FREE_GALLERY_COUNT||5));if(!ok)return R.upgrade("Extra model photos are part of Premium.");
  bar(x.n,{back:true,sub:disp(m)});tab("makers");
  return `${gallery(mImgs(x),false)}<div class="title-block"><h1>${x.brand?esc(x.n):esc(disp(m))+" "+esc(x.n)}</h1>${x.brand?`<p class="small muted" style="margin:4px 0 0">${esc(x.brand)} brand · ${esc(companyOf(m)?companyOf(m).name:disp(m))}</p>`:""}<p class="small muted" style="margin:6px 0 0">${esc(x.d)}</p></div><div class="pad"><a class="btn pine" href="#/maker/${m.id}">Back to ${esc(disp(m))}</a></div>`;
};

R.unknown=()=>{bar("Unknown / unconfirmed makers",{back:true,sub:"Not filed under any real maker"});tab("makers");
  if(!premium())return communityGate();
  const arr=allSleds().filter(s=>!+s.maker&&(s.shared||isOwn(s))),G={};
  arr.forEach(s=>{const k=(s.makerText||"").trim()||"Unknown maker";(G[k]=G[k]||[]).push(s)});
  return `<p class="legend" style="margin-top:12px">Posts whose maker is unknown or typed in as a guess. They stay here, not under any of the 61 makers, until Sled Finder confirms and reassigns them.${isAdmin()?" As admin, open a post and use Admin edit to pick the real maker.":""}</p>
  ${Object.keys(G).sort().map(k=>`<p class="grp-h"><b>${esc(k==="Unknown maker"?k:k+" (unconfirmed)")}</b> · ${G[k].length} post${G[k].length==1?"":"s"}</p>${groupList(G[k],null,true)}`).join("")||'<p class="small muted" style="padding:0 16px">No posts yet.</p>'}<div style="height:20px"></div>`;
};
R.terms=()=>{bar("Terms & Guidelines",{back:true,sub:"Draft for review"});tab("profile");
  const S=(h,ps)=>`<h3 class="sec">${h}</h3><div class="prose">${ps.map(p=>`<p>${p}</p>`).join("")}</div>`;
  return `<div class="mock-banner">DRAFT · plain-language summary for review · not legal advice · have a lawyer review before launch</div>
  <div class="mp-head"><p class="eyebrow">Sled Finder</p><h1>Terms &amp; Community Guidelines</h1><div class="small muted">Draft, November 2026. Placeholder text for the mockup.</div></div>
  ${S("1. Membership",["Posting sleds, posting sale ads, and seeing other members' posts and photos (the community feed, the map, “What sled is this?” and collectors' sleds on maker pages) require a paid Sled Finder membership, currently $15 a year, renewing automatically until you cancel.","Without a membership you can still browse the maker directory, the free makers' curated galleries and Sleds for Sale listings."])}
  ${S("2. Your posts and photos",["You keep ownership of the photos and information you post.","By posting, you give Sled Finder permission to store, show, resize and organize your posts and photos inside Sled Finder for other members to see, for as long as they stay in Sled Finder. Your posts become part of Sled Finder's shared record of antique sleds."])}
  ${S("3. Only post photos you own",["Post only photos you took yourself or have permission to use. Don't post other people's photos, catalog scans or ads unless you have the right to share them."])}
  ${S("4. Keep it accurate",["Give the maker, model, estimated years of manufacture and location as accurately as you can. A best guess is fine. Choose “Unknown” or use a custom maker such as “Likely Pratt” when you're not sure.","Use town-level locations only. Never post a street address."])}
  ${S("5. Sled Finder may edit or remove posts",["To keep the record accurate, Sled Finder may correct a post's maker, model, years, location, name or photos, or remove posts and ads. Corrected posts show a small “Edited by Sled Finder” note.","Sled Finder may remove posts that break these guidelines, such as photos you don't have the right to share, off-topic or offensive content, or spam."])}
  ${S("6. Editing and deleting your own posts",["Paid members can edit or delete their own posts and ads. You can't edit other members' posts or Sled Finder's own content, such as maker histories."])}
  ${S("7. If your membership lapses",["Your posts stay in Sled Finder. While your membership is lapsed you can't see community posts, including your own, and you can't post or edit. When you renew, your posts come back.","[To decide: whether a lapsed member's posts stay visible to other paid members in the meantime.]"])}
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
$("#resetDemo").onclick=()=>{["premium","role","sleds","liked","lastq","edits","deleted","listings","ledits","ldeleted"].forEach(k=>localStorage.removeItem("svc_"+k));location.hash="#/home";route();toast("Demo reset")};
route();
})();
