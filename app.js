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
const canSell=()=>window.SALE_POSTING!=="premium"||premium();
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem("svc_"+k))??d}catch(e){return d}},set:(k,v)=>localStorage.setItem("svc_"+k,JSON.stringify(v))};
const premium=()=>LS.get("premium",false);
const userSleds=()=>LS.get("sleds",[]);
const normPics=s=>{const o=Object.assign({},s);o.imgs=(o.imgs&&o.imgs.length?o.imgs:(o.img?[o.img]:[]));o.img=o.imgs[0]||"";return o};
const allSleds=()=>{const ov=LS.get("edits",{}),del=LS.get("deleted",[]);return userSleds().concat(window.SAMPLE_SLEDS.map(s=>ov[s.id]?Object.assign({},s,ov[s.id]):s)).filter(s=>!del.includes(s.id)).map(normPics)};
const allListings=()=>LS.get("listings",[]).concat(window.SALE_LISTINGS).map(normPics);
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
// Editing rule: only Premium members, only their OWN submissions. Maker histories and museum content are never editable.
const canEdit=item=>!!item&&!!(item.mine||item.userAdded)&&premium();
function saveSled(s){if(String(s.id).startsWith("u")){const u=userSleds().map(x=>x.id===s.id?s:x);LS.set("sleds",u)}else{const ov=LS.get("edits",{});ov[s.id]=s;LS.set("edits",ov)}}
function deleteSled(id){if(String(id).startsWith("u")){LS.set("sleds",userSleds().filter(x=>x.id!==id))}else{const d=LS.get("deleted",[]);d.push(id);LS.set("deleted",d)}}
const editBar=(item,editHref,kind)=>!(item.mine||item.userAdded)?"":(premium()?`<div class="row2"><a class="btn" href="${editHref}">✎ Edit ${kind}</a><button class="btn" data-del="${item.id}" data-kind="${kind}" style="color:var(--red);border-color:var(--red)">Delete</button></div>`:`<a class="btn" href="#/upgrade">🔒 Upgrade to edit your submissions</a>`);
const liked=()=>LS.get("liked",{});
document.title=window.APP_NAME+" — clickable mockup";
$("#sideTitle").textContent=window.APP_NAME;

function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("show"),1900)}
function bar(title,{back=false,sub="",act=""}={}){
  $("#appbar").innerHTML=(back?'<button class="back" onclick="history.length>1?history.back():location.hash=\'#/home\'" aria-label="Back">‹</button>':"")+
  '<h2>'+esc(title)+(sub?'<span class="sub">'+esc(sub)+'</span>':"")+'</h2>'+(premium()?'<span class="badge-prem">Premium</span>':"")+act;
}
function tab(t){document.querySelectorAll(".tabbar a").forEach(a=>a.classList.toggle("on",a.dataset.tab===t))}
const isOwn=s=>!!(s.mine||s.userAdded);
const hidden=s=>{const m=M(s.maker);return !premium()&&!isOwn(s)&&!!m&&!isFree(m)};
const lockedPh=(cls,tag="a")=>`<${tag} class="${cls} lockph"${tag==="a"?' href="#/upgrade"':""}><span class="lk">🔒</span><span class="lt">Premium maker. Upgrade to see</span></${tag}>`;
const tileHref=s=>hidden(s)?"#/upgrade":"#/sled/"+s.id;
const tileTh=s=>hidden(s)?lockedPh("th","div"):`<div class="th" style="background-image:url('${s.img}')"></div>`;
const groupList=(arr,cur)=>`<div class="list card">${arr.map(x=>`<a class="mrow" href="${tileHref(x)}"><span class="gthumb">${hidden(x)?'<span class="glk">🔒</span>':`<span style="background-image:url('${x.img}')"></span>`}</span><span class="tx"><div class="n">@${esc(x.user)}${x.id===cur?" · this entry":""}${isOwn(x)?" (you)":""}</div><div class="d">📍 ${esc(x.locType==="na"?"Location NA":(x.town||"—"))} · ${x.imgs.length} photo${x.imgs.length==1?"":"s"}${hidden(x)?" · Premium maker":""}</div></span><span class="lk">›</span></a>`).join("")}</div>`;
const nudge=s=>{const m=M(s.maker);return isOwn(s)&&m&&!isFree(m)&&!premium()?`<a class="nudge" href="#/upgrade">🔒 Unlock the full history of ${esc(disp(m))} →</a>`:""};
const makerName=id=>disp(M(id));
const sampleTag=s=>s.user&&!s.userAdded?' <span class="sample-tag">Example data</span>':"";
const initials=u=>u.replace(/[^a-z]/gi," ").trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();

function postCard(s){
  const L=liked()[s.id];
  return `<article class="card post">${hidden(s)?lockedPh("ph"):`<a href="#/sled/${s.id}"><div class="ph" style="background-image:url('${s.img}')">${s.imgs&&s.imgs.length>1?`<span class="pcount">▣ ${s.imgs.length}</span>`:""}</div></a>`}
  <div class="meta"><div class="who"><span class="av">${initials(s.user)}</span>@${esc(s.user)}${sampleTag(s)}</div>
  <a href="#/sled/${s.id}" style="text-decoration:none"><div class="t">${esc(makerName(s.maker))} ${esc(s.model)}</div>
  <div class="m">${esc(s.year)} · ${esc(s.condition)}</div></a>${nudge(s)}
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
  <h3 class="sec">What sled is this? <a href="#/idhelp">See all</a></h3>
  <div style="padding:0 16px">${window.ID_POSTS.slice(0,1).map(q=>`<a class="card idcard" href="#/idhelp"><div class="th" style="background-image:url('${q.img}')"></div><div><div class="small" style="font-weight:600">@${esc(q.user)} <span class="sample-tag">Example</span></div><div style="font-size:.84rem;margin-top:3px">${esc(q.q)}</div><div class="small muted" style="margin-top:3px">${q.answers.length} answer${q.answers.length==1?"":"s"} · Help identify →</div></div></a>`).join("")}</div>
  <h3 class="sec">Free makers <a href="#/makers">All 61</a></h3>
  <div class="hscroll">${free.map(m=>`<a class="card mk" href="#/maker/${m.id}"><div class="th" style="background-image:url('${(mImgs(models(m).find(x=>mImgs(x).length)||{})[0])||""}')"></div><div class="n">${esc(disp(m))}</div><div class="d">${esc(m.area)}</div></a>`).join("")}</div>
  ${premium()?"":`<a class="promo" href="#/upgrade"><img class="cv" src="images/vintage-runner-tuxedo-racer-cover-p1.jpg" alt=""><div><b>Unlock all 61 makers</b><span style="display:block;opacity:.8;margin-bottom:2px">${Object.keys(FREE).length} free · ${61-Object.keys(FREE).length} premium</span><span>Full histories, complete model lists, period ads, the timeline, the magazine and selling your sleds. $15/year.</span></div></a>`}
  <h3 class="sec">Sleds for Sale <a href="#/sale">See all</a></h3>
  <div class="hscroll">${window.SALE_LISTINGS.slice(0,4).map(l=>`<a class="card mk" href="#/listing/${l.id}"><div class="th" style="background-image:url('${l.img}')"></div><div class="n">${l.price?esc(l.price)+" · ":""}${esc(l.title.replace("[sample] ",""))}</div><div class="d">${esc(l.town)} · Ships: ${esc(l.ship)}</div></a>`).join("")}</div>
  <h3 class="sec">Community feed</h3>
  <div class="feed">${feed.map(postCard).join("")}</div>`;
};
R.collection=()=>{bar("My Collection",{sub:"@sample_collector",act:'<a class="act" href="#/add" aria-label="Add">＋</a>'});tab("collection");
  const mine=allSleds().filter(s=>s.mine||s.userAdded);
  const makers=new Set(mine.map(s=>s.maker));
  return `<div class="stats"><div><b>${mine.length}</b><span>Sleds</span></div><div><b>${makers.size}</b><span>Makers</span></div><div><b>${mine.filter(s=>s.shared).length}</b><span>Shared</span></div></div>
  <div class="chips"><span class="chip on">All</span><span class="chip">Shared</span><span class="chip">Private</span><span class="chip">By maker</span><a class="chip" href="#/upgrade">🖨 Insurance list ${premium()?"":"🔒"}</a></div>
  <div class="grid2">${mine.map(s=>`<a class="card tile" href="#/sled/${s.id}"><div class="th" style="background-image:url('${s.img}')"></div><span class="vis">${s.shared?"Shared":"🔒 Private"}</span><div class="n">${esc(makerName(s.maker))}</div><div class="d">${esc(s.model)} · ${esc(s.year)}</div>${M(s.maker)&&!isFree(M(s.maker))&&!premium()?'<div class="d" style="color:var(--red);font-weight:600">🔒 Unlock full history</div>':""}</a>`).join("")}</div>
  <p class="legend" style="margin-bottom:20px">Sleds marked as samples are example data for this mockup. Sleds you add here are stored only in this browser.</p>`;
};
R.add=(editId)=>{const E=editId?allSleds().find(x=>x.id==editId):null;
  if(editId&&!canEdit(E))return R.upgrade("Editing your own submissions is a Premium feature.");
  bar(E?"Edit Sled":"Add a Sled",{back:!!E,sub:E?"Your submission":"Free · unlimited"});tab(E?"collection":"add");
  const v=k=>E&&E[k]!=null?esc(E[k]):"";
  const pics=["collection-red-swirl-deck-photos-p28.jpg","collection-pictorial-deck-photos-p31.jpg","sherwood-bros-sled-top-owner-horizontal.jpg","whx-young-america-c1855-p51.jpg","paris-dirigo-clipper-p56.jpg"];
  setTimeout(()=>{
    const getPics=picker("addpk",E?E.imgs:[],pics.map(p=>"images/"+p));
    if(E){$("#addf").maker.value=E.maker;$("#addf").condition.value=E.condition;const lt=$("#addf").querySelector(`input[name=locType][value=${E.locType||"found"}]`);if(lt)lt.checked=true;$("#addf").shared.checked=!!E.shared}
    $("#addf").onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);
      const lt=f.get("locType"),city=f.get("city"),st=f.get("state"),zip=f.get("zip");
      let g=null,town="NA";
      if(lt!=="na"){g=(city||st||zip)?await geocode(city,st,zip):null;town=city?(city+(st?", "+st.toUpperCase():"")):(zip?"ZIP "+zip:(st?st.toUpperCase():""));
        if(!town&&E){town=E.town;g=E.lat!=null?{lat:E.lat,lng:E.lng,how:E.geo}:null}}
      const base=E?Object.assign({},E):{id:"u"+Date.now(),user:"you",userAdded:true,mine:true,likes:0};
      const s=Object.assign(base,{maker:+f.get("maker"),model:f.get("model")||"Untitled sled",year:f.get("year")||"Unknown",size:f.get("size")||"—",condition:f.get("condition"),found:f.get("found")||"—",notes:f.get("notes")||"",shared:!!f.get("shared"),locType:lt,town:town,lat:g?g.lat:null,lng:g?g.lng:null,geo:g?g.how:null,imgs:getPics().length?getPics():["images/collection-red-swirl-deck-photos-p28.jpg"],img:undefined});s.img=s.imgs[0];
      if(E){saveSled(s);toast("Changes saved")}else{const u=userSleds();u.unshift(s);LS.set("sleds",u);toast("Sled saved to your collection")}
      location.hash="#/sled/"+s.id};
  });
  const [ci,stt]=(E&&E.town&&E.town!=="NA"&&!/^ZIP /.test(E.town))?E.town.split(/,\s*/):["",""];
  return `<form class="form" id="addf">
  ${pickerHTML("addpk",false)}
  <label>Maker<select name="maker"><option value="0">Unknown / not sure</option>${makerOpts()}</select></label>
  <label>Model<input name="model" value="${v("model")}" placeholder="e.g. Speedster, Lightning Guider"></label>
  <div class="row2"><label>Year / era<input name="year" value="${v("year")}" placeholder="c. 1925"></label><label>Size<input name="size" value="${v("size")}" placeholder="e.g. 42 in."></label></div>
  <label>Condition<select name="condition"><option>Excellent</option><option selected>Good</option><option>Fair</option><option>Poor</option><option>Restored</option></select></label>
  <label>Where found<input name="found" value="${v("found")}" placeholder="Estate sale, barn, auction…"></label>
  <fieldset class="locset"><legend>Map location (town level only)</legend>
  <div class="seg"><label><input type="radio" name="locType" value="found" checked> Where it was found / sourced</label><label><input type="radio" name="locType" value="now"> Where it is now</label><label><input type="radio" name="locType" value="na"> Unknown / NA (no map pin)</label></div>
  <div class="row2"><label>City<input name="city" value="${esc(ci||"")}" placeholder="Schaumburg"></label><label>State<input name="state" value="${esc(stt||"")}" placeholder="IL" maxlength="20"></label></div>
  <label>or ZIP<input name="zip" inputmode="numeric" maxlength="5" placeholder="60193"></label>
  <small class="muted" style="font-size:.7rem">Only the town shows on the map. Never enter a street address. Choose NA if you don't know.</small></fieldset>
  <label>Notes<textarea name="notes" placeholder="Stencils, stamps, repairs, provenance…">${v("notes")}</textarea></label>
  <label class="toggle"><span>Share with the community<small>Off = only you can see it</small></span><span class="sw"><input type="checkbox" name="shared" checked><i></i></span></label>
  <button class="btn solid" type="submit">${E?"Save changes":"Save sled"}</button>
  ${E?"":`<p class="legend" style="margin:0">After saving, editing is a Premium feature.</p><a class="btn" href="#/idhelp">Not sure? Ask “What sled is this?”</a>`}</form>`;
};
R.edit=id=>R.add(id);
R.sled=id=>{const s=allSleds().find(x=>x.id==id);if(!s)return R.home();const m=M(s.maker);
  bar(m?disp(m):"Sled",{back:true,sub:s.model});tab(s.mine||s.userAdded?"collection":"home");
  const grp=sameModel(s);
  return `${gallery(s.imgs,hidden(s))}
  <div class="title-block"><h1>${esc(makerName(s.maker))} ${esc(s.model)}</h1><div class="small muted" style="margin-top:4px">@${esc(s.user)}${sampleTag(s)} · ${s.shared?"Shared":"🔒 Private"}</div></div>
  ${nudge(s)?`<div style="padding:8px 16px 0">${nudge(s)}</div>`:""}<dl class="dl"><div><dt>Maker</dt><dd>${m?`<a href="#/maker/${m.id}">${esc(disp(m))}</a>`:"Unknown"}</dd></div><div><dt>Model</dt><dd>${esc(s.model)}</dd></div><div><dt>Year</dt><dd>${esc(s.year)}</dd></div><div><dt>Size</dt><dd>${esc(s.size)}</dd></div><div><dt>Condition</dt><dd>${esc(s.condition)}</dd></div><div><dt>Where found</dt><dd>${esc(s.found)}</dd></div>${s.town||s.locType==="na"?`<div><dt>Map location</dt><dd>${esc(locLine(s))}${!s.userAdded?" [sample]":""}${s.lat!=null?' · <a href="#/map">Map</a>':""}</dd></div>`:""}<div><dt>Notes</dt><dd>${esc(s.notes)}</dd></div></dl>
  ${isOwn(s)&&m&&!isFree(m)&&!premium()?teaser(m):""}<div style="padding:16px;display:flex;flex-direction:column;gap:10px">${m?`<a class="btn pine" href="#/maker/${m.id}">About ${esc(disp(m))}</a>`:""}${editBar(s,"#/edit/"+s.id,"sled")}</div>
  ${grp.length>1?`<h3 class="sec">${esc(makerName(s.maker))} ${esc(s.model)}: ${grp.length} collectors</h3>${groupList(grp,s.id)}`:""}`;
};
R.makers=()=>{bar("Makers",{sub:"61 American sled companies",act:'<a class="act" href="#/map" aria-label="Map">🗺</a>'});tab("makers");
  setTimeout(()=>{const i=$("#mq");i.oninput=()=>{const q=i.value.toLowerCase();document.querySelectorAll(".mrow").forEach(r=>r.style.display=r.dataset.s.includes(q)?"":"none")}});
  const row=m=>`<a class="mrow" href="#/maker/${m.id}" data-s="${esc((disp(m)+" "+m.name+" "+m.area+" "+m.models+" "+(companyOf(m)?companyOf(m).name+" "+companyOf(m).brands.map(b=>b.name).join(" "):"")).toLowerCase())}"><span class="num">${m.id}</span><span class="tx"><div class="n">${esc(disp(m))}</div><div class="d"><span class="dot ${m.book?"blk":"grn"}"></span>${esc(m.area||"Location unknown")}${m.years?" · "+esc(m.years):""}</div>${companyOf(m)?`<div class="d co">Brand of ${esc(companyOf(m).name)}</div>`:""}</span>${isFree(m)?'<span class="free-pill">Free</span>':(premium()?'<span class="lk">›</span>':'<span class="lk">🔒</span>')}</a>`;
  const free=MAKERS.filter(isFree),rest=MAKERS.filter(m=>!isFree(m));
  return `<div class="search"><span>⌕</span><input id="mq" placeholder="Search 61 makers, towns, models"></div>
  <p class="legend"><span class="dot blk"></span>Listed in Joan Palicia's books &nbsp; <span class="dot grn"></span>Jonathan Spangler's finds</p>
  <p class="legend" style="margin-top:8px;font-weight:600;color:var(--ink-soft)">${free.length} free makers · ${rest.length} premium</p>
  <h3 class="sec">Free makers (${free.length}) <span class="small muted" style="font-family:var(--sans)">limited gallery</span></h3><div class="list card">${free.map(row).join("")}</div>
  <h3 class="sec">${premium()?"Premium profiles":"Premium · name & dates only"} (${rest.length}) ${premium()?"":'<a href="#/upgrade">Unlock</a>'}</h3><div class="list card">${rest.map(row).join("")}</div>`;
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
  <h3 class="sec">Collectors' sleds by model</h3>${(()=>{const G={};allSleds().filter(s=>s.maker==m.id&&(s.shared||isOwn(s))).forEach(s=>{(G[modelKey(s)]=G[modelKey(s)]||[]).push(s)});const ks=Object.keys(G);
    return ks.length?ks.map(k=>{const g=G[k];return `<p class="grp-h"><b>${esc(disp(m))} ${esc(g[0].model)}</b> · ${g.length} collector${g.length==1?"":"s"}</p>${groupList(g)}`}).join(""):'<p class="small muted" style="padding:0 16px">No shared sleds yet.</p>'})()}<div style="height:20px"></div>`;
};
R.search=()=>{bar("Search",{back:true,sub:"Makers, models, collectors"});tab("home");
  setTimeout(()=>{const i=$("#q"),out=$("#res");const run=()=>{const q=i.value.trim().toLowerCase();
    if(!q){out.innerHTML='<p class="legend">Try “Flyer”, “Chicago”, “Speedster” or “Garton”.</p>';return}
    const mk=MAKERS.filter(m=>(disp(m)+" "+m.name+" "+m.models+" "+m.area).toLowerCase().includes(q));
    const sl=allSleds().filter(s=>s.shared||s.mine||s.userAdded).filter(s=>(makerName(s.maker)+" "+s.model+" "+s.user).toLowerCase().includes(q));
    out.innerHTML=`<h3 class="sec">Makers (${mk.length})</h3><div class="list card">${mk.map(m=>`<a class="mrow" href="#/maker/${m.id}"><span class="num">${m.id}</span><span class="tx"><div class="n">${esc(disp(m))}</div><div class="d">${esc(m.area)} · ${esc(m.models||"")}</div></span>${isFree(m)?'<span class="free-pill">Free</span>':premium()?"›":"🔒"}</a>`).join("")||'<div class="mrow">No makers</div>'}</div>
    <h3 class="sec">Collectors' sleds (${sl.length})</h3><div class="grid2">${sl.map(s=>`<a class="card tile" href="${tileHref(s)}">${tileTh(s)}<div class="n">${esc(makerName(s.maker))}</div><div class="d">${esc(s.model)} · @${esc(s.user)}</div></a>`).join("")}</div>`};
    i.oninput=run;i.value=LS.get("lastq","Paris");run();i.addEventListener("change",()=>LS.set("lastq",i.value))});
  return `<div class="search"><span>⌕</span><input id="q" placeholder="Search makers, models, collectors" autofocus></div><div id="res"></div>`;
};
R.idhelp=()=>{bar("What sled is this?",{back:true,sub:"Community ID help"});tab("home");
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
  if(premium()){return `<div class="mock-banner">MOCKUP · no real payment was taken</div><div class="pad" style="text-align:center"><p style="font-family:var(--serif);font-size:1.6rem;margin:20px 0 6px">You're previewing Premium</p><p class="small muted">All 61 makers, model lists, ads, the timeline, the magazine and selling are unlocked in this demo.</p><div style="display:flex;flex-direction:column;gap:10px;margin-top:18px"><a class="btn pine" href="#/makers">Browse all 61 makers</a><a class="btn" href="#/timeline">Open the timeline</a><button class="btn" id="cancelP">End preview (back to Free)</button></div></div>`}
  setTimeout(()=>{$("#buy").onclick=()=>{LS.set("premium",true);toast("Mockup: Premium unlocked, no payment taken");location.hash="#/makers"}});
  const r=(t,f,p)=>`<div class="r"><span>${t}</span><span class="${f?"yes":"no"}">${f===true?"✓":f||"—"}</span><span class="yes">✓</span></div>`;
  return `<div class="mock-banner">MOCKUP · no real payment · nothing is charged</div>
  <div class="pw-hero"><p class="eyebrow" style="color:#e7b7a5">${esc(window.APP_NAME)} Premium</p><h1>All 61 makers. Every model. Sell your sleds.</h1><p>${esc(typeof reason==="string"?reason:"Your research library for antique sleds.")}</p></div>
  <div class="compare"><div class="r h"><span>What you get</span><span>Free</span><span>Premium</span></div>
  ${r("Catalog unlimited sleds",true)}${r("Community feed & “What sled is this?”",true)}${r("Search makers & models",true)}${r("Browse Sleds for Sale",true)}${r("Maker profiles",`${Object.keys(FREE).length} free, limited`)}${r("Model galleries","Limited")}${r("All 61 company histories",false)}${r("Complete model lists & extra photos",false)}${r("Period advertisements",false)}${r("Sell your sleds",false)}${r("Edit & delete your own submissions",false)}${r("Coasting Through History timeline",false)}${r("Vintage Runner Magazine (digital)",false)}${r("Printable insurance list",false)}</div>
  <div class="price"><div><div class="small muted">Yearly · renews automatically</div><b>$15.00 / year</b></div><span class="badge-prem">Best value</span></div>
  <div class="pad"><button class="btn gold" id="buy">Start Premium (mock)</button><a class="btn" style="margin-top:10px;border:0" href="#/home">Not now</a></div>
  <p class="fine">In the real app, payment would go through the App Store. The subscription renews each year unless cancelled at least 24 hours before renewal in your phone's Settings. This mockup does not charge anything.</p>`;
};
R.profile=()=>{bar("Profile",{sub:premium()?"Premium (preview)":"Free plan"});tab("profile");
  setTimeout(()=>{$("#pt").onchange=e=>{LS.set("premium",e.target.checked);toast(e.target.checked?"Previewing Premium":"Back to Free");route()}});
  const mine=allSleds().filter(s=>s.mine||s.userAdded);
  return `<div class="prof"><span class="av big">SC</span><div><h1>@sample_collector</h1><div class="small muted">Example profile · ${mine.length} sleds · joined 2026</div></div></div>
  <div class="menu"><a href="#/collection">My collection <span>›</span></a><a href="#/idhelp">My ID requests <span>›</span></a><a href="#/upgrade">Subscription <span class="small muted">${premium()?"Premium preview":"Free"} ›</span></a><label>Preview as Premium (demo) <span class="sw"><input type="checkbox" id="pt" ${premium()?"checked":""}><i></i></span></label></div>
  <div class="menu"><a href="#/timeline">Coasting Through History ${premium()?"":"🔒"}<span>›</span></a><a href="#/magazine">Vintage Runner Magazine ${premium()?"":"🔒"}<span>›</span></a><a href="#/makers">Sled makers directory <span>›</span></a></div>
  <div class="menu"><a href="#/profile" onclick="return false">About · Rosebud Sled Museum, Schaumburg, IL <span></span></a><a href="#/profile" onclick="return false">Privacy: private sleds are visible only to you <span></span></a></div>
  <p class="legend" style="padding-bottom:24px">Clickable mockup for review. No accounts, servers or payments.</p>`;
};
R.sale=()=>{bar("Sleds for Sale",{sub:"Collector marketplace",act:`<a class="act" href="${canSell()?"#/sell":"#/upgrade"}" aria-label="Sell">${canSell()?"＋":"🔒"}</a>`});tab("sale");
  const L=allListings();
  return `<div class="pad" style="padding-bottom:4px">${canSell()?'<a class="btn solid" href="#/sell">＋ Post a sled for sale</a>':'<a class="btn" href="#/upgrade">🔒 Post a sled for sale <span class="small" style="text-transform:none;letter-spacing:0">· Premium members</span></a>'}</div>
  <p class="legend">Browse free. ${window.SALE_POSTING==="premium"?"Posting a listing is a Premium feature.":"Anyone can post a listing."} Locations are shown by town only.</p>
  <div class="feed" style="margin-top:12px">${L.map(l=>`<a class="card post" href="#/listing/${l.id}" style="text-decoration:none"><div class="ph" style="background-image:url('${l.img}')"></div><div class="meta"><div class="who"><span class="av">${initials(l.user)}</span>@${esc(l.user)} ${l.mine?'<span class="sample-tag" style="background:#e5efe9;color:var(--pine);border-color:#bcd3c5">Your listing</span>':'<span class="sample-tag">Example data</span>'}</div><div class="t">${l.price?esc(l.price)+" · ":""}${esc(l.title)}</div><div class="m">${esc(makerName(l.maker))}${l.model?" · "+esc(l.model):""}${l.condition?" · "+esc(l.condition):""}</div><div class="m">📍 ${esc(l.town)} · 📦 Ships: ${esc(l.ship)}</div><div class="m">✉ ${esc(l.email)}</div>${l.desc?`<p class="snip">${esc(l.desc)}</p>`:""}</div></a>`).join("")}</div>`;
};
R.listing=id=>{const l=allListings().find(x=>x.id==id);if(!l)return R.sale();
  bar("For Sale",{back:true,sub:l.price||"Price not listed"});tab("sale");
  return `${gallery(l.imgs,false)}
  <div class="title-block"><h1>${esc(l.title)}</h1><div style="font-family:var(--serif);font-size:1.6rem;font-weight:700;color:var(--red);margin-top:4px">${l.price?esc(l.price):'<span class="muted" style="font-size:1rem">Price not listed · contact seller</span>'}</div><div class="small muted">@${esc(l.user)} ${l.mine?"· Your listing":'<span class="sample-tag">Example data</span>'}</div></div>
  <dl class="dl"><div><dt>Maker</dt><dd>${M(l.maker)?`<a href="#/maker/${l.maker}">${esc(makerName(l.maker))}</a>`:"Unknown"}</dd></div><div><dt>Model</dt><dd>${esc(l.model||"—")}</dd></div><div><dt>Condition</dt><dd>${esc(l.condition)}</dd></div><div><dt>Location</dt><dd>${esc(l.town)}</dd></div><div><dt>Can ship?</dt><dd>${esc(l.ship)}</dd></div><div><dt>Contact</dt><dd><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></dd></div></dl>${l.desc?`<div class="prose" style="padding-top:12px"><p>${esc(l.desc)}</p></div>`:""}
  <div class="pad"><a class="btn solid" href="mailto:${esc(l.email)}?subject=${encodeURIComponent("Your sled listing: "+l.title)}">✉ Email seller</a><div style="margin-top:10px">${editBar(l,"#/editlisting/"+l.id,"listing")}</div><p class="legend" style="margin:10px 0 0">Opens your email app. Sample listings use example.com addresses, which don't reach anyone. No sale happens in the app.</p></div>`;
};
R.editlisting=id=>R.sell(id);
R.sell=(editId)=>{const E=editId?LS.get("listings",[]).find(x=>x.id==editId):null;
  if(editId&&!canEdit(E))return R.upgrade("Editing your own submissions is a Premium feature.");
  if(!canSell())return R.upgrade("Selling your sleds is a Premium feature. Browsing listings stays free.");
  bar(E?"Edit Listing":"Post a Sled for Sale",{back:true,sub:"Saved in this browser only"});tab("sale");
  const pics=["sale-flexible-flyer-eagle-deck.jpg","sale-hand-painted-sled.jpg","collection-red-swirl-deck-photos-p28.jpg","collection-pictorial-deck-photos-p31.jpg"];
  setTimeout(()=>{const getPics=picker("sellpk",E?normPics(E).imgs:[],pics.map(p=>"images/"+p));if(E){const F=$("#sellf");F.title.value=E.title;F.maker.value=E.maker;F.model.value=E.model||"";F.condition.value=E.condition||"Good";F.price.value=(E.price||"").replace(/^\$/,"");F.town.value=E.town;F.ship.value=E.ship;F.email.value=E.email;F.desc.value=E.desc||"";$("#scount").textContent=F.desc.value.length+" / 500"}const ta=$("#sdesc"),sc=$("#scount");ta.oninput=()=>{sc.textContent=ta.value.length+" / 500"};
    $("#sellf").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const P=getPics();if(!P.length){toast("Please add at least one photo");return}
      const l={id:"ul"+Date.now(),user:"you",mine:true,title:f.get("title"),ship:f.get("ship"),email:f.get("email"),maker:+f.get("maker"),model:f.get("model"),condition:f.get("condition"),price:f.get("price")?"$"+String(f.get("price")).replace(/^\$/,""):"",town:f.get("town"),imgs:P,img:P[0],desc:String(f.get("desc")||"").slice(0,500)};
      if(E){l.id=E.id;LS.set("listings",LS.get("listings",[]).map(x=>x.id===E.id?l:x));toast("Listing updated")}else{const u=LS.get("listings",[]);u.unshift(l);LS.set("listings",u);toast("Listing posted (mockup)")}location.hash="#/listing/"+l.id}});
  return `<form class="form" id="sellf">${pickerHTML("sellpk",true)}
  <label>Sled name *<input name="title" required placeholder="e.g. Flexible Flyer No. 3C, original paint"></label>
  <label>Maker<select name="maker"><option value="0">Unknown / not sure</option>${makerOpts()}</select></label>
  <label>Model<input name="model" placeholder="Model name if known"></label>
  <div class="row2"><label>Condition<select name="condition"><option>Excellent</option><option selected>Good</option><option>Fair</option><option>Poor</option><option>Restored</option></select></label><label>Price (optional)<input name="price" inputmode="decimal" placeholder="150"></label></div>
  <label>Location (town, state) *<input name="town" required placeholder="e.g. Schaumburg, IL"><small style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted)">Town only. Please don't post a street address.</small></label>
  <label>Can ship? *<select name="ship" required><option value="">Choose…</option><option>Yes</option><option>No</option></select></label>
  <label>Contact email *<input name="email" type="email" required placeholder="you@example.com"><small style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted)">Shown on your listing so buyers can email you.</small></label>
  <label>Description (optional)<textarea name="desc" id="sdesc" maxlength="500" placeholder="Markings, size, repairs, pickup or shipping…"></textarea><small id="scount" style="text-transform:none;letter-spacing:0;font-weight:400;color:var(--muted);text-align:right">0 / 500</small></label>
  <button class="btn solid" type="submit">${E?"Save changes":"Post listing"}</button></form>`;
};
R.map=()=>{bar("Sled Map",{back:true,sub:"Shared sleds · town level"});tab("makers");
  const pts=allSleds().filter(s=>(s.shared||isOwn(s))&&s.lat!=null&&s.locType!=="na");
  const mk=[...new Set(pts.map(s=>s.maker))].map(M).filter(Boolean).sort((a,b)=>disp(a).localeCompare(disp(b)));
  setTimeout(()=>{
    if(!window.L){$("#map").innerHTML='<p class="pad small">Map library could not load (offline?).</p>';return}
    const map=L.map("map",{zoomControl:true}).setView([42.0,-85.0],5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:12,attribution:"© OpenStreetMap contributors"}).addTo(map);
    const layer=L.layerGroup().addTo(map);
    const draw=()=>{layer.clearLayers();const fm=$("#fmaker").value,ft=$("#ftype").value;let n=0;const b=[];
      pts.filter(s=>(fm==="all"||s.maker==fm)&&(ft==="all"||s.locType===ft)).forEach(s=>{n++;
        const ph=hidden(s)?`<a class="mp-lock" href="#/upgrade">🔒<br>Premium maker. Upgrade to see</a>`:`<a href="#/sled/${s.id}"><div class="mp-ph" style="background-image:url('${s.img}')"></div></a>`;
        const html=`<div class="mp-card">${ph}<b>${esc(makerName(s.maker))}</b><br>${esc(s.model)}<br><span>${esc(locLine(s))}</span><br><span>@${esc(s.user)}${isOwn(s)?"":" · Example data"}</span><br><a href="${hidden(s)?"#/upgrade":"#/sled/"+s.id}">Open →</a></div>`;
        const c=L.circleMarker([s.lat,s.lng],{radius:9,weight:2,color:"#fff",fillColor:s.locType==="now"?"#1d3328":"#8a1c1c",fillOpacity:.95}).bindPopup(html,{maxWidth:220});
        layer.addLayer(c);b.push([s.lat,s.lng]);});
      $("#mcount").textContent=n+" sled"+(n==1?"":"s");if(b.length>1)map.fitBounds(b,{padding:[30,30],maxZoom:8});else if(b.length)map.setView(b[0],8);};
    $("#fmaker").onchange=draw;$("#ftype").onchange=draw;draw();setTimeout(()=>map.invalidateSize(),50);
  });
  return `<div class="mapf"><select id="fmaker"><option value="all">All makers</option>${mk.map(m=>`<option value="${m.id}">${esc(disp(m))}</option>`).join("")}</select>
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
window.__toast=toast;
function route(){
  const h=(location.hash||"#/home").slice(2).split("/");const fn=R[h[0]]||R.home;
  $("#view").innerHTML=fn(h.length>2?h.slice(1).join(","):h[1]);$("#view").scrollTop=0;bindLikes();bindGalleries();
  const c=$("#cancelP");if(c)c.onclick=()=>{LS.set("premium",false);toast("Back to Free");route()};
  document.querySelectorAll("[data-del]").forEach(b=>b.onclick=()=>{if(!premium())return;if(!confirm("Delete this "+b.dataset.kind+"? (mockup)"))return;
    if(b.dataset.kind==="listing"){LS.set("listings",LS.get("listings",[]).filter(x=>x.id!==b.dataset.del));toast("Listing deleted");location.hash="#/sale"}
    else{deleteSled(b.dataset.del);toast("Sled deleted");location.hash="#/collection"}});
}
window.addEventListener("hashchange",route);
$("#resetDemo").onclick=()=>{["premium","sleds","liked","lastq"].forEach(k=>localStorage.removeItem("svc_"+k));location.hash="#/home";route();toast("Demo reset")};
route();
})();
