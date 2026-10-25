/* Stride Clinic — Firebase edition */
"use strict";
/* ---------- constants ---------- */
const SOURCES=["إعلان فيسبوك","إعلان إنستجرام","تيك توك","جوجل / خرائط جوجل","ترشيح من مريض","ترشيح من دكتور","شاف المركز من الشارع","قريب أو صديق","أخرى"];
const AD_SOURCES=["إعلان فيسبوك","إعلان إنستجرام","تيك توك","جوجل / خرائط جوجل"];
const EXP_CATS=["إيجار","كهرباء ومياه وغاز","أدوات ومستلزمات","صيانة","إعلانات وتسويق","إنترنت وتليفون","نظافة وضيافة","مواصلات","أخرى"];
const METHODS={cash:"كاش",instapay:"InstaPay"};
const ROLE_NAMES={doctor:"دكتور",secretary:"استقبال",owner:"صاحب المركز"};
const CFG=window.STRIDE_FIREBASE_CONFIG||{};
const DOMAIN="users.stride-clinic.app";
const USER_RE=/^[a-z0-9._\-]{3,30}$/;
const LOG_KEEP_DAYS=60;
const APP_VERSION="25 أكتوبر · 15";
/* ---------- state ---------- */
const S={db:null,auth:null,uid:null,profile:null,role:null,mySid:null,settingUp:false,setupDone:null,
  staff:{},types:[],prices:{},pdir:{},patients:{},log:{},config:null,users:{},usernames:{},myUsername:"",
  live:{visits:{},payments:{},att:{},exp:{},appts:{}},old:{visits:{},payments:{},att:{},exp:{},appts:{}},loadedMonths:{},appts:{},
  visits:{},payments:{},att:{},expenses:{},
  tab:null,ui:{date:today(),month:today().slice(0,7),q:"",attDate:today(),srcAll:false},
  roleSubs:[]};
/* ---------- utils ---------- */
function today(){return new Date().toLocaleDateString("en-CA")}
function nowHM(){return new Date().toTimeString().slice(0,5)}
function addDays(d,n){const x=new Date(d+"T12:00:00");x.setDate(x.getDate()+n);return x.toLocaleDateString("en-CA")}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function nd(s){return String(s??"").replace(/[٠-٩]/g,d=>"٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g,d=>"۰۱۲۳۴۵۶۷۸۹".indexOf(d))}
function num(v){const n=Number(nd(v).replace(/[^\d.\-]/g,""));return isFinite(n)?n:0}
function money(n){return Math.round(n||0).toLocaleString("en-US")+" ج"}
function dayLabel(d){try{return new Date(d+"T12:00:00").toLocaleDateString("ar-EG-u-nu-latn",{weekday:"long",day:"numeric",month:"long"})}catch(e){return d}}
function monthLabel(m){try{return new Date(m+"-15T12:00:00").toLocaleDateString("ar-EG-u-nu-latn",{month:"long",year:"numeric"})}catch(e){return m}}
function prevMonth(m,n=1){const [y,mo]=m.split("-").map(Number);const d=new Date(y,mo-1-n,15);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")}
function mins(t){if(!t)return null;const [h,m]=nd(t).split(":").map(Number);return isFinite(h)?h*60+(m||0):null}
function hm(m){m=Math.round(m||0);const h=Math.floor(m/60),r=m%60;return h?(h+" س"+(r?" "+r+" د":"")):r+" د"}
function staffName(sid){return sid==="owner"?"د. محي":(S.staff[sid]?.name||"—")}
function isAdmin(){return S.role==="owner"||S.role==="secretary"}
function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v)}catch(e){return null}}
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2800)}
function pLabel(p){return p.phone?`${p.name} — ${p.phone}`:p.name}
function patientsSorted(){return Object.values(S.patients).sort((a,b)=>(a.name||"").localeCompare(b.name||"","ar"))}
function doctors(){return Object.values(S.staff).filter(s=>s.role==="doctor"&&s.active!==false).sort((a,b)=>(a.order||0)-(b.order||0))}
function activeStaff(){return Object.values(S.staff).filter(s=>s.active!==false).sort((a,b)=>(a.order||0)-(b.order||0))}
function typeName(id){return S.types.find(t=>t.id===id)?.name||"—"}
function isSepType(id){return !!(id&&S.types.find(t=>t.id===id)?.sep)}
function sepNames(){return S.types.filter(t=>t.sep).map(t=>t.name).join(" و")}
function packOf(pid,kid){return kid?(S.patients[pid]?.packs||[]).find(k=>k.id===kid):null}
function visitSep(v){return isSepType(v.packId?(packOf(v.patientId,v.packId)?.typeId||v.typeId):v.typeId)} // money of a separate-account type stays out of clinic revenue
function paySep(p){return !!(p.packId&&isSepType(packOf(p.patientId,p.packId)?.typeId))}
function dayMoney(test){ // clinic vs separate-account money for visits + payments whose date passes test
  const o={cash:0,insta:0,sepCash:0,sepInsta:0};const add=(sep,method,x)=>{if(!x)return;const ins=method==="instapay";if(sep)o[ins?"sepInsta":"sepCash"]+=x;else o[ins?"insta":"cash"]+=x};
  for(const v of Object.values(S.visits))if(test(v.date||""))add(visitSep(v),v.method,v.paid||0);
  for(const p of Object.values(S.payments))if(p.kind!=="discount"&&test(p.date||""))add(paySep(p),p.method,p.amount||0);
  o.clinic=o.cash+o.insta;o.sep=o.sepCash+o.sepInsta;return o}
function normUser(u){return nd(u||"").trim().toLowerCase()}
function randPw(){const a=new Uint32Array(1);crypto.getRandomValues(a);return String(100000+a[0]%900000)}
function randId(){const a=new Uint8Array(6);crypto.getRandomValues(a);return [...a].map(b=>b.toString(16).padStart(2,"0")).join("")}
function fmtTs(t){try{const d=t&&t.toDate?t.toDate():new Date(t);return isNaN(d)?"":d.toTimeString().slice(0,5)}catch(e){return ""}}
const inc=n=>firebase.firestore.FieldValue.increment(n);
const winMonth=()=>prevMonth(today().slice(0,7));          // live window = this month + last month
const winStart=()=>winMonth()+"-01";
/* ---------- rendering scheduler ---------- */
let rq=false,needRender=false;
function editingMain(){const a=document.activeElement;return a&&a.closest&&a.closest("#main")&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)}
function sched(){if(rq)return;rq=true;requestAnimationFrame(()=>{rq=false;if(editingMain()){needRender=true;return}render()})}
document.addEventListener("focusout",()=>setTimeout(()=>{if(needRender&&!editingMain()){needRender=false;render()}},60));
/* ---------- boot & auth ---------- */
function showFatal(t,s){document.getElementById("main").innerHTML=`<div class="empty"><b>${esc(t)}</b>${esc(s)}</div>`}
function boot(){
  if(!window.firebase)return showFatal("مش قادر يحمّل Firebase","اتأكد إن النت شغال وافتح الصفحة تاني.");
  if(!CFG.apiKey||/PASTE/.test(CFG.apiKey))return showFatal("لسه ما اتحطش إعداد Firebase","افتح ملف config.js وحط فيه بيانات مشروعك (الخطوة 4 في دليل التركيب).");
  firebase.initializeApp(CFG);S.auth=firebase.auth();S.db=firebase.firestore();
  S.db.enablePersistence({synchronizeTabs:true}).catch(()=>{});
  S.auth.onAuthStateChanged(onAuth);
}
let profUnsub=null;
async function onAuth(u){
  if(profUnsub){profUnsub();profUnsub=null}
  clearSubs();
  if(!u){Object.assign(S,{uid:null,profile:null,role:null,mySid:null,tab:null});await checkSetup();closeSheet();render();return}
  S.uid=u.uid;
  profUnsub=S.db.doc("users/"+u.uid).onSnapshot(d=>{
    const p=d.exists?d.data():null;S.profile=p;
    if(!p||p.active!==true){if(S.settingUp)return;S.role="none";clearSubs();render();return}
    const changed=p.role!==S.role||p.staffId!==S.mySid;
    S.role=p.role;S.mySid=p.staffId;
    if(changed){setupRoleSubs();S.tab=defaultTab()}
    if(p.mustChange&&!document.querySelector(".sheet"))setTimeout(()=>sheetAccount(true),150);
    sched();
  },e=>{console.warn(e);S.role="none";render()});
}
async function checkSetup(){if(S.setupDone)return;try{const d=await S.db.doc("meta/setup").get();S.setupDone=d.exists}catch(e){S.setupDone=true}}
function clearSubs(){S.roleSubs.forEach(u=>{try{u()}catch(e){}});S.roleSubs=[];if(backfillUnsub){backfillUnsub();backfillUnsub=null}
  Object.assign(S,{staff:{},types:[],prices:{},pdir:{},patients:{},log:{},config:null,users:{},usernames:{},myUsername:"",loadedMonths:{},
    live:{visits:{},payments:{},att:{},exp:{},appts:{}},old:{visits:{},payments:{},att:{},exp:{},appts:{}}});merge()}
function rowOf(d){const x={id:d.id,...d.data({serverTimestamps:"estimate"})};if(x.inAt)x.in=fmtTs(x.inAt);if(x.outAt)x.out=fmtTs(x.outAt);if(x.arrivedAt)x.arrived=fmtTs(x.arrivedAt);if(x.startAt)x.start=fmtTs(x.startAt);if(x.endAt)x.end=fmtTs(x.endAt);if(x.arrivedT)x.arrived=x.arrivedT;if(x.startT)x.start=x.startT;if(x.endT)x.end=x.endT;return x}
function toObj(snap){const o={};snap.docs.forEach(d=>o[d.id]=rowOf(d));return o}
function sub(q,set){return q.onSnapshot(snap=>{set(toObj(snap));sched()},e=>console.warn("sub",e))}
function subDoc(path,set){return S.db.doc(path).onSnapshot(d=>{set(d.exists?d.data():null);sched()},e=>console.warn(path,e))}
function merge(){S.visits={...S.old.visits,...S.live.visits};S.payments={...S.old.payments,...S.live.payments};S.att={...S.old.att,...(S.live.attAll||{}),...S.live.att};S.expenses={...S.old.exp,...S.live.exp};S.appts={...S.old.appts,...S.live.appts}}
function setLive(k){return o=>{S.live[k]=o;merge()}}
function setupRoleSubs(){
  clearSubs();const r=S.roleSubs,db=S.db,c=n=>db.collection(n);
  r.push(sub(c("staff"),o=>S.staff=o));
  r.push(subDoc("pub/types",d=>S.types=d?.list||[]));
  r.push(subDoc("pub/geo",d=>S.geo=d||null));
  r.push(subDoc("pub/notify",d=>S.notify=d||null));
  r.push(subDoc("pub/backfill",d=>{S.backfill=d||null;syncBackfillSub()}));
  r.push(sub(c("pdir"),o=>S.pdir=o));
  r.push(c("usernames").where("uid","==",S.uid).onSnapshot(s=>{S.myUsername=s.docs[0]?.id||"";sched()},()=>{}));
  if(isAdmin()){
    r.push(sub(c("log"),o=>{S.log=o;pruneLog()}));
    r.push(sub(c("appts").where("date",">=",winStart()),o=>{S.live.appts=o;merge();pruneAppts()}));
    if(S.role==="owner")r.push(sub(c("att").where("date",">=",winStart()),setLive("att")));
    else r.push(sub(c("att").where("staffId","==",S.mySid),setLive("att"))); // Reham sees her own attendance only
    r.push(sub(c("visits").where("date",">=",winStart()),setLive("visits")));
    r.push(sub(c("payments").where("date",">=",winStart()),setLive("payments")));
    r.push(sub(c("exp").where("date",">=",winStart()),setLive("exp")));
    r.push(subDoc("cfg/prices",d=>{S.prices=d?.p||{};S.packTypes=d?.packs||[]}));
    r.push(sub(c("patients"),o=>S.patients=o));
    r.push(sub(c("users"),o=>S.users=o));
    r.push(c("usernames").onSnapshot(s=>{const m={};s.docs.forEach(d=>m[d.data().uid]=d.id);S.usernames=m;sched()},()=>{}));
  }else{
    r.push(sub(c("log").where("doctorSid","==",S.mySid),o=>S.log=o));
    r.push(sub(c("appts").where("doctors","array-contains",S.mySid),setLive("appts")));
    r.push(sub(c("att").where("staffId","==",S.mySid),setLive("att")));
  }
  if(S.role==="owner")r.push(subDoc("priv/config",d=>S.config=d||{}));
}
let prunedA=false;
function pruneAppts(){ // finished appointments older than 4 months: the visit itself is the lasting record
  if(prunedA||!isAdmin())return;prunedA=true;
  const cut=prevMonth(today().slice(0,7),4)+"-01";
  S.db.collection("appts").where("date","<",cut).limit(400).get().then(q=>{if(q.empty)return;const b=S.db.batch();q.docs.forEach(d=>b.delete(d.ref));return b.commit()}).catch(()=>{});
}
let pruned=false;
function pruneLog(){ // reviewed entries older than LOG_KEEP_DAYS are already saved as visits
  if(pruned||!isAdmin())return;pruned=true;
  const cut=Date.now()-LOG_KEEP_DAYS*864e5;const old=Object.values(S.log).filter(e=>e.status!=="pending"&&(e.review?.at||0)<cut).slice(0,400);
  if(!old.length)return;const b=S.db.batch();old.forEach(e=>b.delete(S.db.doc("log/"+e.id)));b.commit().catch(()=>{});
}
async function ensureMonth(m){ // months outside the live window load once, on demand
  if(!isAdmin()||m>=winMonth()||S.loadedMonths[m])return;S.loadedMonths[m]="loading";
  const a=m+"-01",z=m+"-31",c=n=>S.db.collection(n).where("date",">=",a).where("date","<=",z).get();
  try{const [v,p,t,x,ap]=await Promise.all([c("visits"),c("payments"),S.role==="owner"?c("att"):Promise.resolve({docs:[]}),c("exp"),c("appts")]);
    Object.assign(S.old.appts,toObj(ap));Object.assign(S.old.visits,toObj(v));Object.assign(S.old.payments,toObj(p));Object.assign(S.old.att,toObj(t));Object.assign(S.old.exp,toObj(x));
    S.loadedMonths[m]=true;merge();sched()}catch(e){console.warn(e);S.loadedMonths[m]=false}
}
function forget(col,id){delete S.old[col]?.[id];merge()}
/* temporary access for Reham to enter past attendance (owner grants it with an end time; the server enforces it too) */
function backfillOn(){const b=S.backfill;return !!(b&&b.on&&tsDate(b.until)>new Date())}
function inBackfill(date){const b=S.backfill;return backfillOn()&&date>=b.from&&date<=b.to}
let backfillUnsub=null;
function syncBackfillSub(){
  if(S.role!=="secretary")return;
  if(backfillOn()&&!backfillUnsub)backfillUnsub=S.db.collection("att").where("date",">=",S.backfill.from).onSnapshot(sn=>{S.live.attAll=toObj(sn);merge();sched()},()=>{});
  if(!backfillOn()&&backfillUnsub){backfillUnsub();backfillUnsub=null;S.live.attAll={};merge()}
  sched();
}
function defaultTab(){return {owner:"sessions",secretary:"sessions",doctor:"myappts"}[S.role]}
/* ---------- tabs & render ---------- */
function tabsFor(){
  if(S.role==="doctor"){const old=myEntriesList().length;return [["myappts","جلساتي",Object.values(S.appts).filter(a=>a.date===today()&&["booked","arrived","started"].includes(a.status)&&apptDocs(a).includes(S.mySid)).length],...(old?[["mine","تسجيلاتي القديمة",myFresh()]]:[]),["myatt","حضوري"]]}
  const pend=pendingEntries().length;
  const base=[["sessions","جلسات اليوم",Object.values(S.appts).filter(needsRecord).length],["appts","الحجز"],...(pend?[["review","تسجيلات الدكاترة",pend]]:[]),["patients","المرضى والكشف"]];
  if(S.role==="owner")return [...base,["att","الحضور"],["reports","الحسابات والمرتبات"],["settings","الإعدادات"]];
  return [...base,["myatt","حضوري"],...(backfillOn()?[["att","حضور الفريق (مؤقت)"]]:[]),["reports","دخل وخرج اليوم"],["settings","الإعدادات"]];
}
function render(){
  const who=document.getElementById("who"),tabs=document.getElementById("tabs"),main=document.getElementById("main");
  if(!S.auth)return;
  if(!S.uid){who.textContent="المعادي";tabs.hidden=true;main.innerHTML=S.setupDone===false?vSetup():S.setupDone==null?`<div class="empty"><b>بيحمّل…</b></div>`:vLogin();return}
  if(S.role==="none"){who.textContent="";tabs.hidden=true;main.innerHTML=`<div class="empty"><b>الحساب ده مش مفعّل</b>ممكن يكون اتوقف أو اتعمله باسورد جديد. كلم د. محي.<div style="margin-top:12px"><button class="btn" data-act="logout">خروج</button></div></div>`;return}
  if(!S.role){main.innerHTML=`<div class="empty"><b>بيحمّل…</b></div>`;return}
  who.innerHTML=`<div class="hbtns"><span><b>${esc(staffName(S.mySid))}</b> · ${ROLE_NAMES[S.role]||""}</span><button class="btn sm" data-act="myAccount">حسابي</button><button class="btn sm" data-act="logout">خروج</button></div>`;
  const tl=tabsFor();
  tabs.innerHTML=tl.map(([k,l,b])=>`<button class="tab" role="tab" data-act="tab" data-k="${k}" aria-selected="${S.tab===k}">${l}${b?`<span class="badge">${b}</span>`:""}</button>`).join("");
  tabs.hidden=false;
  const fn={sessions:vSessions,appts:vAppts,myappts:vMyAppts,visits:vVisits,review:vReview,patients:vPatients,att:vAtt,reports:vReports,settings:vSettings,mine:vMine,myatt:vMyAtt}[S.tab];
  main.innerHTML=fn?fn():"";
  if(S.tab==="patients")renderPatientList();
}
/* ---------- setup & login ---------- */
function vSetup(){
  return `<form class="panel login" id="setupForm"><img src="icons/logo.png" alt="Stride Clinic" style="height:72px;width:auto;justify-self:center"><h2>أول تشغيل للسيستم</h2>
  <p class="sub" style="margin:0">الحساب اللي هيتعمل دلوقتي هو حساب صاحب المركز، وليه كل الصلاحيات. الخطوة دي بتحصل مرة واحدة بس.</p>
  <label class="f">اسم المستخدم بتاعك (بالإنجليزي)<input id="su_user" value="mohi" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
  <label class="f">الباسورد (6 حروف أو أرقام على الأقل)<input id="su_pw" type="password" autocomplete="new-password"></label>
  <label class="f">اكتب الباسورد تاني<input id="su_pw2" type="password" autocomplete="new-password"></label>
  <div class="seg"><label><input type="checkbox" id="su_seed" checked style="width:auto"> ضيف الفريق: ريهام، د. سلمى، د. حبيبة، د. محمد بالمرتبات ونسبة د. محمد</label></div>
  <div class="err" id="setupErr"></div><button class="btn primary" type="submit">ابدأ</button></form>`;
}
async function doSetup(){
  const err=document.getElementById("setupErr");const user=normUser(val("su_user")),pw=nd(val("su_pw")),pw2=nd(val("su_pw2"));
  if(!USER_RE.test(user)){err.textContent="اسم المستخدم من 3 لـ 30 حرف إنجليزي أو أرقام، من غير مسافات";return}
  if(pw.length<6){err.textContent="الباسورد لازم يكون 6 حروف أو أرقام على الأقل";return}
  if(pw!==pw2){err.textContent="الباسوردين مش زي بعض";return}
  err.textContent="بيجهّز…";S.settingUp=true;
  try{
    const email=`owner.${randId()}@${DOMAIN}`;
    const cred=await S.auth.createUserWithEmailAndPassword(email,pw);const uid=cred.user.uid,db=S.db;
    const b=db.batch();
    b.set(db.doc("meta/setup"),{ownerUid:uid,at:Date.now()});
    b.set(db.doc("users/"+uid),{role:"owner",staffId:"owner",active:true,mustChange:false,email});
    b.set(db.doc("usernames/"+user),{uid,email});
    await b.commit();
    if(document.getElementById("su_seed")?.checked!==false){
      const b2=db.batch();
      [["reham","ريهام","secretary",4],["salma","د. سلمى","doctor",1],["habiba","د. حبيبة","doctor",2],["mohamed","د. محمد","doctor",3]].forEach(([id,name,role,order])=>b2.set(db.doc("staff/"+id),{name,role,active:true,order,uid:null}));
      b2.set(db.doc("priv/config"),{salary:{salma:6000,habiba:5000,mohamed:3000,reham:6000},commission:{mohamed:{full:10,half:5}},hoursBase:7,daysBase:30,otMult:1.5});
      await b2.commit();
    }
    S.setupDone=true;S.settingUp=false;toast("السيستم جاهز. اعمل حسابات الفريق من الإعدادات.");
  }catch(e){console.error(e);S.settingUp=false;err.textContent=e.code==="permission-denied"?"السيستم ده متعمله إعداد قبل كده. ادخل بالحساب الموجود.":(e.code==="auth/operation-not-allowed"||e.code==="auth/configuration-not-found")?"لازم تفعّل Email/Password في Authentication الأول (الخطوة 2 في الدليل).":"حصلت مشكلة: "+(e.code||e.message)}
}
function vLogin(){
  return `<form class="panel login" id="loginForm" autocomplete="on"><img src="icons/logo.png" alt="Stride Clinic" style="height:72px;width:auto;justify-self:center"><h2>تسجيل الدخول</h2>
  <label class="f">اسم المستخدم<input id="l_user" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
  <label class="f">الباسورد<input id="l_pw" type="password" autocomplete="current-password"></label>
  <div class="err" id="loginErr"></div><button class="btn primary" type="submit">دخول</button>
  <button class="btn ghost sm" type="button" data-act="forgotPw">نسيت الباسورد؟</button><p class="sub" style="margin:0;text-align:center">إصدار ${APP_VERSION}</p></form>`;
}
async function forgotPw(){
  const err=document.getElementById("loginErr");const u=normUser(val("l_user"));
  if(!USER_RE.test(u)){err.textContent="اكتب اسم المستخدم الأول، وبعدين دوس «نسيت الباسورد»";return}
  let d;try{d=await S.db.doc("usernames/"+u).get()}catch(e){err.textContent="مفيش اتصال بالنت.";return}
  const email=d.exists?d.data().email:"";
  if(!email||email.endsWith("@"+DOMAIN)){err.textContent="اطلب من د. محي يعملك باسورد جديد من الإعدادات.";return}
  try{await S.auth.sendPasswordResetEmail(email);err.textContent="بعتنا لينك تغيير الباسورد على إيميلك. لو مش لاقيه بص في Spam."}
  catch(e){err.textContent="مقدرناش نبعت الإيميل دلوقتي، جرب كمان شوية."}
}
async function doLogin(){
  const u=normUser(val("l_user")),pw=nd(val("l_pw"));const err=document.getElementById("loginErr");
  if(!u||!pw){err.textContent="اكتب اسم المستخدم والباسورد";return}
  if(!USER_RE.test(u)){err.textContent="اسم المستخدم أو الباسورد غلط";return}
  err.textContent="بيتأكد…";
  let d;try{d=await S.db.doc("usernames/"+u).get()}catch(e){err.textContent="مفيش اتصال بالنت. أول دخول محتاج نت.";return}
  if(!d.exists){err.textContent="اسم المستخدم أو الباسورد غلط";return}
  try{await S.auth.signInWithEmailAndPassword(d.data().email,pw)}
  catch(e){err.textContent=e.code==="auth/too-many-requests"?"محاولات كتير غلط. استنى شوية وجرب تاني.":e.code==="auth/network-request-failed"?"مفيش اتصال بالنت.":"اسم المستخدم أو الباسورد غلط"}
}
function sheetAccount(forced){
  openSheet(forced?"اختار باسورد خاص بيك":"حسابي",`
  ${forced?`<div class="note">ده أول دخول ليك بالباسورد المؤقت. اختار باسورد خاص بيك، ولو حابب غيّر اسم المستخدم كمان.</div>`:""}
  <label class="f">اسم المستخدم<input id="ac_user" value="${esc(S.myUsername)}" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
  ${forced?"":`<label class="f">الباسورد الحالي<input id="ac_old" type="password" autocomplete="current-password"></label>`}
  <label class="f">الباسورد الجديد ${forced?"":"<span class='sub'>(سيبه فاضي لو مش هتغيره)</span>"}<input id="ac_new" type="password" autocomplete="new-password"></label>
  <label class="f">اكتب الباسورد الجديد تاني<input id="ac_new2" type="password" autocomplete="new-password"></label>
  <div class="err" id="formErr"></div><button class="btn primary" data-act="saveAccount" data-forced="${forced?1:""}">حفظ</button>
  ${forced?"":`<div class="hr"></div><div class="bar"><span class="sub grow">إصدار التطبيق: ${APP_VERSION}</span><button class="btn sm" data-act="forceUpdate">حدّث التطبيق</button></div>`}`);
}
async function saveAccount(forced){
  const u=S.auth.currentUser;if(!u)return;
  const user=normUser(val("ac_user")),nw=nd(val("ac_new")),nw2=nd(val("ac_new2"));
  if(!USER_RE.test(user))return setErr("اسم المستخدم من 3 لـ 30 حرف إنجليزي أو أرقام، من غير مسافات");
  const changePw=forced||nw;
  if(changePw){if(nw.length<6)return setErr("الباسورد لازم يكون 6 حروف أو أرقام على الأقل");if(nw!==nw2)return setErr("الباسوردين مش زي بعض")}
  if(!forced){const old=nd(val("ac_old"));if(!old)return setErr("اكتب الباسورد الحالي");
    try{await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email,old))}catch(e){return setErr(e.code==="auth/too-many-requests"?"محاولات كتير. استنى شوية.":"الباسورد الحالي غلط")}}
  if(user!==S.myUsername){
    const ex=await S.db.doc("usernames/"+user).get();if(ex.exists)return setErr("اسم المستخدم ده مستخدم قبل كده");
    const b=S.db.batch();if(S.myUsername)b.delete(S.db.doc("usernames/"+S.myUsername));b.set(S.db.doc("usernames/"+user),{uid:S.uid,email:u.email});await b.commit();
  }
  if(changePw){
    try{await u.updatePassword(nw)}catch(e){if(e.code==="auth/requires-recent-login")return setErr("اخرج وادخل تاني، وبعدها غيّر الباسورد على طول.");throw e}
    if(S.profile?.mustChange)await S.db.doc("users/"+S.uid).update({mustChange:false});
  }
  closeSheet();toast("اتحفظ");
}
/* ---------- calculations ---------- */
function pendingEntries(){return Object.values(S.log).filter(e=>e.status==="pending").sort((a,b)=>(a.createdAt||0)-(b.createdAt||0))}
function reviewedEntries(){return Object.values(S.log).filter(e=>e.status!=="pending").sort((a,b)=>(b.review?.at||0)-(a.review?.at||0))}
function myEntriesList(){return Object.values(S.log).filter(e=>e.doctorSid===S.mySid)}
function myFresh(){const seen=num(ls("seen_"+S.mySid)||0);return myEntriesList().filter(e=>e.review?.at>seen).length}
function balances(){const b={};for(const p of Object.values(S.patients))if(p.count||p.charged||p.paid)b[p.id]={charged:p.charged||0,paid:p.paid||0,count:p.count||0};return b}
function balChip(x){if(!x)return `<span class="chip c-mute">مفيش جلسات</span>`;const d=Math.round(x.charged-x.paid);
  return d>0?`<span class="chip c-bad">عليه ${money(d)}</span>`:d<0?`<span class="chip c-ok">ليه ${money(-d)}</span>`:`<span class="chip c-teal">خالص</span>`}
function attMinutes(rec){const a=mins(rec.in),b=mins(rec.out);return a!=null&&b!=null&&b>a?b-a:null}
function cfg(){const c=S.config||{};return{salary:c.salary||{},commission:c.commission||{},otMult:c.otMult||1.5,daysBase:c.daysBase||30,hoursBase:c.hoursBase||7}}
function creditsOf(v){return v.doctor2Id?[[v.doctorId,"half"],[v.doctor2Id,"half"]]:[[v.doctorId,v.completion||"full"]]}
function visitDocs(v){return v.doctor2Id?`${staffName(v.doctorId)} + ${staffName(v.doctor2Id)} (نص ونص)`:staffName(v.doctorId)}
function payroll(month){
  const c=cfg();const base=c.hoursBase*60;
  return activeStaff().map(s=>{
    const sal=num(c.salary[s.id]);const minRate=sal/(c.daysBase*c.hoursBase*60);
    let ot=0,days=0,short=0;
    for(const r of Object.values(S.att))if(r.staffId===s.id&&(r.date||"").startsWith(month)){const w=attMinutes(r);if(w==null)continue;days++;if(w>base)ot+=w-base;else short+=base-w}
    const otPay=ot*c.otMult*minRate;
    const cm=c.commission[s.id];let comm=0,full=0,half=0,base2=0;
    if(cm)for(const v of Object.values(S.visits))if((v.date||"").startsWith(month))for(const [sid,comp] of creditsOf(v))if(sid===s.id){const pct=comp==="half"?num(cm.half):num(cm.full);const base=v.packId?(v.packValue||0):(v.paid||0);comm+=base*pct/100;base2+=base;comp==="half"?half++:full++}
    return{s,sal,ot,otPay,days,short,cm,comm,full,half,commBase:base2,total:sal+otPay+comm};
  });
}
function revenue(month){
  let charged=0,sessions=0,sepSessions=0;
  for(const v of Object.values(S.visits))if((v.date||"").startsWith(month)){if(visitSep(v)){sepSessions++;continue}sessions++;charged+=v.net||0}
  for(const pt of Object.values(S.patients))for(const k of pt.packs||[])if((k.date||"").startsWith(month)&&!isSepType(k.typeId))charged+=k.price||0;
  const mo=dayMoney(d=>d.startsWith(month));
  const unpaid=Object.values(S.patients).reduce((s,p)=>s+Math.max(0,(p.charged||0)-(p.paid||0)),0);
  return{cash:mo.cash,insta:mo.insta,collected:mo.clinic,charged,sessions,unpaid,sep:mo.sep,sepCash:mo.sepCash,sepInsta:mo.sepInsta,sepSessions};
}
function expByCat(month){const o={};let t=0;for(const x of Object.values(S.expenses))if((x.date||"").startsWith(month)){o[x.category]=(o[x.category]||0)+(x.amount||0);t+=x.amount||0}return{o,t}}
function dayNav(act,pickId,d){return `<button class="btn sm" data-act="${act}" data-n="-1">اليوم اللي قبله</button><input type="date" id="${pickId}" value="${d}" style="max-width:170px" aria-label="اليوم"><button class="btn sm" data-act="${act}" data-n="1">اللي بعده</button>`}
function monthLoading(m){return isAdmin()&&m<winMonth()&&S.loadedMonths[m]!==true}
/* ---------- views: visits ---------- */
function vVisits(){
  const d=S.ui.date;ensureMonth(d.slice(0,7));
  const vs=Object.values(S.visits).filter(v=>v.date===d).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const ps=Object.values(S.payments).filter(p=>p.date===d);
  let cash=0,insta=0,remain=0;
  vs.forEach(v=>{v.method==="instapay"?insta+=v.paid||0:cash+=v.paid||0;remain+=Math.max(0,(v.net||0)-(v.paid||0))});
  ps.forEach(p=>{if(p.kind==="discount")return;p.method==="instapay"?insta+=p.amount||0:cash+=p.amount||0});
  return `
  <div class="bar">${dayNav("day","dayPick",d)}
    <span class="sub grow">${esc(dayLabel(d))}${d===today()?" · النهارده":""}</span>
    <button class="btn" data-act="newPay">+ دفعة</button>
    <button class="btn primary" data-act="newVisit">+ جلسة</button>
  </div>
  ${!S.types.length?`<div class="note">لسه مفيش أنواع جلسات وأسعار. ضيفها من <b>الإعدادات</b> عشان السعر ينزل لوحده.</div>`:""}
  ${monthLoading(d.slice(0,7))?`<div class="note">بيحمّل بيانات الشهر ده…</div>`:""}
  <div class="stats">
    <div class="stat"><div class="k">جلسات اليوم</div><div class="v num">${vs.length}</div></div>
    <div class="stat"><div class="k">اتحصّل كاش</div><div class="v money">${money(cash)}</div></div>
    <div class="stat"><div class="k">اتحصّل InstaPay</div><div class="v money">${money(insta)}</div></div>
    <div class="stat"><div class="k">متبقي على الحالات</div><div class="v money" style="color:${remain?"var(--bad)":"inherit"}">${money(remain)}</div></div>
  </div>
  ${vs.length?`<div class="list">${vs.map(v=>{const rem=(v.net||0)-(v.paid||0);return `<button class="row" data-act="editVisit" data-id="${v.id}">
      <span class="t">${esc(v.patientName)} ${v.completion==="half"?`<span class="chip c-warn">نص حالة</span>`:""}</span>
      <span class="end money">${v.packId?`<span class="chip c-teal">باكدج</span>`:money(v.net)}</span>
      <span class="m">${esc(v.time||"")} · ${esc(visitDocs(v))} · ${esc(v.typeName||"")}${v.discount?` · خصم ${money(v.discount)}`:""}</span>
      <span class="end m">${v.paid?`دفع ${money(v.paid)} ${METHODS[v.method]||""}`:""} ${rem>0?`<span class="chip c-bad">باقي ${money(rem)}</span>`:""}</span>
    </button>`}).join("")}</div>`:`<div class="empty"><b>مفيش جلسات متسجلة اليوم ده</b>الجلسات بتنزل هنا لما تعتمد اللي الدكاترة سجلوه، أو اضغط «+ جلسة» تسجلها مباشرة.</div>`}
  ${ps.length?`<div class="panel"><h2>دفعات وخصومات اليوم ده</h2><div class="list">${ps.map(p=>`<button class="row" data-act="editPay" data-id="${p.id}"><span class="t">${esc(p.patientName)} ${p.kind==="discount"?`<span class="chip c-acc">خصم</span>`:""}</span><span class="end money">${money(p.amount)}</span><span class="m">${p.kind==="discount"?esc(p.reason||""):(METHODS[p.method]||"")}${p.kind!=="discount"&&p.note?" · "+esc(p.note):p.kind!=="discount"&&p.packId?" · على "+esc(packTitle((S.patients[p.patientId]?.packs||[]).find(k=>k.id===p.packId)||{name:"باكدج"})):""}</span><span></span></button>`).join("")}</div></div>`:""}`;
}
/* ---------- views: review ---------- */
function vReview(){
  const pend=pendingEntries();const done=reviewedEntries().slice(0,25);
  const card=(e,act)=>`<button class="row" data-act="${act}" data-id="${e.id}">
    <span class="t">${esc(e.patientName)} ${e.completion==="half"?`<span class="chip c-warn">نص حالة</span>`:""}</span>
    <span class="end">${statusChip(e.status)}</span>
    <span class="m">${esc(staffName(e.doctorSid))} · ${esc(e.typeName||"")} · ${esc(e.date)} ${esc(e.time||"")}</span>
    <span class="end m">${[e.note?"فيه كومنت":"",e.media?.length?`${e.media.length} صورة`:""].filter(Boolean).join(" · ")}</span></button>`;
  return `
  <div class="sec-title"><h2>مستني المراجعة</h2><span class="sub">اعتمد أو عدّل أو ارفض، والدكتور هيشوف النتيجة عنده</span></div>
  ${pend.length?`<div class="list">${pend.map(e=>card(e,"review")).join("")}</div>`:`<div class="empty"><b>مفيش حاجة مستنية مراجعة</b>لما دكتور يسجل جلسة من حسابه هتظهر هنا.</div>`}
  ${done.length?`<div class="sec-title"><h2>اتراجع مؤخراً</h2></div><div class="list">${done.map(e=>card(e,"reviewDone")).join("")}</div>`:""}`;
}
function statusChip(s){return {pending:`<span class="chip c-warn">مستني المراجعة</span>`,approved:`<span class="chip c-ok">اتعتمد</span>`,edited:`<span class="chip c-teal">اتعتمد بتعديل</span>`,rejected:`<span class="chip c-bad">اترفض</span>`}[s]||""}
/* ---------- views: patients ---------- */
function vPatients(){
  return `<div class="bar"><input id="q" class="grow" placeholder="دوّر بالاسم أو الموبايل" value="${esc(S.ui.q)}" aria-label="بحث"><button class="btn primary" data-act="newPatient">+ مريض جديد</button></div><div class="bar"><button class="btn sm" data-act="quickAdd">إضافة سريعة للمرضى القدام</button><button class="btn sm" data-act="pasteList">لصق قايمة</button></div><div id="plist"></div>`;
}
function renderPatientList(){
  const el=document.getElementById("plist");if(!el)return;
  const q=nd(S.ui.q).trim();const b=balances();
  let ps=patientsSorted();if(q)ps=ps.filter(p=>(p.name||"").includes(q)||nd(p.phone||"").includes(q));
  const owe=Object.values(b).reduce((s,x)=>s+Math.max(0,x.charged-x.paid),0);
  const shown=ps.slice(0,200);
  el.innerHTML=(Object.keys(S.patients).length?`<div class="stats" style="margin-bottom:12px"><div class="stat"><div class="k">عدد الملفات</div><div class="v num">${Object.keys(S.patients).length}</div></div><div class="stat"><div class="k">إجمالي اللي على الحالات</div><div class="v money">${money(owe)}</div></div></div>`:"")+
  (shown.length?`<div class="list">${shown.map(p=>`<button class="row" data-act="openPatient" data-id="${p.id}"><span class="t">${esc(p.name)}</span><span class="end">${balChip(b[p.id])}</span><span class="m">${esc(p.phone||"بدون موبايل")}${p.diagnosis?" · "+esc(p.diagnosis):""}${(()=>{const l=(p.packs||[]).reduce((s,k)=>s+Math.max(0,k.sessions-(k.used||0)),0);return l?` · باكدج: فاضل ${l}`:""})()}</span><span class="end m">${b[p.id]?b[p.id].count+" جلسة":""}</span></button>`).join("")}</div>${ps.length>shown.length?`<p class="sub">بيظهر أول 200. اكتب في البحث عشان توصل للباقي.</p>`:""}`
  :`<div class="empty"><b>${q?"مفيش مريض بالاسم ده":"لسه مفيش ملفات مرضى"}</b>${q?"جرب جزء من الاسم أو رقم الموبايل.":"اضغط «+ مريض جديد» واملا شيت الكشف، وصوّر الورقة كمان عشان لو ضاعت."}</div>`);
}
/* ---------- views: attendance (admin) ---------- */
function vAtt(){
  if(S.role!=="owner"&&!backfillOn())return `<div class="empty"><b>الصلاحية المؤقتة خلصت</b>تسجيل حضور الفريق متاح لـ د. محي بس.</div>`;
  const d=S.ui.attDate,m=d.slice(0,7);ensureMonth(m);const base=cfg().hoursBase*60;
  const tempNote=S.role!=="owner"?`<div class="note">صلاحية مؤقتة: تسجيل الحضور من ${esc(S.backfill.from)} لحد ${esc(S.backfill.to)}، ومتاحة لحد ${tsDate(S.backfill.until).toLocaleString("ar-EG-u-nu-latn",{weekday:"long",day:"numeric",month:"long",hour:"numeric",minute:"2-digit"})}.${inBackfill(d)?"":" <b>اليوم ده بره الفترة.</b>"}</div>`:"";
  const st=activeStaff();
  const rows=st.map(s=>{const r=S.att[d+"_"+s.id];const w=r?attMinutes(r):null;const ot=w!=null&&w>base?w-base:0;
    return `<button class="row" data-act="editAtt" data-sid="${s.id}"><span class="t">${esc(s.name)} <span class="chip c-mute">${ROLE_NAMES[s.role]||""}</span></span>
    <span class="end">${attChip(r,w,ot,base)}</span>
    <span class="m">${r?`حضور ${esc(r.in||"—")} · انصراف ${esc(r.out||"—")}${w!=null?" · "+hm(w):""}${r.inAt?" · سجّلها بنفسه":""}${locNote(r)}`:"اضغط عشان تسجل الحضور والانصراف"}</span><span></span></button>`}).join("");
  const sum=st.map(s=>{let days=0,ot=0,short=0;for(const r of Object.values(S.att))if(r.staffId===s.id&&(r.date||"").startsWith(m)){const w=attMinutes(r);if(w==null)continue;days++;w>base?ot+=w-base:short+=base-w}return `<tr><td>${esc(s.name)}</td><td class="num">${days}</td><td>${hm(ot)}</td><td>${hm(short)}</td></tr>`}).join("");
  return `${tempNote}<div class="bar">${dayNav("attDay","attPick",d)}<span class="sub grow">${esc(dayLabel(d))}</span></div>
  ${st.length?`<div class="list">${rows}</div>`:`<div class="empty"><b>مفيش فريق متسجل</b>ضيف الدكاترة والسكرتارية من الإعدادات.</div>`}
  <div class="panel"><h2>ملخص ${esc(monthLabel(m))}</h2><p class="sub" style="margin:0">اليوم الأساسي ${cfg().hoursBase} ساعات؛ أي دقيقة زيادة بتتحسب بدقيقة ونص في المرتب.</p>
  <div class="tblwrap"><table><thead><tr><th>الاسم</th><th>أيام متسجلة</th><th>أوفر تايم</th><th>ساعات ناقصة</th></tr></thead><tbody>${sum}</tbody></table></div></div>`;
}
function locNote(r){const parts=[];if(r.inLoc)parts.push(`حضور على بعد ${r.inLoc.d}م`);if(r.outLoc)parts.push(`انصراف على بعد ${r.outLoc.d}م`);return parts.length?` · ${parts.join("، ")}`:""}
function attChip(r,w,ot,base){if(!r)return `<span class="chip c-mute">غايب / مش متسجل</span>`;if(ot)return `<span class="chip c-acc">أوفر تايم ${hm(ot)}</span>`;if(w!=null&&w<base)return `<span class="chip c-warn">ناقص ${hm(base-w)}</span>`;return `<span class="chip c-ok">${w!=null?"تمام":"لسه مقفلش"}</span>`}
/* ---------- views: my attendance (doctor) ---------- */
function vMyAtt(){
  const sid=S.mySid,d=today(),m=d.slice(0,7),base=7*60;const r=S.att[d+"_"+sid];
  const recs=Object.values(S.att).filter(x=>x.staffId===sid&&(x.date||"").startsWith(m)).sort((a,b)=>b.date.localeCompare(a.date));
  let ot=0,days=0;recs.forEach(x=>{const w=attMinutes(x);if(w!=null){days++;if(w>base)ot+=w-base}});
  return `<div class="panel"><h2>النهارده · ${esc(dayLabel(d))}</h2>
  <div class="stats"><div class="stat"><div class="k">حضور</div><div class="v num">${esc(r?.in||"—")}</div></div><div class="stat"><div class="k">انصراف</div><div class="v num">${esc(r?.out||"—")}</div></div></div>
  <div class="bar">${r?"":`<button class="btn primary grow" data-act="selfIn">سجّل حضوري دلوقتي</button>`}${r&&r.in&&!r.out?`<button class="btn teal grow" data-act="selfOut">سجّل انصرافي دلوقتي</button>`:""}</div>
  <p class="err" id="geoMsg" style="margin:0"></p>
  <p class="sub" style="margin:0">الوقت بيتسجل من ساعة السيرفر${S.geo?.lat&&S.geo.required!==false?"، ومكانك بيتأكد إنه جوه المركز":""}.${r?.in&&r?.out?" اليوم اتقفل، ولو فيه غلط قول لريهام تعدّله.":""}</p></div>
  <div class="stats"><div class="stat"><div class="k">أيام حضور ${esc(monthLabel(m))}</div><div class="v num">${days}</div></div><div class="stat"><div class="k">أوفر تايم الشهر ده</div><div class="v">${hm(ot)}</div></div></div>
  ${recs.length?`<div class="list">${recs.map(x=>{const w=attMinutes(x);const o=w!=null&&w>base?w-base:0;return `<div class="row" style="cursor:default"><span class="t">${esc(dayLabel(x.date))}</span><span class="end">${attChip(x,w,o,base)}</span><span class="m">حضور ${esc(x.in||"—")} · انصراف ${esc(x.out||"—")}${w!=null?" · "+hm(w):""}</span><span></span></div>`}).join("")}</div>`:`<div class="empty"><b>مفيش أيام متسجلة الشهر ده</b>اضغط «سجّل حضوري» أول ما توصل.</div>`}`;
}
/* ---------- views: reports ---------- */
function expenseTips(m,rv,ex,pr,flags){
  const tips=[];const salBase=pr.reduce((s,x)=>s+x.sal,0),otNow=pr.reduce((s,x)=>s+x.otPay,0);
  if(rv.charged&&rv.unpaid>Math.max(500,rv.charged*0.08))tips.push(`إجمالي اللي على الحالات ${money(rv.unpaid)}. التحصيل أهم من أي توفير: ريهام تتابع مع اللي عليهم فلوس، والباكدج يتدفع جزء منه مقدم.`);
  const ads=ex.o["إعلانات وتسويق"]||0;
  const newPats=Object.values(S.patients).filter(p=>(p.examDate||"").startsWith(m));const adPats=newPats.filter(p=>AD_SOURCES.includes(p.source)).length;
  if(ads>0)tips.push(adPats?`الإعلانات جابت ${adPats} حالة جديدة بتكلفة حوالي ${money(ads/adPats)} للحالة. قارنها بمتوسط اللي الحالة بتدفعه، ووقّف المنصة اللي مش بتجيب حالات.`:`صرفت ${money(ads)} على الإعلانات ومفيش حالة جديدة متسجلة جاية من إعلان. اتأكد إن خانة «عرفت المركز منين» بتتملي، ولو فعلاً مفيش، غيّر الإعلان أو وقفه.`);
  if(salBase&&otNow>salBase*0.08)tips.push(`الأوفر تايم ${money(otNow)} الشهر ده. وزّع المواعيد على اليوم بدل ما الحالات تتكوم آخر النهار، أو خلي الشيفتات تبدأ متأخر شوية.`);
  flags.forEach(f=>tips.push(`بند «${f.c}» ${money(f.cur)} مقابل متوسط ${money(f.avg)}. راجع الفواتير بتاعته وشوف إيه اللي زاد.`));
  const refs=newPats.filter(p=>p.source==="ترشيح من مريض"||p.source==="ترشيح من دكتور").length;
  if(newPats.length>=5&&refs/newPats.length>=0.4)tips.push(`${Math.round(refs/newPats.length*100)}% من الحالات الجديدة جاية بترشيح. خصم بسيط للمريض اللي يرشّح حد غالباً أرخص من الإعلانات.`);
  const discTotal=discountsIn(m).reduce((s,r)=>s+(r.amount||0),0);
  if(rv.collected&&discTotal>rv.collected*0.08)tips.push(`الخصومات ${money(discTotal)} الشهر ده، يعني ${Math.round(discTotal/rv.collected*100)}% من المحصّل. راجع جدول الخصومات وأسبابها، وحدد سقف للخصم اللي يتعمل من غير ما يرجعلك.`);
  if(!tips.length)tips.push(rv.collected?"مفيش حاجة ملفتة في مصروفات الشهر ده.":"سجّل الجلسات والمصروفات الأول عشان الاقتراحات تطلع.");
  return tips;
}
function discountsIn(m){
  const rows=[];
  for(const v of Object.values(S.visits))if(v.discount&&(v.date||"").startsWith(m))rows.push({date:v.date,patient:v.patientName,what:`جلسة ${v.typeName||""}`,amount:v.discount,reason:v.discountReason||"—",by:v.by});
  for(const p of Object.values(S.patients))for(const k of p.packs||[]){
    if(k.saleDiscount&&(k.date||"").startsWith(m))rows.push({date:k.date,patient:p.name,what:packTitle(k),amount:k.saleDiscount,reason:k.reason||"—",by:k.by});
    for(const h of k.discHist||[])if((h.date||"").startsWith(m))rows.push({date:h.date,patient:p.name,what:packTitle(k),amount:h.amount,reason:h.reason,by:h.by})}
  for(const x of Object.values(S.payments))if(x.kind==="discount"&&(x.date||"").startsWith(m))rows.push({date:x.date,patient:x.patientName,what:"على الحساب",amount:x.amount,reason:x.reason,by:x.by});
  return rows.sort((a,b)=>(b.date||"").localeCompare(a.date||""));
}
function discountsPanel(m){
  const rows=discountsIn(m),total=rows.reduce((s,r)=>s+(r.amount||0),0);
  return `<div class="panel"><div class="sec-title"><h2>الخصومات</h2>${rows.length?`<span class="chip c-acc">${money(total)}</span>`:""}</div>
  ${rows.length?`<div class="tblwrap"><table><thead><tr><th>التاريخ</th><th>المريض</th><th>على إيه</th><th>الخصم</th><th>السبب</th><th>مين عمله</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.patient)}</td><td>${esc(r.what)}</td><td>${money(r.amount)}</td><td style="white-space:normal;min-width:140px">${esc(r.reason)}</td><td>${esc(r.by?staffName(r.by):"—")}</td></tr>`).join("")}</tbody></table></div>`
  :`<div class="empty"><b>مفيش خصومات الشهر ده</b>أي خصم على جلسة أو باكدج أو حساب هيظهر هنا بسببه ومين عمله.</div>`}</div>`;
}
function vReports(){
  const owner=S.role==="owner";const m=S.ui.month;
  [m,prevMonth(m),prevMonth(m,2),prevMonth(m,3)].forEach(x=>ensureMonth(x));
  const rv=revenue(m);const ex=expByCat(m);
  const exList=Object.values(S.expenses).filter(x=>(x.date||"").startsWith(m)).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  const loadingNote=monthLoading(m)?`<div class="note">بيحمّل بيانات ${esc(monthLabel(m))}…</div>`:"";
  const expensesPanel=`<div class="panel"><div class="sec-title"><h2>المصروفات</h2><button class="btn primary sm" data-act="newExp">+ مصروف</button></div>
  ${exList.length?`<div class="list">${exList.map(x=>`<button class="row" data-act="editExp" data-id="${x.id}"><span class="t">${esc(x.category)}</span><span class="end money">${money(x.amount)}</span><span class="m">${esc(x.date)}${x.note?" · "+esc(x.note):""}</span><span></span></button>`).join("")}</div>`:`<div class="empty"><b>مفيش مصروفات متسجلة الشهر ده</b>سجّل الإيجار والكهربا والمستلزمات والإعلانات.</div>`}
  ${exList.length?`<p class="sub" style="margin:0">إجمالي المصروفات (من غير المرتبات): <b>${money(ex.t)}</b></p>`:""}</div>`;
  const bal=balances();const src={};let srcN=0;
  for(const p of Object.values(S.patients)){const dt=p.examDate||"";if(!S.ui.srcAll&&!dt.startsWith(m))continue;const k=p.source||"مش متسجل";src[k]=src[k]||{n:0,rev:0};src[k].n++;src[k].rev+=bal[p.id]?.charged||0;srcN++}
  const srcArr=Object.entries(src).sort((a,b)=>b[1].n-a[1].n);const maxN=srcArr[0]?.[1].n||1;
  const sourcesPanel=`<div class="panel"><div class="sec-title"><h2>الحالات بتيجي منين</h2><div class="seg" style="flex:0 1 auto"><label><input type="radio" name="srcScope" data-act="srcScope" value="m" ${S.ui.srcAll?"":"checked"}> الشهر ده</label><label><input type="radio" name="srcScope" data-act="srcScope" value="all" ${S.ui.srcAll?"checked":""}> من الأول</label></div></div>
  ${srcArr.length?`<div class="bars">${srcArr.map(([k,v],i)=>`<div class="brow"><span>${esc(k)}</span><div class="btrack"><div class="bfill ${i===0?"top":""}" style="width:${Math.max(4,v.n/maxN*100)}%"></div></div><span class="num">${v.n} · ${Math.round(v.n/srcN*100)}%</span></div>`).join("")}</div>
  <div class="tblwrap"><table><thead><tr><th>المصدر</th><th>حالات</th>${owner?"<th>إجمالي جلساتهم</th>":""}</tr></thead><tbody>${srcArr.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${v.n}</td>${owner?`<td>${money(v.rev)}</td>`:""}</tr>`).join("")}</tbody></table></div>
  <p class="sub" style="margin:0">من خانة «عرفت المركز منين» في شيت الكشف.</p>`
  :`<div class="empty"><b>مفيش حالات جديدة ${S.ui.srcAll?"":"الشهر ده"}</b>لما تملا شيت الكشف وتختار «عرفت المركز منين» هتظهر هنا.</div>`}</div>`;
  const top=`<div class="bar"><input type="month" id="monthPick" value="${m}" style="max-width:190px" aria-label="الشهر"><span class="sub grow">${esc(monthLabel(m))}</span></div>${loadingNote}`;
  if(!owner){
    const d=S.ui.repDay||today();ensureMonth(d.slice(0,7));
    const dm=dayMoney(x=>x===d),cash=dm.cash,insta=dm.insta;
    const dayExp=Object.values(S.expenses).filter(x=>x.date===d);const out=dayExp.reduce((t,x)=>t+(x.amount||0),0);
    return `<div class="bar">${dayNav("repDay","repPick",d)}<span class="sub grow">${esc(dayLabel(d))}${d===today()?" · النهارده":""}</span></div>
  <div class="stats">
    <div class="stat"><div class="k">دخل اليوم للمركز</div><div class="v money">${money(cash+insta)}</div></div>
    <div class="stat"><div class="k">منهم كاش</div><div class="v money">${money(cash)}</div></div>
    <div class="stat"><div class="k">منهم InstaPay</div><div class="v money">${money(insta)}</div></div>
    <div class="stat"><div class="k">خرج اليوم</div><div class="v money" style="color:${out?"var(--bad)":"inherit"}">${money(out)}</div></div>
  </div>
  ${sepNames()?`<div class="stats"><div class="stat"><div class="k">${esc(sepNames())} (حساب منفصل)</div><div class="v money">${money(dm.sep)}</div><div class="sub">كاش ${money(dm.sepCash)} · InstaPay ${money(dm.sepInsta)}</div></div></div>`:""}
  ${dayExp.length?`<div class="list">${dayExp.map(x=>`<button class="row" data-act="editExp" data-id="${x.id}"><span class="t">${esc(x.category)}</span><span class="end money">${money(x.amount)}</span><span class="m">${esc(x.note||"")}</span><span></span></button>`).join("")}</div>`:""}
  <div class="bar"><input type="month" id="monthPick" value="${m}" style="max-width:190px" aria-label="شهر المصروفات"><span class="sub grow">مصروفات ${esc(monthLabel(m))}</span></div>
  ${expensesPanel}${discountsPanel(m)}${sourcesPanel}`;
  }
  const pr=payroll(m);const salTotal=pr.reduce((s,x)=>s+x.total,0);const totalExp=salTotal+ex.t;const net=rv.collected-totalExp;
  const ratio=rv.collected?totalExp/rv.collected:null;
  const prevWith=[1,2,3].map(n=>expByCat(prevMonth(m,n))).filter(p=>p.t>0);const flags=[];
  if(prevWith.length)for(const c of new Set([...Object.keys(ex.o),...prevWith.flatMap(p=>Object.keys(p.o))])){const avg=prevWith.reduce((s,p)=>s+(p.o[c]||0),0)/prevWith.length;const cur=ex.o[c]||0;if(cur>avg*1.25&&cur-avg>=300)flags.push({c,cur,avg})}
  const otNow=pr.reduce((s,x)=>s+x.otPay,0);
  let vcls,vt,vs;
  if(!rv.collected){vcls="c-mute";vt="مفيش إيراد متسجل الشهر ده";vs="سجّل الجلسات والدفعات الأول عشان أقدر أقارن المصروفات بالإيراد."}
  else if(ratio<=0.5){vcls="c-ok";vt="المصروفات تمام";vs=`المصروفات ${Math.round(ratio*100)}% من الإيراد، وده في الحدود الكويسة.`}
  else if(ratio<=0.7){vcls="c-warn";vt="المصروفات محتاجة متابعة";vs=`المصروفات ${Math.round(ratio*100)}% من الإيراد. لسه فيه ربح بس الهامش بيقل.`}
  else{vcls="c-bad";vt="المصروفات عالية الشهر ده";vs=`المصروفات ${Math.round(ratio*100)}% من الإيراد${net<0?"، والشهر خسران "+money(-net):""}.`}
  return `${top}<p class="sub" style="margin:0">المرتبات وتحليل المصروفات بيظهروا لك انت بس.</p>
  <div class="stats">
    <div class="stat"><div class="k">اتحصّل للمركز</div><div class="v money">${money(rv.collected)}</div></div>
    <div class="stat"><div class="k">مرتبات وأوفر تايم ونسب</div><div class="v money">${money(salTotal)}</div></div>
    <div class="stat"><div class="k">مصروفات تانية</div><div class="v money">${money(ex.t)}</div></div>
    <div class="stat"><div class="k">صافي الشهر</div><div class="v money" style="color:${net<0?"var(--bad)":"var(--ok)"}">${money(net)}</div></div>
  </div>
  ${sepNames()||rv.sep?`<div class="panel"><div class="sec-title"><h2>حساب ${esc(sepNames()||"منفصل")}</h2><span class="chip c-acc">${money(rv.sep)}</span></div>
  <p class="sub" style="margin:0">اتحصّل ${money(rv.sep)} (كاش ${money(rv.sepCash)} · InstaPay ${money(rv.sepInsta)}) من ${rv.sepSessions} جلسة. الفلوس دي مش داخلة في إيراد المركز ولا في صافي الشهر.</p></div>`:""}
  <div class="verdict ${vcls}"><b style="font-family:var(--f-display)">${vt}</b><span>${vs}</span></div>
  <div class="panel"><h2>تقلل منين؟</h2><ul class="tips">${expenseTips(m,rv,ex,pr,flags).map(t=>`<li>${esc(t)}</li>`).join("")}</ul></div>
  <div class="panel"><h2>المرتبات</h2>
  <div class="tblwrap"><table><thead><tr><th>الاسم</th><th>الأساسي</th><th>أوفر تايم</th><th>قيمة الأوفر تايم</th><th>النسبة</th><th>الإجمالي</th></tr></thead><tbody>
  ${pr.map(x=>`<tr><td>${esc(x.s.name)}</td><td>${money(x.sal)}</td><td>${hm(x.ot)}</td><td>${money(x.otPay)}</td><td>${x.cm?`${money(x.comm)}<div class="sub">${x.full} كاملة · ${x.half} نص · من ${money(x.commBase)}</div>`:"—"}</td><td><b>${money(x.total)}</b></td></tr>`).join("")}
  </tbody><tfoot><tr><td>الإجمالي</td><td>${money(pr.reduce((s,x)=>s+x.sal,0))}</td><td></td><td>${money(otNow)}</td><td>${money(pr.reduce((s,x)=>s+x.comm,0))}</td><td>${money(salTotal)}</td></tr></tfoot></table></div>
  <p class="sub" style="margin:0">سعر الدقيقة = المرتب ÷ (${cfg().daysBase} يوم × ${cfg().hoursBase} ساعات × 60)، والأوفر تايم × ${cfg().otMult}. النسبة محسوبة على المبلغ اللي الحالة دفعته فعلاً في الجلسة.</p></div>
  ${expensesPanel}${discountsPanel(m)}${sourcesPanel}`;
}
/* ---------- views: settings ---------- */
function vSettings(){
  const owner=S.role==="owner";
  const st=Object.values(S.staff).sort((a,b)=>(a.order||0)-(b.order||0));
  const c=cfg();const canManage=s=>owner||s.role==="doctor";
  return `
  <div class="panel"><div class="sec-title"><h2>الفريق والحسابات</h2><button class="btn sm" data-act="newStaff">+ إضافة</button></div>
  <div class="list">${owner?`<div class="row" style="cursor:default"><span class="t">د. محي <span class="chip c-teal">صاحب المركز</span></span><span class="end"></span><span class="m">اسم المستخدم: ${esc(S.myUsername||"—")}</span><span></span></div>`:""}
  ${st.map(s=>{const acc=s.uid&&S.users[s.uid]?.active?S.users[s.uid]:null;const un=s.uid?S.usernames[s.uid]:"";return `<div class="row" style="cursor:default"><span class="t">${esc(s.name)} <span class="chip c-mute">${ROLE_NAMES[s.role]||""}</span> ${s.active===false?`<span class="chip c-bad">متوقف</span>`:""}</span>
    <span class="end bar">${canManage(s)?`<button class="btn sm" data-act="editStaff" data-id="${s.id}">تعديل</button><button class="btn sm ${acc?"":"teal"}" data-act="makeLogin" data-id="${s.id}">${acc?"باسورد جديد":"اعمل حساب دخول"}</button>`:""}</span>
    <span class="m">${acc?`اسم المستخدم: ${esc(un||"—")}${acc.mustChange?" · لسه مغيّرش الباسورد المؤقت":""}`:"مفيش حساب دخول"}</span><span></span></div>`}).join("")}</div>
  <p class="sub" style="margin:0">كل واحد يقدر يغيّر اسم المستخدم والباسورد بتوعه من «حسابي». لو حد نسي الباسورد اضغط «باسورد جديد» وهيطلعلك باسورد مؤقت تديهوله.</p></div>
  <div class="panel"><div class="sec-title"><h2>أنواع الجلسات</h2><button class="btn sm" data-act="newType">+ نوع جلسة</button></div>
  <p class="sub" style="margin:0">أسماء بس من غير فلوس. الفلوس كلها في الباكدجات تحت، وكل باكدج تابع لنوع جلسة.</p>
  ${S.types.length?`<div class="list">${S.types.map(t=>{const n=(S.packTypes||[]).filter(k=>k.typeId===t.id).length;return `<button class="row" data-act="editType" data-id="${t.id}"><span class="t">${esc(t.name)} ${t.sep?`<span class="chip c-acc">حساب منفصل</span>`:""}</span><span class="end sub">${n?`${n} باكدج`:"مفيش باكدجات"}</span></button>`}).join("")}</div>`:`<div class="empty"><b>مفيش أنواع جلسات</b>مثلاً: علاج طبيعي، تيكار، ليمفيديما. الدكاترة بيشوفوا الأسماء بس.</div>`}</div>
  ${S.role==="owner"?`<div class="panel"><div class="sec-title"><h2>صلاحية مؤقتة لريهام</h2>${backfillOn()?`<span class="chip c-acc">شغالة</span>`:""}</div>
  ${backfillOn()?`<p class="sub" style="margin:0">ريهام تقدر تسجل حضور وانصراف الفريق من ${esc(S.backfill.from)} لحد ${esc(S.backfill.to)}، والصلاحية بتقفل لوحدها ${tsDate(S.backfill.until).toLocaleString("ar-EG-u-nu-latn",{weekday:"long",day:"numeric",month:"long",hour:"numeric",minute:"2-digit"})}.</p><button class="btn danger" data-act="stopBackfill">اقفلها دلوقتي</button>`
  :`<p class="sub" style="margin:0">عشان ريهام تسجل الحضور والانصراف القديم من غير GPS. الجلسات القديمة بتسجلها عادي من «الجلسات والفلوس».</p>
  <div class="grid2"><label class="f">من يوم<input type="date" id="bf_from" value="${today().slice(0,7)}-01"></label><label class="f">لحد يوم<input type="date" id="bf_to" value="${today()}"></label>
  <label class="f">الصلاحية تقفل بعد<select id="bf_days"><option value="1">يوم</option><option value="3" selected>3 أيام</option><option value="7">أسبوع</option></select></label></div>
  <button class="btn primary" data-act="setBackfill">فعّل الصلاحية</button>`}</div>`:""}
  ${S.role==="owner"?`<div class="panel"><div class="sec-title"><h2>إشعارات على موبايلك</h2>${S.notify?.topic?`<span class="chip ${S.notify.on===false?"c-mute":"c-ok"}">${S.notify.on===false?"متوقفة":"شغالة"}</span>`:""}</div>
  ${S.notify?.topic?`<p class="sub" style="margin:0">بيوصلك إشعار لو حد حاول يسجل حضور أو انصراف من بره المركز، أو رفض يدّي مكانه.</p>
  <ol class="sub" style="margin:0;padding-inline-start:20px;display:grid;gap:4px"><li>نزّل تطبيق <b>ntfy</b> من App Store أو Google Play، وهو مجاني.</li><li>افتحه ودوس <b>+</b> واكتب اسم القناة ده بالظبط:</li></ol>
  <div class="bar"><code id="ntfyTopic" style="direction:ltr;background:var(--sunk);padding:6px 10px;border-radius:8px;user-select:all">${esc(S.notify.topic)}</code><button class="btn sm" data-act="copyTopic">نسخ</button></div>
  <div class="bar"><button class="btn sm" data-act="testAlert">ابعت إشعار تجربة</button><button class="btn sm" data-act="toggleAlerts">${S.notify.on===false?"شغّل الإشعارات":"وقّف الإشعارات"}</button></div>`
  :`<p class="sub" style="margin:0">لو حد حاول يسجل حضور من بره المركز يوصلك إشعار على موبايلك حتى لو التطبيق مقفول.</p><button class="btn primary" data-act="setupAlerts">فعّل الإشعارات</button>`}</div>`:""}
  ${S.role==="owner"?`  <div class="panel"><div class="sec-title"><h2>مكان المركز للحضور</h2>${S.geo?.lat?`<span class="chip ${S.geo.required===false?"c-mute":"c-ok"}">${S.geo.required===false?"متوقف":"شغال"}</span>`:""}</div>
  <p class="sub" style="margin:0">${S.geo?.lat?`متسجل. أي حد يسجل حضوره لازم يكون في حدود ${S.geo.radius||150} متر من المركز.`:"اقف جوه المركز ودوس الزرار، عشان الحضور والانصراف يتسجلوا من جوه المركز بس."}</p>
  <div class="grid2"><label class="f">المسافة المسموحة (متر)<input id="geo_r" inputmode="numeric" value="${S.geo?.radius||150}"></label></div>
  <div class="bar"><button class="btn primary" data-act="setGeo">${S.geo?.lat?"حدّث مكان المركز من مكاني دلوقتي":"سجّل مكان المركز من مكاني دلوقتي"}</button>${S.geo?.lat?`<button class="btn sm" data-act="toggleGeo">${S.geo.required===false?"شغّل التحقق":"وقّف التحقق"}</button>`:""}</div><p class="err" id="geoSetMsg" style="margin:0"></p></div>`:""}
  <div class="panel"><div class="sec-title"><h2>الباكدجات</h2><button class="btn sm" data-act="newPackType">+ باكدج</button></div>
  ${(S.packTypes||[]).length?`<div class="list">${S.packTypes.map(t=>`<button class="row" data-act="editPackType" data-id="${t.id}"><span class="t">${esc(t.name)} ${t.typeId?`<span class="chip c-teal">${esc(typeName(t.typeId))}</span>`:`<span class="chip c-warn">من غير نوع</span>`}</span><span class="end money">${money(t.price)}</span><span class="m">${t.sessions} جلسة · الجلسة بـ ${money(t.price/t.sessions)}</span><span></span></button>`).join("")}</div>`:`<div class="empty"><b>مفيش باكدجات</b>مثلاً «علاج طبيعي 10 جلسات» بـ 4800، أو «تيكار 6 جلسات». بيتباع للمريض من ملفه، وكل جلسة من نفس النوع بتتخصم منه.</div>`}</div>
  ${owner?`<div class="panel"><h2>المرتبات والنسب (ليك انت بس)</h2>
  <div class="tblwrap"><table><thead><tr><th>الاسم</th><th>المرتب الشهري</th><th>نسبة الحالة الكاملة %</th><th>نسبة نص الحالة %</th></tr></thead><tbody>
  ${activeStaff().map(s=>`<tr><td>${esc(s.name)}</td><td><input id="sal_${s.id}" inputmode="numeric" value="${c.salary[s.id]??""}" style="width:110px"></td><td><input id="cf_${s.id}" inputmode="decimal" value="${c.commission[s.id]?.full??""}" style="width:80px" placeholder="—"></td><td><input id="ch_${s.id}" inputmode="decimal" value="${c.commission[s.id]?.half??""}" style="width:80px" placeholder="—"></td></tr>`).join("")}
  </tbody></table></div>
  <div class="grid2"><label class="f">ساعات اليوم الأساسية<input id="cfgHours" inputmode="numeric" value="${c.hoursBase}"></label><label class="f">أيام الشهر في الحسبة<input id="cfgDays" inputmode="numeric" value="${c.daysBase}"></label><label class="f">الأوفر تايم (الدقيقة بكام دقيقة)<input id="cfgOt" inputmode="decimal" value="${c.otMult}"></label></div>
  <div class="bar"><button class="btn primary" data-act="saveCfg">حفظ المرتبات</button><span class="sub">سيب خانة النسبة فاضية لو مفيش نسبة.</span></div></div>
  <div class="panel"><h2>نسخة احتياطية</h2><p class="sub" style="margin:0">نزّل ملف فيه كل بيانات المركز (المرضى والجلسات والدفعات والحضور والمصروفات والمرتبات). اعملها مرة في الشهر واحفظ الملف على Google Drive.</p><div class="bar"><button class="btn" data-act="backup">تنزيل نسخة احتياطية</button><span class="sub" id="bkMsg"></span></div></div>`:""}`;
}
/* ---------- views: doctor sessions ---------- */
function vMine(){
  const es=myEntriesList().sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||0)-(a.createdAt||0));
  const seen=num(ls("seen_"+S.mySid)||0);
  setTimeout(()=>{const mx=Math.max(0,...es.map(e=>e.review?.at||0));if(mx>seen)ls("seen_"+S.mySid,String(mx))},2500);
  const m=today().slice(0,7);const mine=es.filter(e=>(e.date||"").startsWith(m));
  return `
  <button class="btn primary" data-act="newEntry" style="padding:14px;font-size:16px">+ سجّل جلسة اشتغلتها</button>
  <div class="stats">
    <div class="stat"><div class="k">جلساتك الشهر ده</div><div class="v num">${mine.filter(e=>e.status!=="rejected").length}</div></div>
    <div class="stat"><div class="k">مستنية المراجعة</div><div class="v num">${mine.filter(e=>e.status==="pending").length}</div></div>
    <div class="stat"><div class="k">اترفضت</div><div class="v num">${mine.filter(e=>e.status==="rejected").length}</div></div>
  </div>
  ${es.length?`<div class="list">${es.map(e=>`<button class="row" data-act="myEntry" data-id="${e.id}">
    <span class="t">${esc(e.patientName)} ${e.review?.at>seen?`<span class="chip c-acc">جديد</span>`:""}</span><span class="end">${statusChip(e.status)}</span>
    <span class="m">${esc(e.date)} ${esc(e.time||"")} · ${esc(e.typeName||"")} · ${e.completion==="half"?"نص حالة":"حالة كاملة"}</span><span></span>
    ${e.review&&(e.review.note||e.review.changes?.length)?`<span class="m" style="grid-column:1/-1">${(e.review.changes||[]).map(esc).join(" · ")}${e.review.note?` — رد الاستقبال: ${esc(e.review.note)}`:""}</span>`:""}
  </button>`).join("")}</div><p class="sub">الجلسات اللي اتراجعت بتفضل ظاهرة هنا ${LOG_KEEP_DAYS} يوم.</p>`:`<div class="empty"><b>لسه مسجلتش جلسات</b>بعد كل حالة اضغط «سجّل جلسة» واكتب كومنت لو فيه حاجة. ريهام هتأكدها والنتيجة هتوصلك هنا.</div>`}`;
}
/* ---------- sheet (modal) ---------- */
function openSheet(title,body,mount){
  const root=document.getElementById("sheetRoot");
  root.innerHTML=`<div class="sheet-bg" data-act="bgClose"><div class="sheet" dir="rtl" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-h"><h2>${esc(title)}</h2><button class="btn ghost" data-act="close" aria-label="إغلاق">✕</button></div>${body}</div></div>`;
  mount&&mount(root.querySelector(".sheet"));
  const f=root.querySelector("input,select,textarea");if(f&&matchMedia("(min-width:700px)").matches)f.focus();
}
function closeSheet(){const r=document.getElementById("sheetRoot");if(r)r.innerHTML="";if(needRender){needRender=false;render()}}
const val=id=>{const e=document.getElementById(id);return e?e.value:""};
const radio=n=>document.querySelector(`input[name="${n}"]:checked`)?.value;
function setErr(msg){const e=document.getElementById("formErr");if(e)e.textContent=msg||""}
async function guard(btn,fn){
  if(btn.disabled)return;btn.disabled=true;
  const p=Promise.resolve().then(fn);
  try{
    const r=await Promise.race([p.then(()=>"ok"),new Promise(res=>setTimeout(()=>res("slow"),6000))]);
    if(r==="slow"&&!navigator.onLine){closeSheet();toast("مفيش نت. اللي سجلته هيتحفظ لوحده أول ما النت يرجع.")}
    await p;
  }catch(e){console.error(e);setErr(e?.code==="permission-denied"?"معندكش صلاحية تعمل ده.":e?.code==="resource-exhausted"?"الاستخدام المجاني لليوم خلص. جرب بكره أو فعّل خطة Blaze.":"حصلت مشكلة في الحفظ، جرب تاني.")}
  finally{btn.disabled=false}
}
function typeOptions(sel){return `<option value="">اختار نوع الجلسة</option>`+S.types.map(t=>`<option value="${t.id}" ${t.id===sel?"selected":""}>${esc(t.name)}</option>`).join("")}
function compSeg(name,v){return `<div class="seg"><label><input type="radio" name="${name}" value="full" ${v!=="half"?"checked":""}> حالة كاملة</label><label><input type="radio" name="${name}" value="half" ${v==="half"?"checked":""}> نص حالة <span class="sub">(مكملهاش أو حد ساعد)</span></label></div>`}
function sourceOptions(sel){return `<option value="">اختار</option>`+SOURCES.map(s=>`<option ${s===sel?"selected":""}>${s}</option>`).join("")}
function patientPicker(id,current){return `<input id="${id}" list="${id}_dl" value="${esc(current||"")}" placeholder="اكتب اسم الحالة" autocomplete="off"><datalist id="${id}_dl">${patientsSorted().map(p=>`<option value="${esc(pLabel(p))}"></option>`).join("")}</datalist>`}
function findPatient(v){v=(v||"").trim();if(!v)return null;return patientsSorted().find(p=>pLabel(p)===v)||patientsSorted().find(p=>p.name===v)||null}
function newPatientFields(prefix){return `<div id="${prefix}_new" class="grid2" hidden><div class="note" style="grid-column:1/-1">حالة جديدة. هيتعمل لها ملف، وتقدر تكمّل شيت الكشف بعدين من «المرضى».</div><label class="f">الموبايل<input id="${prefix}_phone" inputmode="tel"></label><label class="f">عرف المركز منين<select id="${prefix}_src">${sourceOptions("")}</select></label></div>`}
function watchNewPatient(prefix,inputId){const i=document.getElementById(inputId);const upd=()=>{document.getElementById(prefix+"_new").hidden=!(i.value.trim()&&!findPatient(i.value))};i.addEventListener("input",upd);upd()}
async function ensurePatient(v,phone,src){
  const p=findPatient(v);if(p)return{id:p.id,name:p.name};
  const name=v.trim();const ref=S.db.collection("patients").doc();
  const b=S.db.batch();
  b.set(ref,{name,phone:nd(phone||"").trim(),source:src||"",examDate:today(),createdAt:Date.now(),charged:0,paid:0,count:0});
  b.set(S.db.doc("pdir/"+ref.id),{name});
  await b.commit();
  return{id:ref.id,name};
}
/* ---------- money, discounts, packages ---------- */
function moneyFields(prefix,v){
  return `<div id="${prefix}_packbox"></div>
  <div id="${prefix}_money" style="display:grid;gap:10px"><div class="grid2">
    <label class="f">السعر<input id="${prefix}_price" inputmode="decimal" value="${v.price??""}"></label>
    <label class="f">خصم<span style="display:flex;gap:6px"><input id="${prefix}_disc" inputmode="decimal" value="${v.discount||""}" placeholder="0"><select id="${prefix}_dmode" style="width:auto" aria-label="نوع الخصم"><option value="amount">مبلغ</option><option value="final">السعر بعد الخصم</option></select></span></label>
    <label class="f">دفع كام دلوقتي<input id="${prefix}_paid" inputmode="decimal" value="${v.paid??""}"></label>
    <label class="f">طريقة الدفع<select id="${prefix}_method"><option value="cash" ${v.method!=="instapay"?"selected":""}>كاش</option><option value="instapay" ${v.method==="instapay"?"selected":""}>InstaPay</option></select></label>
  </div>
  <label class="f" id="${prefix}_dreasonbox" hidden>سبب الخصم (لازم)<input id="${prefix}_dreason" value="${esc(v.discountReason||"")}" placeholder="مثلاً قريب حد من الفريق، أو عرض الشهر"></label>
  <div class="note" id="${prefix}_sum"></div></div>`;
}
function discFrom(prefix,price){const x=num(val(prefix+"_disc"));if(!x)return 0;return val(prefix+"_dmode")==="final"?Math.max(0,price-x):Math.min(price,x)}
function wireMoney(prefix,typeSel){
  const f=k=>document.getElementById(prefix+"_"+k);
  const upd=()=>{const price=num(f("price").value);const disc=discFrom(prefix,price);const net=Math.max(0,price-disc);const paid=num(f("paid").value);const d=net-paid;
    f("dreasonbox").hidden=!disc;
    f("sum").innerHTML=`${disc?`خصم <b>${money(disc)}</b> · `:""}الصافي <b>${money(net)}</b> · ${d>0?`يفضل عليه <b style="color:var(--bad)">${money(d)}</b>`:d<0?`زيادة <b style="color:var(--ok)">${money(-d)}</b> تتحسب له رصيد`:"مدفوع بالكامل"}`};
  ["price","disc","paid"].forEach(k=>f(k).addEventListener("input",upd));f("dmode").addEventListener("change",upd);
  if(typeSel){const t=document.getElementById(typeSel);t.addEventListener("change",()=>{const p=S.prices[t.value];if(p!=null){f("price").value=p;if(!f("paid").value)f("paid").value=p}upd()})}
  upd();
}
function selectedPack(prefix){const pat=findPatient(val(prefix+"_pat"));const id=val(prefix+"_pack");return (S.patients[pat?.id]?.packs||[]).find(k=>k.id===id)}
function readMoney(prefix){
  if(document.getElementById(prefix+"_usepack")?.checked){const pk=selectedPack(prefix);if(!pk)return{_err:"اختار الباكدج"};
    return{price:0,discount:0,net:0,paid:0,method:"",discountReason:"",packId:pk.id,packName:pk.name,packValue:Math.round((pk.price||0)/(pk.sessions||1)),packPay:num(val(prefix+"_kpay")),packPayMethod:val(prefix+"_kmethod")||"cash"}}
  const price=num(val(prefix+"_price")),discount=discFrom(prefix,price);
  return{price,discount,net:Math.max(0,price-discount),paid:num(val(prefix+"_paid")),method:val(prefix+"_method"),discountReason:discount?val(prefix+"_dreason").trim():"",packId:null,packName:"",packValue:0};
}
function moneyError(m){return m._err||(m.discount&&!m.discountReason?"اكتب سبب الخصم":"")}
function activePacks(pid,keepId){return (S.patients[pid]?.packs||[]).filter(k=>(k.used||0)<k.sessions||k.id===keepId)}
function packsFor(pid,typeId,keepId){return activePacks(pid,keepId).filter(k=>!typeId||!k.typeId||k.typeId===typeId||k.id===keepId)} // a package only serves its own session type
function packOwed(k){return k&&k.paid!=null?Math.round((k.price||0)-(k.paid||0)):null}
function packMoneyChip(k){const o=packOwed(k);return o==null?"":o>0?`<span class="chip c-bad">عليه ${money(o)}</span>`:o<0?`<span class="chip c-ok">ليه ${money(-o)}</span>`:`<span class="chip c-ok">خالص</span>`}
function patBalChip(pid){const p=S.patients[pid];if(!p)return "";const d=Math.round((p.charged||0)-(p.paid||0));return d>0?`<span class="chip c-bad">عليه ${money(d)}</span>`:d<0?`<span class="chip c-ok">ليه ${money(-d)}</span>`:`<span class="chip c-ok">خالص</span>`}
function wirePack(prefix,cur,typeSel){ // pick the session type first; the patient's package of that type is used, otherwise it's a single paid session
  const box=document.getElementById(prefix+"_packbox"),moneyEl=document.getElementById(prefix+"_money"),pick=document.getElementById(prefix+"_pat"),tsel=typeSel&&document.getElementById(typeSel);
  const draw=()=>{const pat=findPatient(pick.value);const tid=tsel?tsel.value:"";const list=pat?packsFor(pat.id,tid,cur?.packId):[];
    if(!list.length){box.innerHTML=pat&&tid?`<div class="note">مفيش باكدج ${esc(typeName(tid))} شغال للمريض ده، فدي جلسة منفردة: اكتب سعرها تحت. أو اقفل وبيع له باكدج من ملفه.</div>`:"";moneyEl.hidden=false;return}
    const on=cur?!!cur.packId:true;
    box.innerHTML=`<div class="seg"><label><input type="checkbox" id="${prefix}_usepack" style="width:auto" ${on?"checked":""}> الجلسة دي من الباكدج</label><select id="${prefix}_pack" style="flex:1 1 200px">${list.map(k=>{const o=packOwed(k);return `<option value="${k.id}" ${k.id===cur?.packId?"selected":""}>${esc(packTitle(k))} · فاضل ${k.sessions-(k.used||0)} من ${k.sessions}${o>0?` · عليه ${money(o)}`:o===0?" · خالص":""}</option>`}).join("")}</select></div>
    <div id="${prefix}_kpaybox" class="grid2"><label class="f">دفع دلوقتي على الباكدج (لو دفع)<input id="${prefix}_kpay" inputmode="decimal" placeholder="0"></label><label class="f">طريقة الدفع<select id="${prefix}_kmethod"><option value="cash">كاش</option><option value="instapay">InstaPay</option></select></label></div>`;
    const cb=document.getElementById(prefix+"_usepack");const sync=()=>{moneyEl.hidden=cb.checked;document.getElementById(prefix+"_kpaybox").hidden=!cb.checked};cb.addEventListener("change",sync);sync()};
  pick.addEventListener("input",draw);if(tsel)tsel.addEventListener("change",draw);draw();
}
function addPackPay(b,acc,pat,m,date){ // a payment made on a package while recording a session
  const amt=m.packPay||0;delete m.packPay;const method=m.packPayMethod;delete m.packPayMethod;
  if(!amt||!m.packId||!pat?.id)return;
  b.set(S.db.collection("payments").doc(),{patientId:pat.id,patientName:pat.name,amount:amt,method,date:date||today(),packId:m.packId,note:`على ${packTitle({name:m.packName})}`,createdAt:Date.now(),by:S.mySid});
  pp(acc,pat.id,{dp:amt,payPack:m.packId,payAmt:amt});
}
/* each patient doc holds its running balance (charged / paid / count) and its packages; one update per patient per batch */
function pp(acc,pid,o={}){if(!pid)return;const a=acc[pid]||(acc[pid]={dc:0,dp:0,dn:0,date:null,use:{},pay:{}});a.dc+=o.dc||0;a.dp+=o.dp||0;a.dn+=o.dn||0;if(o.date&&(!a.date||o.date>a.date))a.date=o.date;if(o.pack)a.use[o.pack]=(a.use[o.pack]||0)+(o.use||0);if(o.payPack)a.pay[o.payPack]=(a.pay[o.payPack]||0)+(o.payAmt||0)}
function flushPatients(b,acc){for(const [pid,a] of Object.entries(acc)){const u={charged:inc(a.dc),paid:inc(a.dp),count:inc(a.dn)};if(a.date)u.last=a.date;
  if(Object.keys(a.use).length||Object.keys(a.pay).length)u.packs=(S.patients[pid]?.packs||[]).map(k=>{let x=k;if(a.use[k.id])x={...x,used:Math.max(0,(x.used||0)+a.use[k.id])};if(a.pay[k.id])x={...x,paid:(x.paid||0)+a.pay[k.id]};return x});
  b.update(S.db.doc("patients/"+pid),u)}}
function visitEffect(acc,v,sign){if(!v)return;pp(acc,v.patientId,{dc:sign*(v.net||0),dp:sign*(v.paid||0),dn:sign,date:sign>0?v.date:null,pack:v.packId,use:sign})}
/* ---------- doctor entry ---------- */
function sheetEntry(e,fromAppt){
  entryAppt=fromAppt||null;
  const ro=!!(e&&e.id&&e.status!=="pending");
  openSheet(e?(ro?"تفاصيل الجلسة":"تعديل الجلسة"):"سجّل جلسة",`
  ${ro?`<div class="note">${statusChip(e.status)} ${(e.review?.changes||[]).map(esc).join(" · ")}${e.review?.note?`<br>رد الاستقبال: ${esc(e.review.note)}`:""}</div>`:""}
  <label class="f">اسم الحالة<input id="e_pat" list="e_dl" value="${esc(e?.patientName||"")}" autocomplete="off" ${ro?"disabled":""}><datalist id="e_dl">${Object.values(S.pdir).map(p=>`<option value="${esc(p.name)}"></option>`).join("")}</datalist></label>
  <div class="grid2"><label class="f">التاريخ<input type="date" id="e_date" value="${e?.date||today()}" ${ro?"disabled":""}></label><label class="f">الساعة<input type="time" id="e_time" value="${e?.time||nowHM()}" ${ro?"disabled":""}></label></div>
  <label class="f">نوع الجلسة<select id="e_type" ${ro?"disabled":""}>${typeOptions(e?.typeId)}</select></label>
  ${ro?"":compSeg("e_comp",e?.completion)}
  <label class="f">كومنت (اختياري)<textarea id="e_note" placeholder="مثلاً الحالة اتحسنت، أو د. سلمى ساعدتني في نص الجلسة" ${ro?"disabled":""}>${esc(e?.note||"")}</textarea></label>
  <div class="sec-title"><span class="sub">صور مع الكومنت (لحد ${MEDIA_MAX})</span>${ro?"":`<label class="btn sm">+ صورة<input type="file" id="e_file" accept="image/*" multiple hidden></label>`}</div>
  <div class="photos" id="e_media"></div>
  <div class="err" id="formErr"></div>
  ${ro?"":`<div class="bar"><button class="btn primary grow" data-act="saveEntry" data-id="${e?.id||""}">${e?.id?"حفظ التعديل":"ابعت للمراجعة"}</button>${e?.id?`<button class="btn danger" data-act="delEntry" data-id="${e.id}" data-confirm>حذف</button>`:""}</div>`}`,
  ()=>{entryMedia=[...(e?.media||[])];drawEntryMedia(ro);const f=document.getElementById("e_file");if(f)f.addEventListener("change",()=>addEntryMedia(f))});
}
/* photos attached to a session comment live inside the log entry itself (small, compressed) */
const MEDIA_MAX=3;let entryMedia=[];
function mediaImgs(list){return (list||[]).filter(u=>/^data:image\/(jpeg|png|webp);base64,/.test(u)).map(u=>`<img src="${u}" alt="صورة مع الكومنت" data-act="zoom">`).join("")}
function drawEntryMedia(ro){const el=document.getElementById("e_media");if(!el)return;
  el.innerHTML=entryMedia.length?entryMedia.map((u,i)=>`<span style="position:relative;display:inline-block"><img src="${u}" alt="صورة مع الكومنت" data-act="zoom">${ro?"":`<button class="btn sm danger" data-act="rmMedia" data-i="${i}" style="position:absolute;top:4px;left:4px;padding:0 8px" aria-label="شيل الصورة">✕</button>`}</span>`).join(""):(ro?`<span class="sub">مفيش صور.</span>`:`<span class="sub">مثلاً صورة أشعة، أو وضع الحالة، أو ورقة من الدكتور المعالج.</span>`)}
async function addEntryMedia(input){
  const files=[...input.files].slice(0,MEDIA_MAX-entryMedia.length);input.value="";
  if(!files.length)return setErr(`أقصى عدد ${MEDIA_MAX} صور للجلسة`);setErr("بيجهّز الصور…");
  try{for(const f of files)entryMedia.push(await compressImage(f,280000,1280));setErr("")}catch(e){setErr("صورة منهم مترفعتش، جرب تصوّرها تاني.")}
  drawEntryMedia(false);
}
async function saveEntry(id){
  const name=val("e_pat").trim(),type=val("e_type");
  if(!name)return setErr("اكتب اسم الحالة");if(!type)return setErr("اختار نوع الجلسة");
  const pd=Object.entries(S.pdir).find(([k,p])=>p.name===name);
  const body={patientName:name,patientId:pd?pd[0]:null,date:val("e_date")||today(),time:val("e_time"),typeId:type,typeName:typeName(type),completion:radio("e_comp")||"full",note:val("e_note").trim(),media:entryMedia.slice(0,MEDIA_MAX),status:"pending",doctorSid:S.mySid};
  if(id)await S.db.doc("log/"+id).update(body);
  else if(entryAppt){const ref=S.db.collection("log").doc(),b=S.db.batch();
    b.set(ref,{...body,apptId:entryAppt.id,createdAt:Date.now()});
    b.update(S.db.doc("appts/"+entryAppt.id),{endAt:firebase.firestore.FieldValue.serverTimestamp(),status:"done",logId:ref.id});
    await b.commit();entryAppt=null}
  else await S.db.collection("log").doc().set({...body,createdAt:Date.now()});
  closeSheet();toast("اتبعتت للمراجعة");
}
/* ---------- appointments ---------- */
let entryAppt=null,apptWarned=false;
const APPT_STATUS={booked:["c-mute","محجوز"],arrived:["c-warn","وصل ومستني"],started:["c-acc","جوه الجلسة"],done:["c-ok","خلص"],noshow:["c-warn","محضرش"],cancelled:["c-bad","اتلغى"]};
function apptChip(a){const [c,l]=APPT_STATUS[a.status]||APPT_STATUS.booked;return `<span class="chip ${c}">${l}</span>`}
function apptDocs(a){return (a.doctors&&a.doctors.length?a.doctors:[a.doctorSid]).filter(Boolean)}
function tsDate(t){return t?(t.toDate?t.toDate():new Date(t)):null}
function apptDur(a){const s=tsDate(a.startAt),e=tsDate(a.endAt);return s&&e?Math.max(0,Math.round((e-s)/60000)):null}
function apptElapsed(a){const s=tsDate(a.startAt);return s?Math.max(0,Math.round((Date.now()-s)/60000)):null}
function apptTimes(a){const p=[];if(a.arrived)p.push(`وصل ${a.arrived}`);
  if(a.start)p.push(`بدأ ${a.start}${a.startBy?` مع ${staffName(a.startBy)}`:""}`);
  if(a.end){const d=apptDur(a);p.push(`خلص ${a.end}${a.endBy&&a.endBy!==a.startBy?` (${staffName(a.endBy)})`:""}${d!=null?` · ${hm(d)}`:""}`)}
  else if(a.status==="started"){const e=apptElapsed(a);if(e!=null)p.push(`شغّال من ${hm(e)}`)}
  return p.join(" · ")}
function isDoc(sid){return sid==="owner"||S.staff[sid]?.role==="doctor"}
function provisionalCredit(a){ // who gets the session until Reham confirms
  if(!a.startBy)return{mode:"full",a:apptDocs(a)[0]};
  if(a.endBy&&isDoc(a.endBy)&&a.endBy!==a.startBy)return{mode:"split",a:a.startBy,b:a.endBy};
  return{mode:"full",a:a.startBy};
}
function creditLabel(c){return c.mode==="split"?`نص ونص: ${staffName(c.a)} و${staffName(c.b)}`:`حالة كاملة لـ ${staffName(c.a)}`}
function sessionInfo(pid,kind,excludeId,date,time,typeId){ // "جلسة 4 من 10 · باكدج علاج طبيعي" from the package of that type, "جلسة رقم 7" otherwise
  if(kind==="exam")return{label:"كشف",packId:null};
  const pack=packsFor(pid,typeId)[0];
  const before=Object.values(S.appts).filter(x=>x.id!==excludeId&&x.patientId===pid&&x.kind!=="exam"&&!x.confirmed&&!["cancelled","noshow"].includes(x.status)&&((x.date||"")+(x.time||""))<(date+time)&&(!pack||x.packId===pack.id)).length;
  if(pack){const n=(pack.used||0)+before+1;return{label:`جلسة ${Math.min(n,pack.sessions)} من ${pack.sessions} · ${packTitle(pack)}`,packId:pack.id}}
  return{label:`جلسة رقم ${(S.patients[pid]?.count||0)+before+1}${typeId?` · ${typeName(typeId)} منفردة`:""}`,packId:null};
}
function apptRow(a,view,showDoc){
  const doctorBtns=a.confirmed?"":a.status==="started"?`<button class="btn sm teal" data-act="apptEnd" data-id="${a.id}">خلصت</button>`:["booked","arrived"].includes(a.status)&&a.date===today()?`<button class="btn sm primary" data-act="apptStart" data-id="${a.id}">بدأت</button>`:"";
  const adminBtns=`<button class="btn sm" data-act="editAppt" data-id="${a.id}">تعديل</button>`;
  const docs=apptDocs(a).map(staffName).join(" + ");
  const credit=a.confirmed&&a.credit?creditLabel(a.credit):a.status==="done"?`لحد التأكيد: ${creditLabel(provisionalCredit(a))}`:"";
  return `<div class="row stack" style="cursor:default"><span class="t">${esc(a.time||"")} · ${esc(a.patientName)} ${apptChip(a)} <span class="chip c-teal">${esc(a.kindLabel||(a.kind==="exam"?"كشف":"جلسة"))}</span> ${a.confirmed?`<span class="chip c-ok">ريهام أكدت</span>`:""}</span>
  <span class="end bar">${view==="doctor"?doctorBtns:adminBtns}</span>
  <span class="m">${[showDoc?docs:"",a.typeName||"",a.note||"",credit].filter(Boolean).map(esc).join(" · ")}</span><span class="end m">${esc(apptTimes(a))}</span></div>`;
}
function vAppts(){
  const d=S.ui.date;ensureMonth(d.slice(0,7));
  const list=Object.values(S.appts).filter(a=>a.date===d&&!a.walkin).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const active=list.filter(a=>a.status!=="cancelled");
  const byDoc={};active.forEach(a=>{const k=apptDocs(a)[0]||"—";(byDoc[k]=byDoc[k]||[]).push(a)});
  return `<div class="bar">${dayNav("day","dayPick",d)}<span class="sub grow">${esc(dayLabel(d))}${d===today()?" · النهارده":""}</span><button class="btn primary" data-act="newAppt">+ حجز</button></div>
  <p class="sub" style="margin:0">هنا الحجز بس. اللي حصل فعلاً (جه، كنسل، دفع، دخل إمتى) بيتسجل في «جلسات اليوم».</p>
  <div class="stats"><div class="stat"><div class="k">محجوز اليوم ده</div><div class="v num">${active.length}</div></div>${Object.entries(byDoc).map(([sid,arr])=>`<div class="stat"><div class="k">${esc(staffName(sid))}</div><div class="v num">${arr.length}</div></div>`).join("")}</div>
  ${active.length?Object.entries(byDoc).map(([sid,arr])=>`<div class="panel"><h2>${esc(staffName(sid))} <span class="sub">${arr.length} حجز</span></h2><div class="list">${arr.map(a=>apptRow(a,"admin",apptDocs(a).length>1)).join("")}</div></div>`).join(""):`<div class="empty"><b>مفيش حجوزات اليوم ده</b>اضغط «+ حجز» واختار المريض والدكتور والساعة.</div>`}
  ${list.length>active.length?`<p class="sub">${list.length-active.length} حجز اتلغى.</p>`:""}`;
}
function vMyAppts(){
  const d=S.ui.date;const list=Object.values(S.appts).filter(a=>a.date===d&&a.status!=="cancelled"&&apptDocs(a).includes(S.mySid)).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  return `<div class="bar">${dayNav("day","dayPick",d)}<span class="sub grow">${esc(dayLabel(d))}${d===today()?" · النهارده":""}</span></div>
  <p class="sub" style="margin:0">دوس «بدأت» أول ما المريض يدخل، و«خلصت» في آخر الجلسة. لو حد تاني من الدكاترة كمّل الجلسة، هو اللي يدوس «خلصت» من عنده.</p>
  ${list.length?`<div class="list">${list.map(a=>apptRow(a,"doctor",apptDocs(a).length>1)).join("")}</div>`:`<div class="empty"><b>مفيش مواعيد ليك اليوم ده</b>المواعيد بتسجلها ريهام وبتظهرلك هنا.</div>`}`;
}
function sheetAppt(id){
  const a=id?S.appts[id]:{date:S.ui.date,time:"",duration:60,status:"booked",kind:"session"};if(!a)return;apptWarned=false;
  const cur=a.patientId&&S.patients[a.patientId]?pLabel(S.patients[a.patientId]):(a.patientName||"");
  const docOpts=sel=>[...doctors().map(x=>[x.id,x.name]),["owner","د. محي"]].map(([k,n])=>`<option value="${k}" ${sel===k?"selected":""}>${esc(n)}</option>`).join("");
  const ds=apptDocs(a);
  openSheet(id?"تعديل الحجز":"حجز جديد",`
  <label class="f">المريض${patientPicker("ap_pat",cur)}</label>${newPatientFields("ap")}
  <div class="seg"><label><input type="radio" name="ap_kind" value="exam" ${a.kind==="exam"?"checked":""}> كشف</label><label><input type="radio" name="ap_kind" value="session" ${a.kind!=="exam"?"checked":""}> جلسة</label></div>
  <label class="f">نوع الجلسة<select id="ap_type">${typeOptions(a.typeId)}</select></label>
  <div class="note" id="ap_info"></div>
  <div class="grid2"><label class="f">الدكتور<select id="ap_doc"><option value="">اختار الدكتور</option>${docOpts(ds[0])}</select></label>
  <label class="f">دكتور تاني (لو الحالة هتتحوّل له)<select id="ap_doc2"><option value="">مفيش</option>${docOpts(ds[1])}</select></label>
  <label class="f">اليوم<input type="date" id="ap_date" value="${a.date}"></label><label class="f">الساعة<input type="time" id="ap_time" value="${a.time||""}"></label>
  <label class="f">المدة<select id="ap_dur">${[30,45,60,90,120].map(m=>`<option value="${m}" ${(a.duration||60)===m?"selected":""}>${hm(m)}</option>`).join("")}</select></label></div>
  <label class="f">ملاحظة<input id="ap_note" value="${esc(a.note||"")}"></label>
  ${id&&(a.start||a.arrived)?`<div class="note">${esc(apptTimes(a))}</div>`:""}
  <div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="saveAppt" data-id="${id||""}">حفظ</button>
  ${id&&["booked","arrived"].includes(a.status)?`<button class="btn" data-act="apptNoShow" data-id="${id}">محضرش</button><button class="btn danger" data-act="apptCancel" data-id="${id}" data-confirm>إلغاء الميعاد</button>`:""}</div>`,
  ()=>{watchNewPatient("ap","ap_pat");const upd=()=>{const p=findPatient(val("ap_pat"));const el=document.getElementById("ap_info");
      if(!p){el.textContent=val("ap_pat").trim()?"مريض جديد.":"اختار المريض.";return}
      const k=radio("ap_kind")||"session",tid=val("ap_type");const pk=k==="exam"?null:packsFor(p.id,tid)[0];
      el.innerHTML=esc(sessionInfo(p.id,k,id,val("ap_date"),val("ap_time"),tid).label)+(k==="exam"?"":pk?" "+packMoneyChip(pk):tid?" · مفيش باكدج من النوع ده":" · اختار نوع الجلسة")+" · الحساب كله: "+patBalChip(p.id)};
    ["ap_pat","ap_date","ap_time"].forEach(x=>document.getElementById(x).addEventListener("input",upd));document.getElementById("ap_type").addEventListener("change",upd);document.querySelectorAll('input[name="ap_kind"]').forEach(x=>x.addEventListener("change",upd));upd()});
}
async function saveAppt(id){
  const pv=val("ap_pat").trim(),doc=val("ap_doc"),doc2=val("ap_doc2"),date=val("ap_date"),time=val("ap_time"),dur=num(val("ap_dur"))||60,kind=radio("ap_kind")||"session";
  if(!pv)return setErr("اختار المريض");if(!doc)return setErr("اختار الدكتور");if(!date||!time)return setErr("اختار اليوم والساعة");
  const s0=mins(time),clash=Object.values(S.appts).find(x=>x.id!==id&&apptDocs(x).includes(doc)&&x.date===date&&!["cancelled","noshow","done"].includes(x.status)&&s0<mins(x.time)+(x.duration||60)&&mins(x.time)<s0+dur);
  if(clash&&!apptWarned){apptWarned=true;return setErr(`${staffName(doc)} عنده ميعاد مع ${clash.patientName} الساعة ${clash.time}. لو متأكد دوس حفظ تاني.`)}
  const pat=await ensurePatient(pv,val("ap_phone"),val("ap_src"));const type=val("ap_type");
  const info=sessionInfo(pat.id,kind,id,date,time,type);
  const docsList=[...new Set([doc,doc2].filter(Boolean))];
  const body={patientId:pat.id,patientName:pat.name,doctorSid:doc,doctors:docsList,kind,kindLabel:info.label,packId:info.packId||null,date,time,duration:dur,typeId:type||null,typeName:type?typeName(type):"",note:val("ap_note").trim()};
  if(id){await S.db.doc("appts/"+id).update(body);if(S.old.appts[id]){S.old.appts[id]={...S.old.appts[id],...body};merge()}}
  else await S.db.collection("appts").doc().set({...body,status:"booked",confirmed:false,createdAt:Date.now(),by:S.mySid});
  closeSheet();toast("الميعاد اتحفظ");
}
const TSV=()=>firebase.firestore.FieldValue.serverTimestamp();
async function apptArrive(id){await S.db.doc("appts/"+id).update({arrivedAt:TSV(),status:"arrived"});toast("اتسجل وصوله")}
async function apptStart(id){await S.db.doc("appts/"+id).update({startAt:TSV(),startBy:S.mySid,status:"started"});toast("العدّاد اشتغل")}
async function apptFinishByDesk(id){await S.db.doc("appts/"+id).update({endAt:TSV(),endBy:S.mySid,status:"done"});toast("اتسجل إنها خلصت")}
function apptEnd(id){ // doctor finishing: optional comment + photos, then stamp the end time
  const a=S.appts[id];if(!a)return;entryAppt=a;
  openSheet("خلصت الجلسة",`<div class="note">${esc(a.patientName)} · ${esc(a.kindLabel||"")}${a.start?` · بدأت ${esc(a.start)}${a.startBy&&a.startBy!==S.mySid?` مع ${esc(staffName(a.startBy))}`:""}`:""}</div>
  <label class="f">كومنت (اختياري)<textarea id="e_note" placeholder="مثلاً الحالة اتحسنت، أو كملت الجلسة بدل د. سلمى"></textarea></label>
  <div class="sec-title"><span class="sub">صور (لحد ${MEDIA_MAX})</span><label class="btn sm">+ صورة<input type="file" id="e_file" accept="image/*" multiple hidden></label></div>
  <div class="photos" id="e_media"></div><div class="err" id="formErr"></div>
  <button class="btn primary" data-act="saveApptEnd" data-id="${id}">سجّل إنها خلصت</button>`,
  ()=>{entryMedia=[];drawEntryMedia(false);const f=document.getElementById("e_file");f.addEventListener("change",()=>addEntryMedia(f))});
}
async function saveApptEnd(id){
  await S.db.doc("appts/"+id).update({endAt:TSV(),endBy:S.mySid,status:"done",docNote:val("e_note").trim(),media:entryMedia.slice(0,MEDIA_MAX)});
  entryAppt=null;closeSheet();toast("اتسجلت. ريهام هتأكدها.");
}
function sheetApptConfirm(id){
  const a=S.appts[id];if(!a)return;const p=S.patients[a.patientId];const prov=provisionalCredit(a);
  const involved=[...new Set([a.startBy,a.endBy,...apptDocs(a)].filter(x=>x&&isDoc(x)))];
  const opts=[...involved.map(s=>({v:`full:${s}`,l:`حالة كاملة لـ ${staffName(s)}`}))];
  if(involved.length>=2){const x=prov.mode==="split"?[prov.a,prov.b]:involved.slice(0,2);opts.push({v:`split:${x[0]}:${x[1]}`,l:`نص ونص: ${staffName(x[0])} و${staffName(x[1])}`})}
  const def=prov.mode==="split"?`split:${prov.a}:${prov.b}`:`full:${prov.a}`;
  const price=S.prices[a.typeId];
  openSheet("تأكيد الجلسة",`
  <div class="note"><b>${esc(a.patientName)}</b> · ${esc(a.kindLabel||"")}<br>${esc(apptTimes(a))}${a.docNote?`<br>كومنت الدكتور: ${esc(a.docNote)}`:""}${a.media?.length?`<div class="photos" style="margin-top:8px">${mediaImgs(a.media)}</div>`:""}</div>
  <div class="seg">${opts.map(o=>`<label><input type="radio" name="c_credit" value="${o.v}" ${o.v===def?"checked":""}> ${esc(o.l)}</label>`).join("")}</div>
  <label class="f">نوع الجلسة<select id="c_type">${typeOptions(a.typeId)}</select></label>
  <input type="hidden" id="c_pat" value="${esc(p?pLabel(p):a.patientName)}">
  ${moneyFields("c",{price:price??"",paid:price??"",method:"cash"})}
  <div class="err" id="formErr"></div>
  <button class="btn primary" data-act="saveApptConfirm" data-id="${id}">تأكيد وتسجيل الجلسة</button>`,
  ()=>{wireMoney("c","c_type");wirePack("c",a.kind==="exam"?{packId:null}:null,"c_type")});
}
async function saveApptConfirm(id){
  const a=S.appts[id];if(!a)return;const cv=radio("c_credit")||"";const [mode,x,y]=cv.split(":");
  if(!x)return setErr("اختار الحالة تتحسب لمين");const type=val("c_type");if(!type)return setErr("اختار نوع الجلسة");
  const mny=readMoney("c");const me=moneyError(mny);if(me)return setErr(me);
  const credit=mode==="split"?{mode:"split",a:x,b:y}:{mode:"full",a:x};
  const v={date:a.date,time:a.start||a.time,patientId:a.patientId,patientName:a.patientName,doctorId:credit.a,doctor2Id:credit.b||null,completion:credit.mode==="split"?"half":"full",typeId:type,typeName:typeName(type),...mny,apptId:id,createdAt:Date.now(),by:S.mySid};
  const b=S.db.batch(),acc={};addPackPay(b,acc,{id:a.patientId,name:a.patientName},v,a.date);
  b.set(S.db.doc("visits/"+id),v);visitEffect(acc,v,1);flushPatients(b,acc);
  (a.media||[]).forEach((data,i)=>b.set(S.db.doc(`photos/a_${id}_${i}`),{patientId:a.patientId,data,at:Date.now(),from:"session",date:a.date,by:a.endBy||a.startBy||"",note:a.docNote||""}));
  b.update(S.db.doc("appts/"+id),{confirmed:true,confirmedBy:S.mySid,confirmedAt:Date.now(),visitId:id,credit});
  await b.commit();closeSheet();toast("اتأكدت واتسجلت الجلسة");
}
/* ---------- sessions of the day: what actually happened (came / cancelled, when, with whom, paid) ---------- */
const SESS_STATUS=[["booked","مستني"],["arrived","وصل"],["started","جوه الجلسة"],["done","خلصت"],["noshow","محضرش"],["cancelled","كنسل"]];
function lateMin(a){const b=mins(a.time),x=mins(a.arrived);return b!=null&&x!=null?x-b:null}
function lateChip(a){const l=lateMin(a);return l!=null&&l>10?`<span class="chip c-warn">اتأخر ${hm(l)}</span>`:""}
function payChip(a){
  if(["noshow","cancelled"].includes(a.status))return "";
  const v=S.visits[a.id];return (v?"":`<span class="chip c-mute">لسه ما اتسجلش</span> `)+patBalChip(a.patientId);
}
function needsRecord(a){return a.status==="done"&&(!S.visits[a.id]||!a.creditSet)} // finished, but Reham hasn't settled doctor + money yet
function sessionRow(a){
  const v=S.visits[a.id];const docs=v?visitDocs(v):apptDocs(a).map(staffName).join(" + ");
  const quick=(a.status==="booked"?`<button class="btn sm" data-act="quickArrive" data-id="${a.id}">وصل</button>`:"")
    +(["booked","arrived"].includes(a.status)?`<button class="btn sm danger" data-act="quickCancel" data-id="${a.id}">لغى</button>`:"")
    +`<button class="btn sm ${needsRecord(a)?"teal":""}" data-act="openSession" data-id="${a.id}">${needsRecord(a)?"أكّد":"فتح"}</button>`;
  return `<div class="row stack" style="cursor:default"><span class="t">${esc(a.time||"")} · ${esc(a.patientName)} ${apptChip(a)} ${lateChip(a)} ${payChip(a)}</span>
  <span class="end bar">${quick}</span>
  <span class="m">${[a.kindLabel||"",docs,a.status==="cancelled"&&a.cancelReason?a.cancelReason:""].filter(Boolean).map(esc).join(" · ")}</span><span class="end m">${esc(apptTimes(a))}</span></div>`;
}
function vSessions(){
  const d=S.ui.date;ensureMonth(d.slice(0,7));
  const appts=Object.values(S.appts).filter(a=>a.date===d).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const loose=Object.values(S.visits).filter(v=>v.date===d&&!(v.apptId&&S.appts[v.apptId])).sort((a,b)=>(a.time||"").localeCompare(b.time||""));
  const ps=Object.values(S.payments).filter(p=>p.date===d);
  let remain=0;const dm=dayMoney(x=>x===d),cash=dm.cash,insta=dm.insta;
  new Set([...appts.filter(a=>!["noshow","cancelled"].includes(a.status)).map(a=>a.patientId),...loose.map(v=>v.patientId)]).forEach(pid=>{const p=S.patients[pid];if(p)remain+=Math.max(0,(p.charged||0)-(p.paid||0))});
  const came=appts.filter(a=>["arrived","started","done"].includes(a.status)).length+loose.length;
  const missing=Object.values(S.appts).filter(needsRecord);
  return `<div class="bar">${dayNav("day","dayPick",d)}<span class="sub grow">${esc(dayLabel(d))}${d===today()?" · النهارده":""}</span><button class="btn" data-act="newPay">+ دفعة</button><button class="btn primary" data-act="newWalkin">+ جلسة من غير ميعاد</button></div>
  ${missing.length?`<div class="note">فيه ${missing.length} جلسة خلصت ومستنية تأكيدك للدكتور والفلوس${missing.some(a=>a.date!==d)?"، منهم في أيام تانية":""}. دوس «أكّد» جنبها.</div>`:""}
  <div class="stats">
    <div class="stat"><div class="k">جم النهارده</div><div class="v num">${came}</div></div>
    <div class="stat"><div class="k">محضروش / كنسلوا</div><div class="v num">${appts.filter(a=>["noshow","cancelled"].includes(a.status)).length}</div></div>
    <div class="stat"><div class="k">اتحصّل للمركز (كاش · InstaPay)</div><div class="v money">${money(cash+insta)}</div><div class="sub">${money(cash)} · ${money(insta)}</div></div>
    ${sepNames()?`<div class="stat"><div class="k">${esc(sepNames())} (حساب منفصل)</div><div class="v money">${money(dm.sep)}</div><div class="sub">${money(dm.sepCash)} · ${money(dm.sepInsta)}</div></div>`:""}
    <div class="stat"><div class="k">لسه على اللي جم (حسابهم كله)</div><div class="v money" style="color:${remain?"var(--bad)":"inherit"}">${money(remain)}</div></div>
  </div>
  ${appts.length||loose.length?`<div class="list">${appts.map(sessionRow).join("")}${loose.map(v=>`<button class="row" data-act="editVisit" data-id="${v.id}"><span class="t">${esc(v.time||"")} · ${esc(v.patientName)} ${v.completion==="half"&&!v.doctor2Id?`<span class="chip c-warn">نص</span>`:""}</span><span class="end">${v.packId?`<span class="chip c-teal">من الباكدج</span>`:(v.net||0)-(v.paid||0)>0?`<span class="chip c-bad">عليه ${money((v.net||0)-(v.paid||0))}</span>`:`<span class="chip c-ok">مدفوعة</span>`}</span><span class="m">${esc(visitDocs(v))} · ${esc(v.typeName||"")}</span><span></span></button>`).join("")}</div>`
  :`<div class="empty"><b>مفيش جلسات اليوم ده</b>المواعيد اللي اتحجزت لليوم ده بتظهر هنا لوحدها، والحالة اللي جت من غير ميعاد ضيفها من «+ جلسة من غير ميعاد».</div>`}
  ${ps.length?`<div class="panel"><h2>دفعات وخصومات اليوم ده</h2><div class="list">${ps.map(p=>`<button class="row" data-act="editPay" data-id="${p.id}"><span class="t">${esc(p.patientName)} ${p.kind==="discount"?`<span class="chip c-acc">خصم</span>`:""}</span><span class="end money">${money(p.amount)}</span><span class="m">${p.kind==="discount"?esc(p.reason||""):(METHODS[p.method]||"")}${p.kind!=="discount"&&p.note?" · "+esc(p.note):p.kind!=="discount"&&p.packId?" · على "+esc(packTitle((S.patients[p.patientId]?.packs||[]).find(k=>k.id===p.packId)||{name:"باكدج"})):""}</span><span></span></button>`).join("")}</div></div>`:""}`;
}
function sheetSession(id){
  const a=S.appts[id];if(!a)return;const v=S.visits[id];const p=S.patients[a.patientId];
  const prov=provisionalCredit(a);const useVisit=v&&(a.creditSet||!a.startBy);
  const d1=(useVisit?v.doctorId:prov.a)||apptDocs(a)[0]||"";const d2=useVisit?(v.doctor2Id||""):(prov.mode==="split"?prov.b:"");
  const comp=v&&!v.doctor2Id?(v.completion||"full"):"full";
  const docOpts=sel=>[...doctors().map(x=>[x.id,x.name]),["owner","د. محي"]].map(([k,n])=>`<option value="${k}" ${sel===k?"selected":""}>${esc(n)}</option>`).join("");
  const price=S.prices[v?.typeId||a.typeId];
  openSheet(`${a.patientName}`,`
  <div class="note">${esc(a.kindLabel||"")} · ميعاده ${esc(a.date)} ${esc(a.time||"")} ${lateChip(a)}${a.docNote?`<br>كومنت الدكتور: ${esc(a.docNote)}`:""}${a.media?.length?`<div class="photos" style="margin-top:8px">${mediaImgs(a.media)}</div>`:""}</div>
  <label class="f">الحالة<select id="s_status">${SESS_STATUS.map(([k,l])=>`<option value="${k}" ${a.status===k?"selected":""}>${l}</option>`).join("")}</select></label>
  <label class="f" id="s_cancelbox" hidden>سبب الإلغاء<select id="s_creason">${["المريض لغى","المركز لغى","اتأجل لميعاد تاني"].map(r=>`<option ${a.cancelReason===r?"selected":""}>${r}</option>`).join("")}</select></label>
  <div id="s_body" style="display:grid;gap:12px">
  <div class="grid2"><label class="f">وصل الساعة<input type="time" id="s_arr" value="${a.arrived||""}"></label><label class="f">دخل الساعة<input type="time" id="s_start" value="${a.start||""}"></label><label class="f">خلص الساعة<input type="time" id="s_end" value="${a.end||""}"></label></div>
  <div class="grid2"><label class="f">الدكتور اللي اشتغل<select id="s_doc1"><option value="">—</option>${docOpts(d1)}</select></label>
  <label class="f">اشتغلها<select id="s_comp"><option value="full" ${comp==="full"?"selected":""}>حالة كاملة</option><option value="half" ${comp==="half"?"selected":""}>نص حالة</option></select></label>
  <label class="f">دكتور تاني (نص ونص)<select id="s_doc2"><option value="">مفيش</option>${docOpts(d2)}</select></label></div>
  <div class="hr"></div>
  <label class="f">نوع الجلسة<select id="s_type">${typeOptions(v?.typeId||a.typeId)}</select></label>
  <input type="hidden" id="s_pat" value="${esc(p?pLabel(p):a.patientName)}">
  ${moneyFields("s",v||{price:price??"",paid:"",method:"cash"})}
  <p class="sub" style="margin:0">الفلوس تقدر تسجلها في أي وقت، قبل الجلسة أو بعدها، وتعدّلها لما يدفع الباقي.</p></div>
  <div class="err" id="formErr"></div>
  <button class="btn primary" data-act="saveSession" data-id="${id}">حفظ</button>`,
  ()=>{wireMoney("s","s_type");wirePack("s",v?{packId:v.packId}:(a.kind==="exam"?{packId:null}:null),"s_type");
    const st=document.getElementById("s_status");const sync=()=>{const x=st.value;document.getElementById("s_cancelbox").hidden=x!=="cancelled";document.getElementById("s_body").hidden=["noshow","cancelled"].includes(x)};
    st.addEventListener("change",()=>{const x=st.value,set=(i)=>{const el=document.getElementById(i);if(!el.value&&S.ui.date===today())el.value=nowHM()};
      if(["arrived","started","done"].includes(x))set("s_arr");if(["started","done"].includes(x))set("s_start");if(x==="done")set("s_end");sync()});
    document.getElementById("s_doc2").addEventListener("change",e=>{if(e.target.value)document.getElementById("s_comp").value="half"});sync()});
}
async function saveSession(id){
  const a=S.appts[id];if(!a)return;const old=S.visits[id];const status=val("s_status");
  const b=S.db.batch(),acc={};const ref=S.db.doc("appts/"+id);
  if(["noshow","cancelled"].includes(status)){
    b.update(ref,{status,cancelReason:status==="cancelled"?val("s_creason"):null});
    if(old){b.delete(S.db.doc("visits/"+id));visitEffect(acc,old,-1);flushPatients(b,acc)}
    await b.commit();if(old){delete S.live.visits[id];forget("visits",id)}closeSheet();toast(status==="cancelled"?"اتسجل إنه كنسل":"اتسجل إنه محضرش");return;
  }
  const doc1=val("s_doc1"),doc2=val("s_doc2")&&val("s_doc2")!==doc1?val("s_doc2"):"";
  const upd={status,arrivedT:val("s_arr")||null,startT:val("s_start")||null,endT:val("s_end")||null,cancelReason:null,doctors:[...new Set([...apptDocs(a),doc1,doc2].filter(Boolean))]};
  if(doc1&&!a.startBy)upd.startBy=doc1;
  const type=val("s_type");
  if(type){
    if(!doc1)return setErr("اختار الدكتور اللي اشتغل");
    const mny=readMoney("s");const me=moneyError(mny);if(me)return setErr(me);
    const vis={date:a.date,time:val("s_start")||a.time,patientId:a.patientId,patientName:a.patientName,doctorId:doc1,doctor2Id:doc2||null,completion:doc2?"half":val("s_comp"),typeId:type,typeName:typeName(type),...mny,apptId:id,by:S.mySid};
    addPackPay(b,acc,{id:a.patientId,name:a.patientName},vis,a.date);
    const lbl=a.kind==="exam"?null:sessionInfo(a.patientId,a.kind,id,a.date,a.time,type);if(lbl&&vis.packId!==(old?.packId||null)){const pk=(S.patients[a.patientId]?.packs||[]).find(k=>k.id===vis.packId);upd.kindLabel=pk?`جلسة ${Math.min((pk.used||0)+1,pk.sessions)} من ${pk.sessions} · ${packTitle(pk)}`:lbl.label;upd.packId=vis.packId||null}
    upd.typeId=type;upd.typeName=typeName(type);
    if(old)b.update(S.db.doc("visits/"+id),vis);else b.set(S.db.doc("visits/"+id),{...vis,createdAt:Date.now()});
    visitEffect(acc,old,-1);visitEffect(acc,vis,1);flushPatients(b,acc);
    if(a.media?.length&&!a.photosCopied){a.media.forEach((data,i)=>b.set(S.db.doc(`photos/a_${id}_${i}`),{patientId:a.patientId,data,at:Date.now(),from:"session",date:a.date,by:a.endBy||a.startBy||"",note:a.docNote||""}));upd.photosCopied=true}
    upd.visitId=id;upd.credit=doc2?{mode:"split",a:doc1,b:doc2}:{mode:"full",a:doc1};upd.creditSet=status==="done";
  }
  b.update(ref,upd);await b.commit();closeSheet();toast("اتحفظت");
}
async function quickArrive(id){await S.db.doc("appts/"+id).update({status:"arrived",arrivedT:S.ui.date===today()?nowHM():(S.appts[id]?.time||null)});toast("اتسجل وصوله")}
function sheetQuickCancel(id){const a=S.appts[id];if(!a)return;
  openSheet(`إلغاء ${a.patientName}`,`<p class="sub" style="margin:0">${esc(a.time||"")} · ${esc(a.kindLabel||"")}</p>
  <div style="display:grid;gap:8px">${["المريض لغى","المركز لغى","اتأجل لميعاد تاني","محضرش من غير ما يبلغ"].map(r=>`<button class="btn" data-act="doCancel" data-id="${id}" data-r="${r}">${r}</button>`).join("")}</div>`)}
async function doCancel(id,reason){const a=S.appts[id],old=S.visits[id];const noshow=reason==="محضرش من غير ما يبلغ";
  const b=S.db.batch(),acc={};b.update(S.db.doc("appts/"+id),{status:noshow?"noshow":"cancelled",cancelReason:noshow?null:reason});
  if(old){b.delete(S.db.doc("visits/"+id));visitEffect(acc,old,-1);flushPatients(b,acc)}
  await b.commit();if(old){delete S.live.visits[id];forget("visits",id)}closeSheet();toast(noshow?"اتسجل إنه محضرش":"اتلغى")}
function sheetWalkin(){
  openSheet("جلسة من غير ميعاد",`<label class="f">المريض${patientPicker("w_pat","")}</label>${newPatientFields("w")}
  <div class="seg"><label><input type="radio" name="w_kind" value="exam"> كشف</label><label><input type="radio" name="w_kind" value="session" checked> جلسة</label></div>
  <div class="grid2"><label class="f">الدكتور<select id="w_doc"><option value="">اختار الدكتور</option>${[...doctors().map(x=>[x.id,x.name]),["owner","د. محي"]].map(([k,n])=>`<option value="${k}">${esc(n)}</option>`).join("")}</select></label>
  <label class="f">نوع الجلسة<select id="w_type">${typeOptions("")}</select></label><label class="f">الساعة<input type="time" id="w_time" value="${S.ui.date===today()?nowHM():""}"></label></div>
  <div class="err" id="formErr"></div><button class="btn primary" data-act="saveWalkin">كمّل</button>`,()=>watchNewPatient("w","w_pat"));
}
async function saveWalkin(){
  const pv=val("w_pat").trim(),doc=val("w_doc"),time=val("w_time"),kind=radio("w_kind")||"session",date=S.ui.date;
  if(!pv)return setErr("اختار المريض");if(!doc)return setErr("اختار الدكتور");if(!time)return setErr("اكتب الساعة");
  const pat=await ensurePatient(pv,val("w_phone"),val("w_src"));const type=val("w_type");const info=sessionInfo(pat.id,kind,null,date,time,type);
  const ref=S.db.collection("appts").doc();
  const body={patientId:pat.id,patientName:pat.name,doctorSid:doc,doctors:[doc],kind,kindLabel:info.label,packId:info.packId||null,date,time,duration:60,typeId:type||null,typeName:type?typeName(type):"",note:"من غير ميعاد",walkin:true,status:"arrived",arrivedT:time,confirmed:false,createdAt:Date.now(),by:S.mySid};
  await ref.set(body);S.live.appts[ref.id]={id:ref.id,...body,arrived:time};merge();sheetSession(ref.id);
}
/* ---------- review ---------- */
function sheetReview(id,done){
  const e=S.log[id];if(!e)return;
  const pat=e.patientId&&S.patients[e.patientId]?pLabel(S.patients[e.patientId]):(findPatient(e.patientName)?pLabel(findPatient(e.patientName)):e.patientName);
  const price=S.prices[e.typeId];
  openSheet(done?"جلسة اتراجعت":"مراجعة جلسة",`
  <div class="note"><b>${esc(staffName(e.doctorSid))}</b> سجّل: ${esc(e.patientName)} · ${esc(e.typeName)} · ${e.completion==="half"?"نص حالة":"حالة كاملة"} · ${esc(e.date)} ${esc(e.time||"")}${e.note?`<br>الكومنت: ${esc(e.note)}`:""}${e.media?.length?`<div class="photos" style="margin-top:8px">${mediaImgs(e.media)}</div>`:""}</div>
  ${done?`<div class="note">${statusChip(e.status)} ${(e.review?.changes||[]).map(esc).join(" · ")}${e.review?.note?`<br>ردك: ${esc(e.review.note)}`:""}</div>${e.status!=="rejected"?`<button class="btn" data-act="editVisit" data-id="${id}">فتح الجلسة والفلوس</button>`:""}`:`
  <label class="f">الحالة${patientPicker("r_pat",pat)}</label>${newPatientFields("r")}
  <div class="grid2"><label class="f">التاريخ<input type="date" id="r_date" value="${e.date}"></label><label class="f">الساعة<input type="time" id="r_time" value="${e.time||""}"></label></div>
  <label class="f">نوع الجلسة<select id="r_type">${typeOptions(e.typeId)}</select></label>
  ${compSeg("r_comp",e.completion)}
  ${moneyFields("r",{price:price??"",paid:price??"",method:"cash"})}
  <label class="f">رد للدكتور (لازم لو هترفض)<textarea id="r_note"></textarea></label>
  <div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="approve" data-id="${id}">اعتماد</button><button class="btn danger" data-act="reject" data-id="${id}">رفض</button></div>`}`,
  done?null:()=>{watchNewPatient("r","r_pat");wireMoney("r","r_type");wirePack("r",null,"r_type")});
}
async function approveEntry(id,reject){
  const e=S.log[id];const ref=S.db.doc("log/"+id);const note=val("r_note").trim();
  if(reject){if(!note)return setErr("اكتب سبب الرفض عشان يوصل للدكتور");await ref.update({status:"rejected",review:{note,at:Date.now(),changes:[],by:S.mySid}});closeSheet();toast("اترفضت واتبعت للدكتور");return}
  const pv=val("r_pat").trim(),type=val("r_type");if(!pv)return setErr("اختار الحالة");if(!type)return setErr("اختار نوع الجلسة");
  const mny=readMoney("r");const me=moneyError(mny);if(me)return setErr(me);
  const pat=await ensurePatient(pv,val("r_phone"),val("r_src"));
  const comp=radio("r_comp")||"full",date=val("r_date")||e.date;
  const changes=[];
  if(pat.name!==e.patientName)changes.push(`اسم الحالة اتعدّل لـ «${pat.name}»`);
  if(type!==e.typeId)changes.push(`النوع اتعدّل لـ «${typeName(type)}»`);
  if(comp!==e.completion)changes.push(comp==="half"?"اتحسبت نص حالة":"اتحسبت حالة كاملة");
  if(date!==e.date)changes.push(`التاريخ اتعدّل لـ ${date}`);
  const v={date,time:val("r_time"),patientId:pat.id,patientName:pat.name,doctorId:e.doctorSid,typeId:type,typeName:typeName(type),...mny,completion:comp,logId:id,createdAt:Date.now(),by:S.mySid};
  const b=S.db.batch(),acc={};addPackPay(b,acc,pat,v,date);
  b.set(S.db.doc("visits/"+id),v);visitEffect(acc,v,1);flushPatients(b,acc);
  (e.media||[]).forEach((data,i)=>b.set(S.db.doc(`photos/${id}_${i}`),{patientId:pat.id,data,at:Date.now(),from:"session",date,by:e.doctorSid,note:e.note||""}));
  b.update(ref,{status:changes.length?"edited":"approved",patientId:pat.id,review:{note,at:Date.now(),changes,by:S.mySid}});
  await b.commit();
  closeSheet();toast(changes.length?"اتعتمدت بتعديل":"اتعتمدت");
}
/* ---------- visit ---------- */
async function sheetVisit(id){
  let v=id?S.visits[id]:{date:S.ui.date,time:nowHM(),method:"cash"};
  if(id&&!v){const d=await S.db.doc("visits/"+id).get();if(!d.exists)return toast("الجلسة دي مش موجودة");v={id,...d.data()};S.old.visits[id]=v;merge()}
  const docOpts=[...doctors().map(d=>[d.id,d.name]),["owner","د. محي"]];
  openSheet(id?"تعديل جلسة":"جلسة جديدة",`
  <label class="f">الحالة${patientPicker("v_pat",v.patientId&&S.patients[v.patientId]?pLabel(S.patients[v.patientId]):v.patientName)}</label>${newPatientFields("v")}
  <div class="grid2"><label class="f">الدكتور<select id="v_doc">${docOpts.map(([k,n])=>`<option value="${k}" ${v.doctorId===k?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
  <label class="f">دكتور تاني (لو اتقسمت نص ونص)<select id="v_doc2"><option value="">مفيش</option>${docOpts.map(([k,n])=>`<option value="${k}" ${v.doctor2Id===k?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
  <label class="f">نوع الجلسة<select id="v_type">${typeOptions(v.typeId)}</select></label>
  <label class="f">التاريخ<input type="date" id="v_date" value="${v.date}"></label><label class="f">الساعة<input type="time" id="v_time" value="${v.time||""}"></label></div>
  ${compSeg("v_comp",v.completion)}
  ${moneyFields("v",v)}
  ${v.logId&&id?`<p class="sub" style="margin:0">الجلسة دي جاية من تسجيل الدكتور.</p>`:""}
  <div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="saveVisit" data-id="${id||""}">حفظ</button>${id?`<button class="btn danger" data-act="delVisit" data-id="${id}" data-confirm>حذف</button>`:""}</div>`,
  ()=>{watchNewPatient("v","v_pat");wireMoney("v","v_type");wirePack("v",id?v:null,"v_type")});
}
async function saveVisit(id){
  const pv=val("v_pat").trim(),type=val("v_type");if(!pv)return setErr("اختار الحالة");if(!type)return setErr("اختار نوع الجلسة");
  const mny=readMoney("v");const me=moneyError(mny);if(me)return setErr(me);
  const pat=await ensurePatient(pv,val("v_phone"),val("v_src"));
  const d2=val("v_doc2")&&val("v_doc2")!==val("v_doc")?val("v_doc2"):null;
  const body={date:val("v_date")||today(),time:val("v_time"),patientId:pat.id,patientName:pat.name,doctorId:val("v_doc"),doctor2Id:d2,typeId:type,typeName:typeName(type),...mny,completion:d2?"half":(radio("v_comp")||"full")};
  const b=S.db.batch(),acc={};addPackPay(b,acc,pat,body,body.date);
  if(id){const old=S.visits[id];b.update(S.db.doc("visits/"+id),body);visitEffect(acc,old,-1);visitEffect(acc,body,1);if(S.old.visits[id])S.old.visits[id]={...old,...body}}
  else{b.set(S.db.collection("visits").doc(),{...body,createdAt:Date.now(),by:S.mySid});visitEffect(acc,body,1)}
  flushPatients(b,acc);await b.commit();merge();closeSheet();toast("اتحفظت");
}
async function delVisit(id){
  const v=S.visits[id];if(!v)return;const b=S.db.batch(),acc={};b.delete(S.db.doc("visits/"+id));visitEffect(acc,v,-1);flushPatients(b,acc);
  await b.commit();forget("visits",id);closeSheet();toast("اتمسحت");
}
/* ---------- payment ---------- */
async function sheetPay(id,patientId,packId){
  let p=id?S.payments[id]:{date:S.ui.date,method:"cash",patientId,packId:packId||null};
  if(id&&!p){const d=await S.db.doc("payments/"+id).get();if(!d.exists)return;p={id,...d.data()};S.old.payments[id]=p;merge()}
  if(p.kind==="discount")return openSheet("خصم على الحساب",`<div class="note">خصم <b>${money(p.amount)}</b> لـ ${esc(p.patientName)} يوم ${esc(p.date)}<br>السبب: ${esc(p.reason||"—")}<br>اتعمل بواسطة: ${esc(staffName(p.by))}</div><div class="err" id="formErr"></div><button class="btn danger" data-act="delPay" data-id="${id}" data-confirm>إلغاء الخصم</button>`);
  const cur=p.patientId&&S.patients[p.patientId]?pLabel(S.patients[p.patientId]):(p.patientName||"");
  openSheet(id?"تعديل دفعة":"دفعة منفصلة",`<p class="sub" style="margin:0">لتسديد اللي على الحالة أو قسط من باكدج. بيع الباكدج نفسه من ملف المريض. لو هترجع فلوس لحالة اكتب المبلغ بالسالب.</p>
  <label class="f">الحالة${patientPicker("p_pat",cur)}</label>
  <label class="f">الدفعة دي على<select id="p_pack"></select></label><div class="note" id="p_bal" hidden></div>
  <div class="grid2"><label class="f">المبلغ<input id="p_amt" inputmode="decimal" value="${p.amount??""}"></label><label class="f">طريقة الدفع<select id="p_method"><option value="cash">كاش</option><option value="instapay" ${p.method==="instapay"?"selected":""}>InstaPay</option></select></label><label class="f">التاريخ<input type="date" id="p_date" value="${p.date}"></label></div>
  <label class="f">ملاحظة<input id="p_note" value="${esc(p.note||"")}"></label>
  <div class="err" id="formErr"></div><div class="bar"><button class="btn primary grow" data-act="savePay" data-id="${id||""}">حفظ</button>${id?`<button class="btn danger" data-act="delPay" data-id="${id}" data-confirm>حذف</button>`:""}</div>`,
  ()=>{const pick=document.getElementById("p_pat"),sel=document.getElementById("p_pack"),bal=document.getElementById("p_bal");
    const draw=()=>{const pat=findPatient(pick.value);const packs=pat?(S.patients[pat.id]?.packs||[]):[];const want=sel.value||p.packId||"";
      sel.innerHTML=`<option value="">الحساب كله</option>`+packs.map(k=>{const o=packOwed(k);return `<option value="${k.id}" ${k.id===want?"selected":""}>${esc(packTitle(k))}${o>0?` · عليه ${money(o)}`:o===0?" · خالص":""}</option>`}).join("");
      bal.hidden=!pat;if(pat)bal.innerHTML=`الحساب كله: ${patBalChip(pat.id)}`};
    pick.addEventListener("input",draw);draw()});
}
async function savePay(id){
  const pat=findPatient(val("p_pat"));if(!pat)return setErr("اختار حالة موجودة من القائمة");const amount=num(val("p_amt"));if(!amount)return setErr("اكتب المبلغ");
  const packId=val("p_pack")||null;
  const body={patientId:pat.id,patientName:pat.name,amount,method:val("p_method"),date:val("p_date")||today(),note:val("p_note").trim(),packId};
  const b=S.db.batch(),acc={};
  if(id){const old=S.payments[id];b.update(S.db.doc("payments/"+id),body);if(old)pp(acc,old.patientId,{dp:-(old.amount||0),payPack:old.packId,payAmt:-(old.amount||0)});pp(acc,body.patientId,{dp:amount,payPack:packId,payAmt:amount});if(S.old.payments[id])S.old.payments[id]={...old,...body}}
  else{b.set(S.db.collection("payments").doc(),{...body,createdAt:Date.now(),by:S.mySid});pp(acc,body.patientId,{dp:amount,payPack:packId,payAmt:amount})}
  flushPatients(b,acc);await b.commit();merge();closeSheet();toast("اتحفظت الدفعة");
}
async function delPay(id){
  const p=S.payments[id];if(!p)return;const b=S.db.batch(),acc={};b.delete(S.db.doc("payments/"+id));
  if(p.kind==="discount")pp(acc,p.patientId,{dc:p.amount||0});else pp(acc,p.patientId,{dp:-(p.amount||0),payPack:p.packId,payAmt:-(p.amount||0)});
  flushPatients(b,acc);await b.commit();forget("payments",id);closeSheet();toast(p.kind==="discount"?"الخصم اتلغى":"اتمسحت");
}
/* ---------- packages & discounts on a patient ---------- */
function sheetSellPack(pid){
  const p=S.patients[pid];if(!p)return;const types=S.packTypes||[];
  const have=(p.packs||[]).filter(k=>(k.used||0)<k.sessions).map(k=>packTitle(k)+(k.typeId?` (${typeName(k.typeId)})`:"")).join("، ");
  openSheet(`باكدج لـ ${p.name}`,`
  ${have?`<div class="note">معاه دلوقتي: ${esc(have)}. ينفع يبقى معاه أكتر من باكدج في نفس الوقت، كل واحد لنوع.</div>`:""}
  <div class="seg"><label><input type="radio" name="k_mode" value="new" checked> باكدج جديد</label><label><input type="radio" name="k_mode" value="old"> باكدج شغال من قبل السيستم</label></div>
  <label class="f">نوع الجلسة<select id="k_cat">${typeOptions("")}</select></label>
  <label class="f">الباكدج<select id="k_type"></select></label>
  <div class="grid2"><label class="f">اسم الباكدج<input id="k_name"></label><label class="f">عدد الجلسات<input id="k_sessions" inputmode="numeric"></label><label class="f">التاريخ<input type="date" id="k_date" value="${today()}"></label>
  <label class="f" id="k_usedbox" hidden>اتعمل منه كام جلسة قبل كده<input id="k_used" inputmode="numeric" placeholder="0"></label></div>
  ${moneyFields("k",{price:"",paid:"",method:"cash"})}
  <p class="sub" id="k_oldnote" style="margin:0" hidden>في الباكدج القديم، «دفع كام» هو اللي دفعه قبل كده، ومش هيتحسب في دخل النهارده.</p>
  <div class="err" id="formErr"></div><button class="btn primary" data-act="saveSellPack" data-id="${pid}">سجّل الباكدج</button>`,
  ()=>{wireMoney("k");const t=document.getElementById("k_type"),cat=document.getElementById("k_cat");
    const fill=()=>{const list=types.filter(x=>!cat.value||x.typeId===cat.value||!x.typeId);t.innerHTML=`<option value="">باكدج مخصوص</option>`+list.map(x=>`<option value="${x.id}">${esc(x.name)} · ${x.sessions} جلسة · ${money(x.price)}</option>`).join("")};
    cat.addEventListener("change",fill);fill();
    document.querySelectorAll('input[name="k_mode"]').forEach(r=>r.addEventListener("change",()=>{const old=radio("k_mode")==="old";document.getElementById("k_usedbox").hidden=!old;document.getElementById("k_oldnote").hidden=!old}));
    t.addEventListener("change",()=>{const x=types.find(y=>y.id===t.value);if(!x)return;if(x.typeId&&!cat.value)cat.value=x.typeId;
    document.getElementById("k_name").value=x.name;document.getElementById("k_sessions").value=x.sessions;const pr=document.getElementById("k_price");pr.value=x.price;
    const pd=document.getElementById("k_paid");if(!pd.value)pd.value=x.price;pr.dispatchEvent(new Event("input"))})});
}
async function saveSellPack(pid){
  const p=S.patients[pid];const name=val("k_name").trim(),sessions=Math.round(num(val("k_sessions"))),date=val("k_date")||today();
  const typeId=val("k_cat"),old=radio("k_mode")==="old",used=old?Math.round(num(val("k_used"))):0;
  if(!typeId)return setErr("اختار نوع الجلسة (علاج طبيعي، تيكار…)");if(!name)return setErr("اكتب اسم الباكدج");if(sessions<1)return setErr("اكتب عدد الجلسات");if(used>sessions)return setErr("الجلسات اللي اتعملت أكتر من عدد الباكدج");
  const m=readMoney("k");const me=moneyError(m);if(me)return setErr(me);if(!m.price)return setErr("اكتب سعر الباكدج");
  const pack={id:randId(),name,typeId,typeName:typeName(typeId),sessions,listPrice:m.price,saleDiscount:m.discount,discount:m.discount,price:m.net,paid:m.paid,reason:m.discountReason,date,used,preUsed:used,old,by:S.mySid,discHist:[]};
  const b=S.db.batch();
  if(m.paid&&!old)b.set(S.db.collection("payments").doc(),{patientId:pid,patientName:p.name,amount:m.paid,method:m.method,date,packId:pack.id,note:packTitle(pack),createdAt:Date.now(),by:S.mySid});
  b.update(S.db.doc("patients/"+pid),{packs:[...(p.packs||[]),pack],charged:inc(m.net),paid:inc(m.paid)});
  await b.commit();toast("الباكدج اتسجل");reopenPatient(pid);
}
async function delPack(pid,kid){
  const p=S.patients[pid];const k=(p.packs||[]).find(x=>x.id===kid);if(!k||(k.used||0)>(k.preUsed||0)||k.paid)return;
  await S.db.doc("patients/"+pid).update({packs:p.packs.filter(x=>x.id!==kid),charged:inc(-(k.price||0))});toast("الباكدج اتشال. لو كان اتدفع، المبلغ بقى رصيد للحالة.");reopenPatient(pid);
}
function sheetDiscount(pid){
  const p=S.patients[pid];if(!p)return;const packs=p.packs||[];
  openSheet(`خصم لـ ${p.name}`,`
  <label class="f">الخصم على<select id="d_target"><option value="">الحساب كله</option>${packs.map(k=>`<option value="${k.id}">${esc(packTitle(k))} (دلوقتي ${money(k.price)})</option>`).join("")}</select></label>
  <div class="grid2"><label class="f">الخصم<input id="d_val" inputmode="decimal"></label><label class="f">نوعه<select id="d_mode"><option value="amount">مبلغ</option><option value="final">سعر الباكدج بعد الخصم</option></select></label></div>
  <label class="f">السبب (لازم)<input id="d_reason" placeholder="مثلاً عرض، أو تعويض عن جلسة اتلغت"></label>
  <div class="note" id="d_sum">اكتب قيمة الخصم.</div><div class="err" id="formErr"></div>
  <button class="btn primary" data-act="saveDiscount" data-id="${pid}">سجّل الخصم</button>`,
  ()=>{const tg=document.getElementById("d_target"),md=document.getElementById("d_mode"),vl=document.getElementById("d_val"),sm=document.getElementById("d_sum");
    const upd=()=>{const k=packs.find(x=>x.id===tg.value);md.querySelector('[value="final"]').disabled=!k;if(!k&&md.value==="final")md.value="amount";
      const d=discountDelta(k,md.value,num(vl.value));sm.innerHTML=d>0?`هيتخصم <b>${money(d)}</b>${k?` والباكدج يبقى بـ <b>${money(k.price-d)}</b>`:" من اللي على الحالة"}`:"اكتب قيمة الخصم."};
    [tg,md].forEach(x=>x.addEventListener("change",upd));vl.addEventListener("input",upd);upd()});
}
function discountDelta(k,mode,x){if(!x)return 0;if(k)return mode==="final"?Math.max(0,(k.price||0)-x):Math.min(k.price||0,x);return x}
async function saveDiscount(pid){
  const p=S.patients[pid];const kid=val("d_target"),k=(p.packs||[]).find(x=>x.id===kid);const reason=val("d_reason").trim();
  const d=discountDelta(k,val("d_mode"),num(val("d_val")));if(d<=0)return setErr("اكتب قيمة الخصم");if(!reason)return setErr("اكتب سبب الخصم");
  if(k){const packs=p.packs.map(x=>x.id===kid?{...x,price:(x.price||0)-d,discount:(x.discount||0)+d,discHist:[...(x.discHist||[]),{amount:d,reason,date:today(),by:S.mySid,at:Date.now()}]}:x);
    await S.db.doc("patients/"+pid).update({packs,charged:inc(-d)});}
  else{const b=S.db.batch();b.set(S.db.collection("payments").doc(),{kind:"discount",patientId:pid,patientName:p.name,amount:d,method:"",date:today(),reason,note:reason,by:S.mySid,createdAt:Date.now()});
    b.update(S.db.doc("patients/"+pid),{charged:inc(-d)});await b.commit();}
  toast("الخصم اتسجل");reopenPatient(pid);
}
/* ---------- quick add & paste list (old patients) ---------- */
let quickCount=0;
function sheetQuick(){
  quickCount=0;
  openSheet("إضافة سريعة لمريض",`<p class="sub" style="margin:0">للمرضى القدام. التاريخ اختياري، والرصيد القديم للي عليه أو ليه فلوس من قبل السيستم.</p>
  <div class="grid2"><label class="f">الاسم<input id="q_name"></label><label class="f">الموبايل<input id="q_phone" inputmode="tel"></label>
  <label class="f">عرف المركز منين<select id="q_src">${sourceOptions("")}</select></label><label class="f">تاريخ أول كشف (لو معروف)<input type="date" id="q_date"></label>
  <label class="f">رصيد قديم<input id="q_bal" inputmode="decimal" placeholder="0"></label><label class="f">الرصيد ده<select id="q_baltype"><option value="owe">عليه</option><option value="credit">ليه</option></select></label></div>
  <div class="err" id="formErr"></div><div class="bar"><button class="btn primary grow" data-act="saveQuick">حفظ وضيف التاني</button><button class="btn" data-act="close">خلصت</button></div><p class="sub" id="q_count" style="margin:0"></p>`);
}
function phoneTaken(phone){phone=nd(phone).replace(/\D/g,"");return phone?Object.values(S.patients).find(p=>nd(p.phone||"").replace(/\D/g,"")===phone):null}
function newPatientDoc(name,phone,source,date,opening){return{name,phone:nd(phone||"").trim(),source:source||"",examDate:date||"",imported:true,createdAt:Date.now(),charged:opening>0?opening:0,paid:opening<0?-opening:0,count:0,opening:opening||0}}
async function saveQuick(){
  const name=val("q_name").trim(),phone=val("q_phone").trim();if(!name)return setErr("اكتب الاسم");
  const dup=phoneTaken(phone);if(dup)return setErr(`الموبايل ده متسجل لـ ${dup.name}`);
  const bal=num(val("q_bal"));const opening=val("q_baltype")==="credit"?-bal:bal;
  const ref=S.db.collection("patients").doc();const b=S.db.batch();
  b.set(ref,newPatientDoc(name,phone,val("q_src"),val("q_date"),opening));b.set(S.db.doc("pdir/"+ref.id),{name});await b.commit();
  S.patients[ref.id]={id:ref.id,...newPatientDoc(name,phone,val("q_src"),val("q_date"),opening)};
  quickCount++;["q_name","q_phone","q_bal","q_date"].forEach(i=>document.getElementById(i).value="");setErr("");
  document.getElementById("q_count").textContent=`اتضاف ${quickCount} لحد دلوقتي.`;document.getElementById("q_name").focus();
}
function sheetPaste(){
  openSheet("لصق قايمة مرضى",`<p class="sub" style="margin:0">كل سطر مريض: الاسم وبعده الموبايل. ينفع تنسخهم من Excel أو من الواتساب أو من ورقة مكتوبة على الموبايل.</p>
  <textarea id="pl_text" style="min-height:200px" placeholder="أحمد سامي 01012345678
منى علي - 01198765432
كريم حسن"></textarea><div class="note" id="pl_sum">الصق القايمة فوق.</div><div class="err" id="formErr"></div>
  <button class="btn primary" data-act="savePaste">ضيف القايمة</button>`,
  ()=>{const t=document.getElementById("pl_text");t.addEventListener("input",()=>{const r=parseList(t.value);document.getElementById("pl_sum").textContent=r.rows.length?`هيتضاف ${r.rows.length} مريض${r.dups?`، و${r.dups} متكررين هيتشالوا`:""}.`:"الصق القايمة فوق."})});
}
function parseList(text){
  const rows=[];let dups=0;const seen=new Set();
  for(let line of text.split(/\r?\n/)){line=nd(line).replace(/[‎‏]/g,"").trim();if(!line)continue;
    const m=line.match(/(\+?\d[\d\s]{7,}\d)/);const phone=m?m[1].replace(/\s/g,""):"";
    const name=(m?line.replace(m[1]," "):line).replace(/[,،\t\-–|:]+/g," ").replace(/\s+/g," ").trim();if(!name)continue;
    const key=phone||name;if(seen.has(key)||(phone&&phoneTaken(phone))||(!phone&&Object.values(S.patients).some(p=>p.name===name))){dups++;continue}
    seen.add(key);rows.push({name,phone})}
  return{rows,dups};
}
async function savePaste(){
  const {rows,dups}=parseList(val("pl_text"));if(!rows.length)return setErr("مفيش أسماء جديدة في القايمة");
  for(let i=0;i<rows.length;i+=200){const b=S.db.batch();rows.slice(i,i+200).forEach(r=>{const ref=S.db.collection("patients").doc();b.set(ref,newPatientDoc(r.name,r.phone,"","",0));b.set(S.db.doc("pdir/"+ref.id),{name:r.name})});await b.commit()}
  closeSheet();toast(`اتضاف ${rows.length} مريض${dups?`، واتشال ${dups} متكرر`:""}`);
}
/* ---------- patient file ---------- */
function reopenPatient(pid){const cur=document.querySelector(".sheet");setTimeout(()=>{if(cur&&cur.isConnected)sheetPatient(pid)},300)} // only if that same sheet is still open
function packTitle(k){return /باكدج|باقة/.test(k.name||"")?k.name:`باكدج ${k.name}`}
function packsHtml(pid){
  const packs=S.patients[pid]?.packs||[];if(!packs.length)return "";
  return `<div class="list">${packs.map(k=>{const left=k.sessions-(k.used||0);const o=packOwed(k);return `<div class="row stack" style="cursor:default"><span class="t">${esc(packTitle(k))} ${k.typeId?`<span class="chip c-acc">${esc(typeName(k.typeId)||k.typeName||"")}</span>`:""} ${left>0?`<span class="chip c-teal">فاضل ${left} من ${k.sessions}</span>`:`<span class="chip c-mute">خلص</span>`} ${packMoneyChip(k)}</span>
    <span class="end bar">${o>0?`<button class="btn sm teal" data-act="payPack" data-id="${pid}" data-k="${k.id}">+ دفعة</button>`:""}${(k.used||0)===(k.preUsed||0)&&!k.paid?`<button class="btn sm danger" data-act="delPack" data-id="${pid}" data-k="${k.id}" data-confirm>شيل</button>`:""}</span>
    <span class="m">${[k.date||"",`السعر ${k.discount?`${money(k.listPrice)} ← `:""}${money(k.price)}`,k.paid!=null?`دفع ${money(k.paid)}`:"",k.old?`من قبل السيستم (كان عمل ${k.preUsed||0})`:"",k.discount?`خصم ${money(k.discount)}: ${[k.reason,...(k.discHist||[]).map(h=>h.reason)].filter(Boolean).join("، ")}`:""].filter(Boolean).map(esc).join(" · ")}</span><span></span></div>`}).join("")}</div>`;
}
function sheetPatient(id){
  const p=id?S.patients[id]:{examDate:today()};if(!p)return;
  const b=balances()[id];
  const docOpts=[["owner","د. محي"],...doctors().map(d=>[d.id,d.name])];
  const F=(k,l,t="input",extra="")=>t==="ta"?`<label class="f">${l}<textarea id="pt_${k}">${esc(p[k]||"")}</textarea></label>`:`<label class="f">${l}<input id="pt_${k}" value="${esc(p[k]||"")}" ${extra}></label>`;
  openSheet(id?p.name:"ملف مريض جديد",`
  ${id?`<div class="bar">${balChip(b)}<span class="sub grow">${b?`${b.count} جلسة · إجمالي ${money(b.charged)} · دفع ${money(b.paid)}`:""}</span></div>
  <div class="bar"><button class="btn sm" data-act="payFor" data-id="${id}">+ دفعة</button><button class="btn sm" data-act="sellPack" data-id="${id}">+ باكدج</button><button class="btn sm" data-act="discount" data-id="${id}">خصم</button></div>
  ${p.opening?`<div class="note">رصيد قديم من قبل السيستم: ${p.opening>0?`عليه ${money(p.opening)}`:`ليه ${money(-p.opening)}`}</div>`:""}
  ${packsHtml(id)}`:""}
  <div class="grid2">${F("name","الاسم")}${F("phone","الموبايل","input",'inputmode="tel"')}${F("age","السن","input",'inputmode="numeric"')}
  <label class="f">النوع<select id="pt_gender"><option value="">—</option><option ${p.gender==="ذكر"?"selected":""}>ذكر</option><option ${p.gender==="أنثى"?"selected":""}>أنثى</option></select></label>
  <label class="f">عرف المركز منين<select id="pt_source">${sourceOptions(p.source)}</select></label>${F("sourceDetail","تفاصيل المصدر (اسم اللي رشّح…)")}
  <label class="f">تاريخ الكشف<input type="date" id="pt_examDate" value="${p.examDate||""}"></label>
  <label class="f">الدكتور اللي كشف<select id="pt_examDoctor"><option value="">—</option>${docOpts.map(([k,n])=>`<option value="${k}" ${p.examDoctor===k?"selected":""}>${esc(n)}</option>`).join("")}</select></label></div>
  <div class="hr"></div><h3 style="font-size:15px">شيت الكشف</h3>
  ${F("complaint","الشكوى الأساسية","ta")}${F("history","التاريخ المرضي والعمليات والأدوية","ta")}${F("findings","الفحص (ROM، القوة، الألم من 10، الاختبارات الخاصة)","ta")}${F("diagnosis","التشخيص")}${F("plan","خطة العلاج وعدد الجلسات","ta")}${F("notes","ملاحظات","ta")}
  <div class="hr"></div><div class="sec-title"><h3 style="font-size:15px">صور الكشف والجلسات</h3>${id?`<label class="btn sm">رفع صورة<input type="file" id="pt_file" accept="image/*" hidden></label>`:""}</div>
  ${id?`<div class="photos" id="pt_photos"><span class="sub">بيحمّل الصور…</span></div>`:`<span class="sub">احفظ الملف الأول، وبعدها تقدر ترفع صورة الورقة.</span>`}
  <div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="savePatient" data-id="${id||""}">حفظ الملف</button>${id&&!b?`<button class="btn danger" data-act="delPatient" data-id="${id}" data-confirm>حذف</button>`:""}</div>
  ${id?`<div id="pt_hist"></div>`:""}`,
  ()=>{if(!id)return;const f=document.getElementById("pt_file");if(f)f.addEventListener("change",()=>uploadSheet(id,f));loadPhotos(id);loadHistory(id)});
}
async function loadHistory(id){
  const el=document.getElementById("pt_hist");if(!el)return;
  try{
    const [v,p]=await Promise.all([S.db.collection("visits").where("patientId","==",id).get(),S.db.collection("payments").where("patientId","==",id).get()]);
    const vs=v.docs.map(rowOf),ps=p.docs.map(rowOf);vs.forEach(x=>{if(!S.visits[x.id])S.old.visits[x.id]=x});ps.forEach(x=>{if(!S.payments[x.id])S.old.payments[x.id]=x});merge();
    const hist=[...vs.map(x=>({d:x.date,t:"v",x})),...ps.map(x=>({d:x.date,t:"p",x}))].sort((a,c)=>(c.d||"").localeCompare(a.d||""));
    el.innerHTML=hist.length?`<div class="hr"></div><h3 style="font-size:15px;margin-bottom:8px">الجلسات والدفعات</h3><div class="list">${hist.map(h=>h.t==="v"?`<button class="row" data-act="editVisit" data-id="${h.x.id}"><span class="t">${esc(h.x.typeName)} ${h.x.completion==="half"?`<span class="chip c-warn">نص</span>`:""}</span><span class="end money">${h.x.packId?`<span class="chip c-teal">باكدج</span>`:money(h.x.net)}</span><span class="m">${esc(h.x.date)} · ${esc(staffName(h.x.doctorId))}</span><span class="end m">${h.x.packId?esc(h.x.packName||""):`دفع ${money(h.x.paid)} ${METHODS[h.x.method]||""}`}${h.x.discount?` · خصم ${money(h.x.discount)}`:""}</span></button>`:`<button class="row" data-act="editPay" data-id="${h.x.id}"><span class="t">${h.x.kind==="discount"?`<span class="chip c-acc">خصم</span> ${esc(h.x.reason||"")}`:`دفعة ${h.x.note?"· "+esc(h.x.note):""}`}</span><span class="end money">${money(h.x.amount)}</span><span class="m">${esc(h.x.date)} · ${METHODS[h.x.method]||""}</span><span></span></button>`).join("")}</div>`:"";
  }catch(e){el.innerHTML=`<p class="sub">سجل الجلسات مش متاح دلوقتي.</p>`}
}
async function loadPhotos(id){
  const el=document.getElementById("pt_photos");if(!el)return;
  try{const s=await S.db.collection("photos").where("patientId","==",id).get();
    const docs=s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>/^data:image\/(jpeg|png|webp);base64,/.test(x.data||"")).sort((a,b)=>(a.at||0)-(b.at||0));
    el.innerHTML=docs.length?docs.map(ph=>`<img src="${ph.data}" alt="ورقة الكشف" data-act="zoom">`).join(""):`<span class="sub">مفيش صور لسه. صوّر الورقة عشان لو ضاعت.</span>`;
  }catch(e){el.innerHTML=`<span class="sub">الصور مش متاحة دلوقتي.</span>`}
}
function loadImg(file){return new Promise((res,rej)=>{const u=URL.createObjectURL(file);const i=new Image();i.onload=()=>{URL.revokeObjectURL(u);res(i)};i.onerror=()=>{URL.revokeObjectURL(u);rej(new Error("img"))};i.src=u})}
async function compressImage(file,limit=850000,startMax=1600){ // keeps photos under Firestore's 1 MB document limit
  const img=await loadImg(file);let max=startMax;
  for(let round=0;round<4;round++){
    const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
    const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
    for(const q of [0.72,0.6,0.5,0.4]){const u=c.toDataURL("image/jpeg",q);if(u.length<limit)return u}
    max=Math.round(max*0.75);
  }
  throw new Error("too big");
}
async function uploadSheet(id,input){
  const file=input.files[0];if(!file)return;setErr("بيجهّز الصورة…");
  try{const data=await compressImage(file);await S.db.collection("photos").doc().set({patientId:id,data,at:Date.now()});setErr("");toast("الصورة اترفعت");loadPhotos(id)}
  catch(e){console.error(e);setErr("الصورة مترفعتش. جرب تصوّرها تاني.")}
  input.value="";
}
async function savePatient(id){
  const keys=["name","phone","age","gender","source","sourceDetail","examDate","examDoctor","complaint","history","findings","diagnosis","plan","notes"];
  const body={};keys.forEach(k=>body[k]=(val("pt_"+k)||"").trim());body.phone=nd(body.phone);body.age=nd(body.age);
  if(!body.name)return setErr("اكتب اسم المريض");
  const b=S.db.batch();
  if(id)b.update(S.db.doc("patients/"+id),body);else{const ref=S.db.collection("patients").doc();b.set(ref,{...body,createdAt:Date.now(),charged:0,paid:0,count:0});id=ref.id}
  if(S.pdir[id]?.name!==body.name)b.set(S.db.doc("pdir/"+id),{name:body.name});
  await b.commit();toast("اتحفظ الملف");reopenPatient(id);
}
async function delPatient(id){
  const ph=await S.db.collection("photos").where("patientId","==",id).get();
  const b=S.db.batch();ph.docs.forEach(d=>b.delete(d.ref));b.delete(S.db.doc("patients/"+id));b.delete(S.db.doc("pdir/"+id));await b.commit();closeSheet();toast("الملف اتمسح");
}
/* ---------- attendance ---------- */
function sheetAtt(sid){
  const d=S.ui.attDate,r=S.att[d+"_"+sid]||{};
  openSheet(`${staffName(sid)} · ${dayLabel(d)}`,`<div class="grid2"><label class="f">حضور<input type="time" id="a_in" value="${r.in||""}"></label><label class="f">انصراف<input type="time" id="a_out" value="${r.out||""}"></label></div>
  <div class="bar"><button class="btn sm" data-act="nowIn">الحضور = دلوقتي</button><button class="btn sm" data-act="nowOut">الانصراف = دلوقتي</button></div>
  <label class="f">ملاحظة<input id="a_note" value="${esc(r.note||"")}"></label><div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="saveAtt" data-sid="${sid}">حفظ</button>${r.date?`<button class="btn danger" data-act="delAtt" data-sid="${sid}" data-confirm>مسح اليوم</button>`:""}</div>`);
}
/* ---------- location check for self check-in ---------- */
function distM(a,b){const R=6371000,t=x=>x*Math.PI/180;const dLat=t(b.lat-a.lat),dLng=t(b.lng-a.lng);
  const h=Math.sin(dLat/2)**2+Math.cos(t(a.lat))*Math.cos(t(b.lat))*Math.sin(dLng/2)**2;return Math.round(2*R*Math.asin(Math.sqrt(h)))}
function getPos(){return new Promise((res,rej)=>{if(!navigator.geolocation)return rej({code:"nogeo"});
  navigator.geolocation.getCurrentPosition(p=>res({lat:p.coords.latitude,lng:p.coords.longitude,acc:Math.round(p.coords.accuracy||0)}),e=>rej(e),{enableHighAccuracy:true,timeout:20000,maximumAge:0})})}
function geoError(e){return e?.code===1?"لازم تسمح للتطبيق يعرف مكانك. من إعدادات الموبايل: Privacy ← Location ← Safari (أو Chrome) ← While Using، وبعدين جرّب تاني.":e?.code==="nogeo"?"الموبايل ده مش بيدعم تحديد المكان.":"مقدرناش نحدد مكانك. اتأكد إن الـ Location شغال وجرّب تاني جوه المركز."}
/* owner alerts go through ntfy (free push app); the topic name lives in the staff-only settings, not in the code */
function alertOwner(title,message,priority=4){
  const topic=S.notify?.topic;if(!topic||S.notify.on===false)return;
  fetch("https://ntfy.sh/",{method:"POST",body:JSON.stringify({topic,title,message,priority,tags:["warning"]})}).catch(()=>{});
}
async function checkPlace(kind){ // returns location info, or throws a readable message when outside the clinic
  const g=S.geo;if(!g||!g.lat||g.required===false)return null;
  const what=kind==="in"?"حضور":"انصراف",who=staffName(S.mySid),at=nowHM();
  let p;try{p=await getPos()}catch(e){
    if(e?.code===1)alertOwner(`${who}: رفض يدّي مكانه`,`${who} حاول يسجل ${what} الساعة ${at} ورفض يسمح للتطبيق يعرف مكانه.`);
    throw new Error(geoError(e))}
  const d=distM(g,p),radius=g.radius||150;
  if(d-Math.min(p.acc,100)>radius){
    alertOwner(`${who}: ${what} من بعيد`,`${who} حاول يسجل ${what} الساعة ${at} وهو على بعد ${d>=1000?(d/1000).toFixed(1)+" كم":d+" متر"} من المركز. الحضور ماتسجلش.`);
    throw new Error(`انت بعيد عن المركز حوالي ${d} متر. الحضور والانصراف بيتسجلوا من جوه المركز بس.`)}
  return{d,acc:p.acc};
}
async function selfAtt(kind){
  const sid=S.mySid,d=today(),ref=S.db.doc(`att/${d}_${sid}`);const TS=firebase.firestore.FieldValue.serverTimestamp();
  const msg=document.getElementById("geoMsg");if(msg){msg.textContent="بيحدد مكانك…";msg.style.color=""}
  let loc;try{loc=await checkPlace(kind)}catch(e){if(msg){msg.textContent=e.message;msg.style.color="var(--bad)"}return}
  if(msg)msg.textContent="";
  const base=kind==="in"?{date:d,staffId:sid,inAt:TS,in:"",out:"",note:"",by:sid}:{out:nowHM(),outAt:TS};
  const extra=loc?(kind==="in"?{inLoc:loc}:{outLoc:loc}):{};
  const write=o=>kind==="in"?ref.set(o):ref.update(o);
  try{await write({...base,...extra})}
  catch(e){if(e?.code==="permission-denied"&&loc)await write(base);else throw e} // older security rules don't know the distance fields yet
  toast(kind==="in"?"اتسجل حضورك":"اتسجل انصرافك");
}
/* ---------- expenses ---------- */
function sheetExp(id){
  const x=id?S.expenses[id]:{date:today()};if(!x)return;
  openSheet(id?"تعديل مصروف":"مصروف جديد",`<div class="grid2"><label class="f">البند<select id="x_cat">${EXP_CATS.map(c=>`<option ${c===x.category?"selected":""}>${c}</option>`).join("")}</select></label><label class="f">المبلغ<input id="x_amt" inputmode="decimal" value="${x.amount??""}"></label><label class="f">التاريخ<input type="date" id="x_date" value="${x.date}"></label></div>
  <label class="f">ملاحظة<input id="x_note" value="${esc(x.note||"")}"></label><div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="saveExp" data-id="${id||""}">حفظ</button>${id?`<button class="btn danger" data-act="delExp" data-id="${id}" data-confirm>حذف</button>`:""}</div>`);
}
function sheetPackType(id){
  const t=id?(S.packTypes||[]).find(x=>x.id===id):{};
  openSheet(id?"تعديل باكدج":"باكدج جديد",`<label class="f">نوع الجلسة<select id="pk_type">${typeOptions(t?.typeId)}</select></label>
  <label class="f">الاسم<input id="pk_name" value="${esc(t?.name||"")}" placeholder="مثلاً علاج طبيعي 10 جلسات"></label>
  <div class="grid2"><label class="f">عدد الجلسات<input id="pk_sessions" inputmode="numeric" value="${t?.sessions??""}"></label><label class="f">السعر<input id="pk_price" inputmode="decimal" value="${t?.price??""}"></label></div>
  <p class="sub" style="margin:0">تغيير السعر هنا بيأثر على الباكدجات الجديدة بس، مش على اللي اتباعت قبل كده.</p>
  <div class="err" id="formErr"></div><div class="bar"><button class="btn primary grow" data-act="savePackType" data-id="${id||""}">حفظ</button>${id?`<button class="btn danger" data-act="delPackType" data-id="${id}" data-confirm>حذف</button>`:""}</div>`);
}
async function savePackType(id){
  const name=val("pk_name").trim(),sessions=Math.round(num(val("pk_sessions"))),price=num(val("pk_price")),typeId=val("pk_type");
  if(!typeId)return setErr("اختار نوع الجلسة اللي الباكدج ده تبعه");if(!name)return setErr("اكتب اسم الباكدج");if(sessions<1)return setErr("اكتب عدد الجلسات");if(!price)return setErr("اكتب السعر");
  const list=id?(S.packTypes||[]).map(x=>x.id===id?{...x,name,sessions,price,typeId}:x):[...(S.packTypes||[]),{id:"k"+Date.now().toString(36),name,sessions,price,typeId}];
  await S.db.doc("cfg/prices").set({packs:list},{merge:true});closeSheet();toast("اتحفظ");
}
/* ---------- staff & accounts ---------- */
let secApp=null;
async function secAuth(){if(!secApp){secApp=firebase.initializeApp(CFG,"secondary");await secApp.auth().setPersistence(firebase.auth.Auth.Persistence.NONE)}return secApp.auth()}
function sheetStaff(id){
  const s=id?S.staff[id]:{role:"doctor"};const owner=S.role==="owner";
  openSheet(id?"تعديل":"إضافة للفريق",`<label class="f">الاسم<input id="s_name" value="${esc(s.name||"")}"></label>
  ${owner?`<div class="seg"><label><input type="radio" name="s_role" value="doctor" ${s.role!=="secretary"?"checked":""}> دكتور</label><label><input type="radio" name="s_role" value="secretary" ${s.role==="secretary"?"checked":""}> استقبال / سكرتارية</label></div>`:""}
  ${id?"":`<label class="f">اسم المستخدم (بالإنجليزي، للدخول)<input id="s_user" autocapitalize="none" spellcheck="false" placeholder="مثلاً ahmed"></label>`}
  ${id?`<div class="seg"><label><input type="radio" name="s_act" value="1" ${s.active!==false?"checked":""}> شغال</label><label><input type="radio" name="s_act" value="0" ${s.active===false?"checked":""}> متوقف (مايقدرش يدخل)</label></div>`:""}
  <div class="err" id="formErr"></div><button class="btn primary" data-act="saveStaff" data-id="${id||""}">حفظ</button>`);
}
async function saveStaff(id){
  const name=val("s_name").trim();if(!name)return setErr("اكتب الاسم");
  const role=S.role==="owner"?(radio("s_role")||"doctor"):(id?S.staff[id]?.role:"doctor")||"doctor";
  if(id){
    const s=S.staff[id];const active=radio("s_act")!=="0";const b=S.db.batch();
    b.update(S.db.doc("staff/"+id),{name,role,active});
    if(s.uid&&S.users[s.uid]&&S.users[s.uid].staffId===id)b.update(S.db.doc("users/"+s.uid),{active,role});
    await b.commit();closeSheet();toast("اتحفظ");return;
  }
  const user=normUser(val("s_user"));
  if(!USER_RE.test(user))return setErr("اسم المستخدم من 3 لـ 30 حرف إنجليزي أو أرقام، من غير مسافات");
  if((await S.db.doc("usernames/"+user).get()).exists)return setErr("اسم المستخدم ده مستخدم قبل كده");
  const ref=S.db.collection("staff").doc();
  await ref.set({name,role,active:true,order:Object.keys(S.staff).length+1,uid:null});
  S.staff[ref.id]={id:ref.id,name,role,active:true,uid:null};
  await createLogin(ref.id,user);
}
function sheetLogin(sid){
  const s=S.staff[sid];const cur=s.uid?S.usernames[s.uid]:"";
  openSheet(cur?"باسورد جديد":"حساب دخول",`<p style="margin:0">${cur?`هيتعمل باسورد مؤقت جديد لـ <b>${esc(s.name)}</b>، والباسورد القديم هيبطل يشتغل.`:`حساب دخول لـ <b>${esc(s.name)}</b>.`}</p>
  <label class="f">اسم المستخدم<input id="lg_user" value="${esc(cur||"")}" autocapitalize="none" spellcheck="false" placeholder="بالإنجليزي، مثلاً salma"></label>
  <div class="err" id="formErr"></div><button class="btn primary" data-act="saveLogin" data-id="${sid}">${cur?"اعمل باسورد جديد":"اعمل الحساب"}</button>`);
}
async function createLogin(sid,username){
  const s=S.staff[sid];if(!s)return;
  if(!USER_RE.test(username))return setErr("اسم المستخدم من 3 لـ 30 حرف إنجليزي أو أرقام، من غير مسافات");
  const ex=await S.db.doc("usernames/"+username).get();
  if(ex.exists&&ex.data().uid!==s.uid)return setErr("اسم المستخدم ده مستخدم قبل كده");
  const email=`${sid.toLowerCase().replace(/[^a-z0-9]/g,"")||"u"}.${randId()}@${DOMAIN}`,pw=randPw();
  const sa=await secAuth();const cred=await sa.createUserWithEmailAndPassword(email,pw);const uid=cred.user.uid;await sa.signOut();
  const b=S.db.batch();
  b.set(S.db.doc("users/"+uid),{staffId:sid,role:s.role,active:true,mustChange:true,email});
  if(s.uid&&S.users[s.uid])b.update(S.db.doc("users/"+s.uid),{active:false});
  const oldName=s.uid?S.usernames[s.uid]:"";if(oldName&&oldName!==username)b.delete(S.db.doc("usernames/"+oldName));
  b.set(S.db.doc("usernames/"+username),{uid,email});
  b.update(S.db.doc("staff/"+sid),{uid});
  await b.commit();
  showTempPw(s.name,username,pw);
}
function showTempPw(name,user,pw){
  openSheet("بيانات الدخول",`<p style="margin:0">ادي البيانات دي لـ <b>${esc(name)}</b>. أول ما يدخل هيطلب منه يختار باسورد خاص بيه.</p>
  <div class="stats"><div class="stat"><div class="k">اسم المستخدم</div><div class="v" style="direction:ltr;text-align:right">${esc(user)}</div></div><div class="stat"><div class="k">باسورد مؤقت</div><div class="v num">${esc(pw)}</div></div></div>
  <p class="sub" style="margin:0">الباسورد ده مش هيظهر تاني بعد ما تقفل الصفحة دي.</p><button class="btn primary" data-act="close">تمام</button>`);
}
function sheetType(id){
  const t=id?S.types.find(x=>x.id===id):{};
  openSheet(id?"تعديل نوع جلسة":"نوع جلسة جديد",`<label class="f">الاسم (الدكاترة بيشوفوه)<input id="t_name" value="${esc(t?.name||"")}" placeholder="مثلاً علاج طبيعي، تيكار، ليمفيديما"></label>${S.role==="owner"?`<div class="seg"><label><input type="checkbox" id="t_sep" ${t?.sep?"checked":""}> فلوسه حساب منفصل (مش من إيراد المركز)</label></div>`:""}<p class="sub" style="margin:0">من غير سعر. السعر بيتحدد في الباكدج، أو بيتكتب يدوي لو جلسة منفردة.</p><div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="saveType" data-id="${id||""}">حفظ</button>${id?`<button class="btn danger" data-act="delType" data-id="${id}" data-confirm>حذف</button>`:""}</div>`);
}
/* ---------- backup (owner) ---------- */
async function backup(){
  const msg=document.getElementById("bkMsg");msg.textContent="بيجمع البيانات…";
  const cols=["staff","patients","visits","payments","att","exp","log","pdir"];const out={exportedAt:new Date().toISOString()};
  for(const c of cols){const s=await S.db.collection(c).get();out[c]=s.docs.map(d=>({id:d.id,...d.data()}))}
  for(const d of ["pub/types","cfg/prices","priv/config"]){const s=await S.db.doc(d).get();out[d]=s.exists?s.data():null}
  const blob=new Blob([JSON.stringify(out)],{type:"application/json"});const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`stride-clinic-backup-${today()}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
  msg.textContent="اتنزّل. صور الكشف مش جوا الملف ده.";
}
/* ---------- events ---------- */
document.addEventListener("submit",e=>{
  if(e.target.id==="loginForm"){e.preventDefault();doLogin().catch(err=>{console.error(err);document.getElementById("loginErr").textContent="حصلت مشكلة، جرب تاني."})}
  if(e.target.id==="setupForm"){e.preventDefault();doSetup()}
});
document.addEventListener("input",e=>{if(e.target.id==="q"){S.ui.q=e.target.value;renderPatientList()}});
document.addEventListener("change",e=>{
  const id=e.target.id;
  if(id==="dayPick"&&e.target.value){S.ui.date=e.target.value;e.target.blur();render()}
  if(id==="attPick"&&e.target.value){S.ui.attDate=e.target.value;e.target.blur();render()}
  if(id==="repPick"&&e.target.value){S.ui.repDay=e.target.value;e.target.blur();render()}
  if(id==="monthPick"&&e.target.value){S.ui.month=e.target.value;e.target.blur();render()}
  if(e.target.dataset.act==="srcScope"){S.ui.srcAll=e.target.value==="all";e.target.blur();render()}
});
const OWNER_ACTS=new Set(["setGeo","toggleGeo","saveCfg","backup","setupAlerts","toggleAlerts","testAlert","setBackfill","stopBackfill"]);
const ATT_ACTS=new Set(["editAtt","saveAtt","delAtt"]);
const ADMIN_ACTS=new Set(["quickArrive","quickCancel","doCancel","openSession","saveSession","newWalkin","saveWalkin","newAppt","editAppt","saveAppt","apptConfirm","saveApptConfirm","apptArrive","apptFinish","apptNoShow","apptCancel","sellPack","saveSellPack","delPack","discount","saveDiscount","quickAdd","saveQuick","pasteList","savePaste","newPackType","editPackType","savePackType","delPackType","newVisit","editVisit","saveVisit","delVisit","newPay","payFor","payPack","editPay","savePay","delPay","review","reviewDone","approve","reject","newPatient","openPatient","savePatient","delPatient","newExp","editExp","saveExp","delExp","newStaff","editStaff","saveStaff","makeLogin","saveLogin","newType","editType","saveType","delType"]);
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-act]");if(!t)return;const a=t.dataset.act,id=t.dataset.id;
  if(a==="bgClose"){if(e.target===t)closeSheet();return}
  if(a==="srcScope")return;
  if(ADMIN_ACTS.has(a)&&!isAdmin())return;
  if(OWNER_ACTS.has(a)&&S.role!=="owner")return;
  if(ATT_ACTS.has(a)&&S.role!=="owner"&&!(S.role==="secretary"&&inBackfill(S.ui.attDate))){toast("اليوم ده بره فترة الصلاحية المؤقتة");return}
  if((a==="saveCfg"||a==="backup")&&S.role!=="owner")return;
  if(t.hasAttribute("data-confirm")&&!t.dataset.armed){t.dataset.armed="1";t.dataset.label=t.textContent;t.textContent="متأكد؟ اضغط تاني";setTimeout(()=>{if(t.isConnected){delete t.dataset.armed;t.textContent=t.dataset.label}},4000);return}
  const db=S.db;
  switch(a){
    case "tab":S.tab=t.dataset.k;render();window.scrollTo(0,0);break;
    case "close":closeSheet();break;
    case "logout":S.auth.signOut();break;
    case "forgotPw":forgotPw();break;
    case "openSession":sheetSession(id);break;
    case "quickArrive":guard(t,()=>quickArrive(id));break;
    case "quickCancel":sheetQuickCancel(id);break;
    case "doCancel":guard(t,()=>doCancel(id,t.dataset.r));break;
    case "saveSession":guard(t,()=>saveSession(id));break;
    case "newWalkin":sheetWalkin();break;
    case "saveWalkin":guard(t,saveWalkin);break;
    case "setBackfill":guard(t,async()=>{const from=val("bf_from"),to=val("bf_to");if(!from||!to||from>to)return toast("اختار فترة صح");
      const until=new Date(Date.now()+num(val("bf_days"))*864e5);await db.doc("pub/backfill").set({on:true,from,to,until,by:S.mySid,at:Date.now()});toast("الصلاحية اتفعّلت")});break;
    case "stopBackfill":guard(t,async()=>{await db.doc("pub/backfill").set({on:false,at:Date.now()});toast("الصلاحية اتقفلت")});break;
    case "setupAlerts":if(S.role==="owner")guard(t,async()=>{await db.doc("pub/notify").set({topic:"stride-"+randId()+randId(),on:true,at:Date.now()});toast("الإشعارات اتفعّلت. كمّل الخطوات اللي ظهرت.")});break;
    case "toggleAlerts":if(S.role==="owner")guard(t,async()=>{await db.doc("pub/notify").update({on:S.notify?.on===false})});break;
    case "testAlert":if(S.role==="owner"){const n=S.notify;if(n?.topic)fetch("https://ntfy.sh/",{method:"POST",body:JSON.stringify({topic:n.topic,title:"Stride Clinic",message:"الإشعارات شغالة. هيوصلك تنبيه هنا لو حد سجل حضور من بره المركز.",priority:3})}).then(r=>toast(r.ok?"اتبعت. بص على موبايلك.":"مااتبعتش، جرب تاني.")).catch(()=>toast("مااتبعتش. اتأكد من النت."))}break;
    case "copyTopic":{const tp=S.notify?.topic||"";navigator.clipboard?.writeText(tp).then(()=>toast("اتنسخ")).catch(()=>{const el=document.getElementById("ntfyTopic");const r=document.createRange();r.selectNodeContents(el);const sel=getSelection();sel.removeAllRanges();sel.addRange(r)})}break;
    case "newAppt":sheetAppt(null);break;
    case "editAppt":sheetAppt(id);break;
    case "saveAppt":guard(t,()=>saveAppt(id));break;
    case "apptConfirm":sheetApptConfirm(id);break;
    case "saveApptConfirm":guard(t,()=>saveApptConfirm(id));break;
    case "apptArrive":guard(t,()=>apptArrive(id));break;
    case "apptFinish":guard(t,()=>apptFinishByDesk(id));break;
    case "saveApptEnd":guard(t,()=>saveApptEnd(id));break;
    case "repDay":S.ui.repDay=addDays(S.ui.repDay||today(),Number(t.dataset.n));render();break;
    case "apptNoShow":guard(t,async()=>{await db.doc("appts/"+id).update({status:"noshow"});closeSheet();toast("اتسجل إنه محضرش")});break;
    case "apptCancel":guard(t,async()=>{await db.doc("appts/"+id).update({status:"cancelled"});closeSheet();toast("الميعاد اتلغى")});break;
    case "apptStart":guard(t,()=>apptStart(id));break;
    case "apptEnd":apptEnd(id);break;
    case "forceUpdate":(async()=>{try{const rs=await navigator.serviceWorker?.getRegistrations?.()||[];await Promise.all(rs.map(r=>r.unregister()));const ks=await caches?.keys?.()||[];await Promise.all(ks.map(k=>caches.delete(k)))}catch(e){}location.reload()})();break;
    case "rmMedia":entryMedia.splice(Number(t.dataset.i),1);drawEntryMedia(false);break;
    case "setGeo":guard(t,async()=>{const m=document.getElementById("geoSetMsg");m.style.color="";m.textContent="بيحدد المكان…";
      let p;try{p=await getPos()}catch(e){m.style.color="var(--bad)";m.textContent=geoError(e);return}
      if(p.acc>60){m.textContent=`الدقة ${p.acc} متر بس، وده ضعيف. لو تقدر قف جنب شباك وجرّب تاني. اتسجل على كل حال.`}else m.textContent="";
      await db.doc("pub/geo").set({lat:p.lat,lng:p.lng,radius:Math.max(50,num(val("geo_r"))||150),required:true,acc:p.acc,at:Date.now(),by:S.mySid});toast("مكان المركز اتسجل")});break;
    case "toggleGeo":guard(t,async()=>{await db.doc("pub/geo").update({required:S.geo?.required===false,radius:Math.max(50,num(val("geo_r"))||150)});});break;
    case "myAccount":sheetAccount(false);break;
    case "saveAccount":guard(t,()=>saveAccount(!!t.dataset.forced));break;
    case "day":S.ui.date=addDays(S.ui.date,Number(t.dataset.n));render();break;
    case "attDay":S.ui.attDate=addDays(S.ui.attDate,Number(t.dataset.n));render();break;
    case "newVisit":sheetVisit(null);break;
    case "editVisit":sheetVisit(id);break;
    case "saveVisit":guard(t,()=>saveVisit(id));break;
    case "delVisit":guard(t,()=>delVisit(id));break;
    case "newPay":sheetPay(null);break;
    case "payFor":sheetPay(null,id);break;
    case "payPack":sheetPay(null,id,t.dataset.k);break;
    case "editPay":sheetPay(id);break;
    case "savePay":guard(t,()=>savePay(id));break;
    case "delPay":guard(t,()=>delPay(id));break;
    case "review":sheetReview(id,false);break;
    case "reviewDone":sheetReview(id,true);break;
    case "approve":guard(t,()=>approveEntry(id,false));break;
    case "reject":guard(t,()=>approveEntry(id,true));break;
    case "newPatient":sheetPatient(null);break;
    case "openPatient":sheetPatient(id);break;
    case "savePatient":guard(t,()=>savePatient(id));break;
    case "delPatient":guard(t,()=>delPatient(id));break;
    case "zoom":t.classList.toggle("big");break;
    case "editAtt":sheetAtt(t.dataset.sid);break;
    case "nowIn":document.getElementById("a_in").value=nowHM();break;
    case "nowOut":document.getElementById("a_out").value=nowHM();break;
    case "saveAtt":guard(t,async()=>{const sid=t.dataset.sid,d=S.ui.attDate;const i=val("a_in"),o=val("a_out");if(!i&&!o)return setErr("سجّل الحضور أو الانصراف");if(i&&o&&mins(o)<=mins(i))return setErr("الانصراف لازم يكون بعد الحضور");const body={date:d,staffId:sid,in:i,out:o,note:val("a_note").trim(),by:S.mySid};await db.doc(`att/${d}_${sid}`).set(body);if(d<winStart()){S.old.att[`${d}_${sid}`]={id:`${d}_${sid}`,...body};merge()}closeSheet();toast("اتسجل")});break;
    case "delAtt":guard(t,async()=>{const k=`${S.ui.attDate}_${t.dataset.sid}`;await db.doc("att/"+k).delete();forget("att",k);closeSheet()});break;
    case "selfIn":guard(t,()=>selfAtt("in"));break;
    case "selfOut":guard(t,()=>selfAtt("out"));break;
    case "newExp":sheetExp(null);break;
    case "editExp":sheetExp(id);break;
    case "saveExp":guard(t,async()=>{const amount=num(val("x_amt"));if(!amount)return setErr("اكتب المبلغ");const body={category:val("x_cat"),amount,date:val("x_date")||today(),note:val("x_note").trim()};if(id){await db.doc("exp/"+id).update(body);if(S.old.exp[id]){S.old.exp[id]={...S.old.exp[id],...body};merge()}}else await db.collection("exp").doc().set({...body,createdAt:Date.now(),by:S.mySid});closeSheet();toast("اتحفظ")});break;
    case "delExp":guard(t,async()=>{await db.doc("exp/"+id).delete();forget("exp",id);closeSheet()});break;
    case "newStaff":sheetStaff(null);break;
    case "editStaff":sheetStaff(id);break;
    case "saveStaff":guard(t,()=>saveStaff(id));break;
    case "makeLogin":sheetLogin(id);break;
    case "saveLogin":guard(t,()=>createLogin(id,normUser(val("lg_user"))));break;
    case "sellPack":sheetSellPack(id);break;
    case "saveSellPack":guard(t,()=>saveSellPack(id));break;
    case "delPack":guard(t,()=>delPack(id,t.dataset.k));break;
    case "discount":sheetDiscount(id);break;
    case "saveDiscount":guard(t,()=>saveDiscount(id));break;
    case "quickAdd":sheetQuick();break;
    case "saveQuick":guard(t,saveQuick);break;
    case "pasteList":sheetPaste();break;
    case "savePaste":guard(t,savePaste);break;
    case "newPackType":sheetPackType(null);break;
    case "editPackType":sheetPackType(id);break;
    case "savePackType":guard(t,()=>savePackType(id));break;
    case "delPackType":guard(t,async()=>{await db.doc("cfg/prices").set({packs:(S.packTypes||[]).filter(x=>x.id!==id)},{merge:true});closeSheet()});break;
    case "newType":sheetType(null);break;
    case "editType":sheetType(id);break;
    case "saveType":guard(t,async()=>{const name=val("t_name").trim();if(!name)return setErr("اكتب اسم الجلسة");const tid=id||("t"+Date.now().toString(36));const sepEl=document.getElementById("t_sep");const sep=sepEl?sepEl.checked:!!S.types.find(x=>x.id===id)?.sep;const list=id?S.types.map(x=>x.id===id?{...x,name,sep}:x):[...S.types,{id:tid,name,sep}];await db.doc("pub/types").set({list});closeSheet();toast("اتحفظ")});break;
    case "delType":guard(t,async()=>{await db.doc("pub/types").set({list:S.types.filter(x=>x.id!==id)});closeSheet()});break;
    case "saveCfg":guard(t,async()=>{const salary={},commission={};activeStaff().forEach(s=>{const v=val("sal_"+s.id).trim();if(v)salary[s.id]=num(v);const f=val("cf_"+s.id).trim(),h=val("ch_"+s.id).trim();if(f||h)commission[s.id]={full:num(f),half:num(h)}});await db.doc("priv/config").set({salary,commission,hoursBase:num(val("cfgHours"))||7,daysBase:num(val("cfgDays"))||30,otMult:num(val("cfgOt"))||1.5});toast("المرتبات اتحفظت")});break;
    case "backup":backup().catch(err=>{console.error(err);const m=document.getElementById("bkMsg");if(m)m.textContent="النسخة مكملتش. جرب تاني."});break;
    case "newEntry":sheetEntry(null);break;
    case "myEntry":sheetEntry(S.log[id]);break;
    case "saveEntry":guard(t,()=>saveEntry(id));break;
    case "delEntry":guard(t,async()=>{const en=S.log[id];if(en&&en.doctorSid===S.mySid&&en.status==="pending"){await db.doc("log/"+id).delete();closeSheet()}});break;
  }
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&document.querySelector(".sheet"))closeSheet()});
if("serviceWorker" in navigator&&location.protocol==="https:")window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
setInterval(()=>{if(["appts","myappts"].includes(S.tab)&&Object.values(S.appts).some(a=>a.status==="started"))sched()},60000); // keeps "in session for N min" fresh
boot();
