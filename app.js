(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const MAKERS=window.MAKERS_RAW.map(r=>({id:r[0],name:r[1],type:r[2],years:r[3],models:r[4],area:r[5],book:r[6],p:window.PROFILES[r[0]]||null}));
const M=id=>MAKERS.find(m=>m.id==id);
const isFree=m=>!!(m.p&&m.p.free);
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem("svc_"+k))??d}catch(e){return d}},set:(k,v)=>localStorage.setItem("svc_"+k,JSON.stringify(v))};
const premium=()=>LS.get("premium",false);
const userSleds=()=>LS.get("sleds",[]);
const allSleds=()=>userSleds().concat(window.SAMPLE_SLEDS);
const liked=()=>LS.get("liked",{});
document.title=window.APP_NAME+" — clickable mockup";
$("#sideTitle").textContent=window.APP_NAME;

function toast(t){const e=$("#toast");e.textContent=t;e.classList.add("show");clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove("show"),1900)}
function bar(title,{back=false,sub="",act=""}={}){
  $("#appbar").innerHTML=(back?'<button class="back" onclick="history.length>1?history.back():location.hash=\'#/home\'" aria-label="Back">‹</button>':"")+
  '<h2>'+esc(title)+(sub?'<span class="sub">'+esc(sub)+'</span>':"")+'</h2>'+(premium()?'<span class="badge-prem">Premium</span>':"")+act;
}
function tab(t){document.querySelectorAll(".tabbar a").forEach(a=>a.classList.toggle("on",a.dataset.tab===t))}
const makerName=id=>{const m=M(id);return m?m.name:"Unknown maker"};
const sampleTag=s=>s.user&&!s.userAdded?' <span class="sample-tag">Example data</span>':"";
const initials=u=>u.replace(/[^a-z]/gi," ").trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();

function postCard(s){
  const L=liked()[s.id];
  return `<article class="card post"><a href="#/sled/${s.id}"><div class="ph" style="background-image:url('${s.img}')"></div></a>
  <div class="meta"><div class="who"><span class="av">${initials(s.user)}</span>@${esc(s.user)}${sampleTag(s)}</div>
  <a href="#/sled/${s.id}" style="text-decoration:none"><div class="t">${esc(makerName(s.maker))} ${esc(s.model)}</div>
  <div class="m">${esc(s.year)} · ${esc(s.condition)}</div></a>
  <div class="bar"><button data-like="${s.id}">${L?"♥":"♡"} ${s.likes+(L?1:0)}</button><span>💬 Comment</span><span>↗ Share</span></div></div></article>`;
}
function bindLikes(){document.querySelectorAll("[data-like]").forEach(b=>b.onclick=()=>{const l=liked();l[b.dataset.like]=!l[b.dataset.like];LS.set("liked",l);route()})}

const R={};
R.home=()=>{bar(window.APP_SHORT,{sub:"Vintage Runner",act:'<a class="act" href="#/search" aria-label="Search">⌕</a>'});tab("home");
  const feed=allSleds().filter(s=>s.shared);
  const free=MAKERS.filter(isFree);
  return `<div class="hero" style="background-image:url(images/hero-flexible-flyer-3c-deck-p60.jpg)"><div class="in"><b>Coasting Through History</b><span>American sled makers, 1850–1990 · tap for the timeline</span></div><a href="#/timeline" style="position:absolute;inset:0;z-index:2" aria-label="Timeline"></a></div>
  <div class="chips"><a class="chip on" href="#/home">Community feed</a><a class="chip" href="#/idhelp">What sled is this?</a><a class="chip" href="#/search">Search</a><a class="chip" href="#/timeline">Timeline ${premium()?"":"🔒"}</a><a class="chip" href="#/magazine">Magazine ${premium()?"":"🔒"}</a></div>
  <h3 class="sec">What sled is this? <a href="#/idhelp">See all</a></h3>
  <div style="padding:0 16px">${window.ID_POSTS.slice(0,1).map(q=>`<a class="card idcard" href="#/idhelp"><div class="th" style="background-image:url('${q.img}')"></div><div><div class="small" style="font-weight:600">@${esc(q.user)} <span class="sample-tag">Example</span></div><div style="font-size:.84rem;margin-top:3px">${esc(q.q)}</div><div class="small muted" style="margin-top:3px">${q.answers.length} answer${q.answers.length==1?"":"s"} · Help identify →</div></div></a>`).join("")}</div>
  <h3 class="sec">Featured makers <a href="#/makers">All 61</a></h3>
  <div class="hscroll">${free.map(m=>`<a class="card mk" href="#/maker/${m.id}"><div class="th" style="background-image:url('${m.p.img}')"></div><div class="n">${esc(m.name)}</div><div class="d">${esc(m.area)}</div></a>`).join("")}</div>
  ${premium()?"":`<a class="promo" href="#/upgrade"><img class="cv" src="images/vintage-runner-tuxedo-racer-cover-p1.jpg" alt=""><div><b>Unlock all 61 makers</b><span>Histories, model guides, period ads, the timeline and Vintage Runner Magazine. $15/year.</span></div></a>`}
  <h3 class="sec">Community feed</h3>
  <div class="feed">${feed.map(postCard).join("")}</div>`;
};
R.collection=()=>{bar("My Collection",{sub:"@sample_collector",act:'<a class="act" href="#/add" aria-label="Add">＋</a>'});tab("collection");
  const mine=allSleds().filter(s=>s.mine||s.userAdded);
  const makers=new Set(mine.map(s=>s.maker));
  return `<div class="stats"><div><b>${mine.length}</b><span>Sleds</span></div><div><b>${makers.size}</b><span>Makers</span></div><div><b>${mine.filter(s=>s.shared).length}</b><span>Shared</span></div></div>
  <div class="chips"><span class="chip on">All</span><span class="chip">Shared</span><span class="chip">Private</span><span class="chip">By maker</span><a class="chip" href="#/upgrade">🖨 Insurance list ${premium()?"":"🔒"}</a></div>
  <div class="grid2">${mine.map(s=>`<a class="card tile" href="#/sled/${s.id}"><div class="th" style="background-image:url('${s.img}')"></div><span class="vis">${s.shared?"Shared":"🔒 Private"}</span><div class="n">${esc(makerName(s.maker))}</div><div class="d">${esc(s.model)} · ${esc(s.year)}</div></a>`).join("")}</div>
  <p class="legend" style="margin-bottom:20px">Sleds marked as samples are example data for this mockup. Sleds you add here are stored only in this browser.</p>`;
};
R.add=()=>{bar("Add a Sled",{sub:"Free · unlimited"});tab("add");
  const opts=MAKERS.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join("");
  const pics=["collection-red-swirl-deck-photos-p28.jpg","collection-pictorial-deck-photos-p31.jpg","sherwood-bros-sled-top-owner-horizontal.jpg","whx-young-america-c1855-p51.jpg","paris-dirigo-clipper-p56.jpg"];
  setTimeout(()=>{
    let pic=null;const d=$("#drop");
    d.onclick=()=>{pic="images/"+pics[Math.floor(Math.random()*pics.length)];d.style.backgroundImage=`url('${pic}')`;d.classList.add("has");toast("Demo photo added (sample image)")};
    $("#addf").onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);
      const s={id:"u"+Date.now(),user:"you",userAdded:true,mine:true,maker:+f.get("maker"),model:f.get("model")||"Untitled sled",year:f.get("year")||"Unknown",size:f.get("size")||"—",condition:f.get("condition"),found:f.get("found")||"—",notes:f.get("notes")||"",shared:!!f.get("shared"),img:pic||"images/collection-red-swirl-deck-photos-p28.jpg",likes:0};
      const u=userSleds();u.unshift(s);LS.set("sleds",u);toast("Sled saved to your collection");location.hash="#/sled/"+s.id};
  });
  return `<form class="form" id="addf">
  <div class="photo-drop" id="drop"><span style="font-size:1.6rem">📷</span>Tap to add photos<span class="small">(mockup picks a sample photo)</span></div>
  <label>Maker<select name="maker"><option value="0">Unknown / not sure</option>${opts}</select></label>
  <label>Model<input name="model" placeholder="e.g. Speedster, Lightning Guider"></label>
  <div class="row2"><label>Year / era<input name="year" placeholder="c. 1925"></label><label>Size<input name="size" placeholder="e.g. 42 in."></label></div>
  <label>Condition<select name="condition"><option>Excellent</option><option selected>Good</option><option>Fair</option><option>Poor</option><option>Restored</option></select></label>
  <label>Where found<input name="found" placeholder="Estate sale, barn, auction…"></label>
  <label>Notes<textarea name="notes" placeholder="Stencils, stamps, repairs, provenance…"></textarea></label>
  <label class="toggle"><span>Share with the community<small>Off = only you can see it</small></span><span class="sw"><input type="checkbox" name="shared" checked><i></i></span></label>
  <button class="btn solid" type="submit">Save sled</button>
  <a class="btn" href="#/idhelp">Not sure? Ask “What sled is this?”</a></form>`;
};
R.sled=id=>{const s=allSleds().find(x=>x.id==id);if(!s)return R.home();const m=M(s.maker);
  bar(m?m.name:"Sled",{back:true,sub:s.model});tab(s.mine||s.userAdded?"collection":"home");
  return `<div class="detail-ph" style="background-image:url('${s.img}')"></div>
  <div class="title-block"><h1>${esc(makerName(s.maker))} ${esc(s.model)}</h1><div class="small muted" style="margin-top:4px">@${esc(s.user)}${sampleTag(s)} · ${s.shared?"Shared":"🔒 Private"}</div></div>
  <dl class="dl"><div><dt>Maker</dt><dd>${m?`<a href="#/maker/${m.id}">${esc(m.name)}</a>`:"Unknown"}</dd></div><div><dt>Model</dt><dd>${esc(s.model)}</dd></div><div><dt>Year</dt><dd>${esc(s.year)}</dd></div><div><dt>Size</dt><dd>${esc(s.size)}</dd></div><div><dt>Condition</dt><dd>${esc(s.condition)}</dd></div><div><dt>Where found</dt><dd>${esc(s.found)}</dd></div><div><dt>Notes</dt><dd>${esc(s.notes)}</dd></div></dl>
  <div style="padding:16px;display:flex;flex-direction:column;gap:10px">${m?`<a class="btn pine" href="#/maker/${m.id}">About ${esc(m.name)}</a>`:""}${s.mine||s.userAdded?'<button class="btn" onclick="toast&&0" id="edit">Edit sled</button>':""}</div>`;
};
R.makers=()=>{bar("Makers",{sub:"61 American sled companies"});tab("makers");
  setTimeout(()=>{const i=$("#mq");i.oninput=()=>{const q=i.value.toLowerCase();document.querySelectorAll(".mrow").forEach(r=>r.style.display=r.dataset.s.includes(q)?"":"none")}});
  const row=m=>`<a class="mrow" href="#/maker/${m.id}" data-s="${esc((m.name+" "+m.area+" "+m.models).toLowerCase())}"><span class="num">${m.id}</span><span class="tx"><div class="n">${esc(m.name)}</div><div class="d"><span class="dot ${m.book?"blk":"grn"}"></span>${esc(m.area||"Location unknown")}${m.years?" · "+esc(m.years):""}</div></span>${isFree(m)?'<span class="free-pill">Free</span>':(premium()?'<span class="lk">›</span>':'<span class="lk">🔒</span>')}</a>`;
  const free=MAKERS.filter(isFree),rest=MAKERS.filter(m=>!isFree(m));
  return `<div class="search"><span>⌕</span><input id="mq" placeholder="Search 61 makers, towns, models"></div>
  <p class="legend"><span class="dot blk"></span>Listed in Joan Palicia's books &nbsp; <span class="dot grn"></span>Jonathan Spangler's finds</p>
  <h3 class="sec">Free profiles (${free.length})</h3><div class="list card">${free.map(row).join("")}</div>
  <h3 class="sec">${premium()?"Premium profiles":"Premium · name & dates only"} (${rest.length}) ${premium()?"":'<a href="#/upgrade">Unlock</a>'}</h3><div class="list card">${rest.map(row).join("")}</div>`;
};
function lockBox(title,sub){return `<div class="locked"><div class="blur">Company history, founders, factory locations, model guide with dates, catalog numbers and identifying marks, and period advertisements from the trade press. This text is a placeholder that sits behind the paywall in the mockup.</div><div class="ov">🔒<b>${title}</b><span>${sub}</span><a class="btn gold" href="#/upgrade">See Premium · $15/yr</a></div></div>`}
R.maker=id=>{const m=M(id);if(!m)return R.makers();const p=m.p,open=isFree(m)||premium();
  bar(m.name,{back:true,sub:isFree(m)?"Free profile":(open?"Premium profile":"Locked")});tab("makers");
  const facts=`<dl class="facts"><div><dt>Production area</dt><dd>${esc(m.area||"—")}</dd></div><div><dt>Years (matrix)</dt><dd>${esc(m.years||"—")}</dd></div><div><dt>Sled type</dt><dd>${esc(m.type||"—")}</dd></div><div><dt>Source</dt><dd>${m.book?"Palicia's books":"Spangler find"}</dd></div></dl>`;
  let body="";
  if(open&&p){
    body=`${p.img?`<figure class="fig"><img src="${p.img}" alt=""><figcaption>${esc(p.cap)}</figcaption></figure>`:""}
    <div class="mp-head" style="padding-top:6px"><div class="small" style="font-weight:600">${esc(p.head)}</div><div class="conf" style="margin-top:4px">Confidence: ${esc(p.conf)}</div></div>
    <div class="prose">${p.text.map(t=>`<p>${esc(t)}</p>`).join("")}</div>
    <h3 class="sec">Models & brands</h3><div class="prose"><p>${esc(m.models||"—")}</p></div>
    ${p.ad?`<h3 class="sec">Period advertisement</h3>`+(isFree(m)&&!premium()?lockBox("Period ads are Premium","Trade-press and catalog ads for every maker."):`<figure class="fig"><img src="${p.ad}" alt=""><figcaption>${esc(p.adcap)}</figcaption></figure>`):""}
    ${isFree(m)&&!premium()?`<h3 class="sec">Model guide</h3>`+lockBox("Model guide is Premium","Dates, catalog numbers and identifying marks."):""}
    <p class="src">Condensed from the Rosebud Sled Museum company briefs (Jonathan Spangler, Nov 2026), which list full sources.</p>`;
  }else if(open){
    body=`<div class="prose"><p><b>Models & brands (matrix):</b> ${esc(m.models||"—")}</p><p class="muted">[History coming soon] No written history for this maker yet. The Premium profile would hold the company history, model guide and period ads once researched.</p></div><p class="src">Name, place and dates from Jonathan Spangler's sled manufacturer matrix.</p>`;
  }else{
    body=`<div class="prose"><p class="muted">Free members see the name, place and dates. Premium unlocks the full profile.</p></div>${lockBox("Full history is Premium","History, model guide and period advertisements for all 61 makers.")}`;
  }
  return `<div class="mp-head"><p class="eyebrow">Maker #${m.id} of 61 ${isFree(m)?'· <span class="free-pill">Free</span>':""}</p><h1>${esc(m.name)}</h1></div>${facts}${body}
  <h3 class="sec">Collectors' sleds</h3><div class="grid2">${allSleds().filter(s=>s.maker==m.id&&s.shared).map(s=>`<a class="card tile" href="#/sled/${s.id}"><div class="th" style="background-image:url('${s.img}')"></div><div class="n">${esc(s.model)}</div><div class="d">@${esc(s.user)}</div></a>`).join("")||'<p class="small muted">No shared sleds yet.</p>'}</div>`;
};
R.search=()=>{bar("Search",{back:true,sub:"Makers, models, collectors"});tab("home");
  setTimeout(()=>{const i=$("#q"),out=$("#res");const run=()=>{const q=i.value.trim().toLowerCase();
    if(!q){out.innerHTML='<p class="legend">Try “Flyer”, “Chicago”, “Speedster” or “Garton”.</p>';return}
    const mk=MAKERS.filter(m=>(m.name+" "+m.models+" "+m.area).toLowerCase().includes(q));
    const sl=allSleds().filter(s=>s.shared||s.mine||s.userAdded).filter(s=>(makerName(s.maker)+" "+s.model+" "+s.user).toLowerCase().includes(q));
    out.innerHTML=`<h3 class="sec">Makers (${mk.length})</h3><div class="list card">${mk.map(m=>`<a class="mrow" href="#/maker/${m.id}"><span class="num">${m.id}</span><span class="tx"><div class="n">${esc(m.name)}</div><div class="d">${esc(m.area)} · ${esc(m.models||"")}</div></span>${isFree(m)?'<span class="free-pill">Free</span>':premium()?"›":"🔒"}</a>`).join("")||'<div class="mrow">No makers</div>'}</div>
    <h3 class="sec">Collectors' sleds (${sl.length})</h3><div class="grid2">${sl.map(s=>`<a class="card tile" href="#/sled/${s.id}"><div class="th" style="background-image:url('${s.img}')"></div><div class="n">${esc(makerName(s.maker))}</div><div class="d">${esc(s.model)} · @${esc(s.user)}</div></a>`).join("")}</div>`};
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
R.upgrade=(reason)=>{bar("Premium",{back:true,sub:"Mock paywall"});tab("");
  if(premium()){return `<div class="mock-banner">MOCKUP · no real payment was taken</div><div class="pad" style="text-align:center"><p style="font-family:var(--serif);font-size:1.6rem;margin:20px 0 6px">You're previewing Premium</p><p class="small muted">All 61 makers, the timeline and the magazine are unlocked in this demo.</p><div style="display:flex;flex-direction:column;gap:10px;margin-top:18px"><a class="btn pine" href="#/makers">Browse all 61 makers</a><a class="btn" href="#/timeline">Open the timeline</a><button class="btn" id="cancelP">End preview (back to Free)</button></div></div>`}
  setTimeout(()=>{$("#buy").onclick=()=>{LS.set("premium",true);toast("Mockup: Premium unlocked, no payment taken");location.hash="#/makers"}});
  const r=(t,f,p)=>`<div class="r"><span>${t}</span><span class="${f?"yes":"no"}">${f===true?"✓":f||"—"}</span><span class="yes">✓</span></div>`;
  return `<div class="mock-banner">MOCKUP · no real payment · nothing is charged</div>
  <div class="pw-hero"><p class="eyebrow" style="color:#e7b7a5">Vintage Runner Premium</p><h1>All 61 American sled makers</h1><p>${esc(typeof reason==="string"?reason:"Your research library for antique sleds.")}</p></div>
  <div class="compare"><div class="r h"><span>What you get</span><span>Free</span><span>Premium</span></div>
  ${r("Catalog unlimited sleds",true)}${r("Community feed & “What sled is this?”",true)}${r("Search makers & models",true)}${r("Full maker profiles","10")}${r("All 61 company histories",false)}${r("Model guides",false)}${r("Period advertisements",false)}${r("Coasting Through History timeline",false)}${r("Vintage Runner Magazine (digital)",false)}${r("Printable insurance list",false)}</div>
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
window.__toast=toast;
function route(){
  const h=(location.hash||"#/home").slice(2).split("/");const fn=R[h[0]]||R.home;
  $("#view").innerHTML=fn(h[1]);$("#view").scrollTop=0;bindLikes();
  const c=$("#cancelP");if(c)c.onclick=()=>{LS.set("premium",false);toast("Back to Free");route()};
  const ed=$("#edit");if(ed)ed.onclick=()=>toast("Mockup: editing not built yet");
}
window.addEventListener("hashchange",route);
$("#resetDemo").onclick=()=>{["premium","sleds","liked","lastq"].forEach(k=>localStorage.removeItem("svc_"+k));location.hash="#/home";route();toast("Demo reset")};
route();
})();
