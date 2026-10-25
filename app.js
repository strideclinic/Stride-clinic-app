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
/* ---------- state ---------- */
const S={db:null,auth:null,uid:null,profile:null,role:null,mySid:null,settingUp:false,setupDone:null,
  staff:{},types:[],prices:{},pdir:{},patients:{},log:{},config:null,users:{},usernames:{},myUsername:"",
  live:{visits:{},payments:{},att:{},exp:{}},old:{visits:{},payments:{},att:{},exp:{}},loadedMonths:{},
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
function clearSubs(){S.roleSubs.forEach(u=>{try{u()}catch(e){}});S.roleSubs=[];
  Object.assign(S,{staff:{},types:[],prices:{},pdir:{},patients:{},log:{},config:null,users:{},usernames:{},myUsername:"",loadedMonths:{},
    live:{visits:{},payments:{},att:{},exp:{}},old:{visits:{},payments:{},att:{},exp:{}}});merge()}
function rowOf(d){const x={id:d.id,...d.data({serverTimestamps:"estimate"})};if(x.inAt)x.in=fmtTs(x.inAt);if(x.outAt)x.out=fmtTs(x.outAt);return x}
function toObj(snap){const o={};snap.docs.forEach(d=>o[d.id]=rowOf(d));return o}
function sub(q,set){return q.onSnapshot(snap=>{set(toObj(snap));sched()},e=>console.warn("sub",e))}
function subDoc(path,set){return S.db.doc(path).onSnapshot(d=>{set(d.exists?d.data():null);sched()},e=>console.warn(path,e))}
function merge(){S.visits={...S.old.visits,...S.live.visits};S.payments={...S.old.payments,...S.live.payments};S.att={...S.old.att,...S.live.att};S.expenses={...S.old.exp,...S.live.exp}}
function setLive(k){return o=>{S.live[k]=o;merge()}}
function setupRoleSubs(){
  clearSubs();const r=S.roleSubs,db=S.db,c=n=>db.collection(n);
  r.push(sub(c("staff"),o=>S.staff=o));
  r.push(subDoc("pub/types",d=>S.types=d?.list||[]));
  r.push(sub(c("pdir"),o=>S.pdir=o));
  r.push(c("usernames").where("uid","==",S.uid).onSnapshot(s=>{S.myUsername=s.docs[0]?.id||"";sched()},()=>{}));
  if(isAdmin()){
    r.push(sub(c("log"),o=>{S.log=o;pruneLog()}));
    r.push(sub(c("att").where("date",">=",winStart()),setLive("att")));
    r.push(sub(c("visits").where("date",">=",winStart()),setLive("visits")));
    r.push(sub(c("payments").where("date",">=",winStart()),setLive("payments")));
    r.push(sub(c("exp").where("date",">=",winStart()),setLive("exp")));
    r.push(subDoc("cfg/prices",d=>S.prices=d?.p||{}));
    r.push(sub(c("patients"),o=>S.patients=o));
    r.push(sub(c("users"),o=>S.users=o));
    r.push(c("usernames").onSnapshot(s=>{const m={};s.docs.forEach(d=>m[d.data().uid]=d.id);S.usernames=m;sched()},()=>{}));
  }else{
    r.push(sub(c("log").where("doctorSid","==",S.mySid),o=>S.log=o));
    r.push(sub(c("att").where("staffId","==",S.mySid),setLive("att")));
  }
  if(S.role==="owner")r.push(subDoc("priv/config",d=>S.config=d||{}));
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
  try{const [v,p,t,x]=await Promise.all([c("visits"),c("payments"),c("att"),c("exp")]);
    Object.assign(S.old.visits,toObj(v));Object.assign(S.old.payments,toObj(p));Object.assign(S.old.att,toObj(t));Object.assign(S.old.exp,toObj(x));
    S.loadedMonths[m]=true;merge();sched()}catch(e){console.warn(e);S.loadedMonths[m]=false}
}
function forget(col,id){delete S.old[col]?.[id];merge()}
function defaultTab(){return {owner:"visits",secretary:"visits",doctor:"mine"}[S.role]}
/* ---------- tabs & render ---------- */
function tabsFor(){
  if(S.role==="doctor"){return [["mine","جلساتي",myFresh()],["myatt","حضوري"]]}
  const pend=pendingEntries().length;
  const base=[["visits","الجلسات والفلوس"],["review","مراجعة الدكاترة",pend],["patients","المرضى والكشف"],["att","الحضور"]];
  if(S.role==="owner")return [...base,["reports","الحسابات والمرتبات"],["settings","الإعدادات"]];
  return [...base,["reports","الإيراد والمصروفات"],["settings","الإعدادات"]];
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
  const fn={visits:vVisits,review:vReview,patients:vPatients,att:vAtt,reports:vReports,settings:vSettings,mine:vMine,myatt:vMyAtt}[S.tab];
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
  }catch(e){console.error(e);S.settingUp=false;err.textContent=e.code==="permission-denied"?"السيستم ده متعمله إعداد قبل كده. ادخل بالحساب الموجود.":e.code==="auth/operation-not-allowed"?"لازم تفعّل Email/Password في Authentication الأول (الخطوة 2 في الدليل).":"حصلت مشكلة: "+(e.code||e.message)}
}
function vLogin(){
  return `<form class="panel login" id="loginForm" autocomplete="on"><img src="icons/logo.png" alt="Stride Clinic" style="height:72px;width:auto;justify-self:center"><h2>تسجيل الدخول</h2>
  <label class="f">اسم المستخدم<input id="l_user" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
  <label class="f">الباسورد<input id="l_pw" type="password" autocomplete="current-password"></label>
  <div class="err" id="loginErr"></div><button class="btn primary" type="submit">دخول</button>
  <p class="sub" style="margin:0">نسيت الباسورد؟ د. محي يقدر يعملك باسورد جديد من الإعدادات.</p></form>`;
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
  <div class="err" id="formErr"></div><button class="btn primary" data-act="saveAccount" data-forced="${forced?1:""}">حفظ</button>`);
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
function payroll(month){
  const c=cfg();const base=c.hoursBase*60;
  return activeStaff().map(s=>{
    const sal=num(c.salary[s.id]);const minRate=sal/(c.daysBase*c.hoursBase*60);
    let ot=0,days=0,short=0;
    for(const r of Object.values(S.att))if(r.staffId===s.id&&(r.date||"").startsWith(month)){const w=attMinutes(r);if(w==null)continue;days++;if(w>base)ot+=w-base;else short+=base-w}
    const otPay=ot*c.otMult*minRate;
    const cm=c.commission[s.id];let comm=0,full=0,half=0,base2=0;
    if(cm)for(const v of Object.values(S.visits))if(v.doctorId===s.id&&(v.date||"").startsWith(month)){const pct=v.completion==="half"?num(cm.half):num(cm.full);comm+=(v.paid||0)*pct/100;base2+=v.paid||0;v.completion==="half"?half++:full++}
    return{s,sal,ot,otPay,days,short,cm,comm,full,half,commBase:base2,total:sal+otPay+comm};
  });
}
function revenue(month){
  let cash=0,insta=0,charged=0,visitPaid=0,sessions=0;
  for(const v of Object.values(S.visits))if((v.date||"").startsWith(month)){sessions++;charged+=v.net||0;visitPaid+=v.paid||0;v.method==="instapay"?insta+=v.paid||0:cash+=v.paid||0}
  for(const p of Object.values(S.payments))if((p.date||"").startsWith(month)){p.method==="instapay"?insta+=p.amount||0:cash+=p.amount||0}
  return{cash,insta,collected:cash+insta,charged,sessions,unpaid:Math.max(0,charged-visitPaid)};
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
  ps.forEach(p=>{p.method==="instapay"?insta+=p.amount||0:cash+=p.amount||0});
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
      <span class="end money">${money(v.net)}</span>
      <span class="m">${esc(v.time||"")} · ${esc(staffName(v.doctorId))} · ${esc(v.typeName||"")}</span>
      <span class="end m">${v.paid?`دفع ${money(v.paid)} ${METHODS[v.method]||""}`:""} ${rem>0?`<span class="chip c-bad">باقي ${money(rem)}</span>`:""}</span>
    </button>`}).join("")}</div>`:`<div class="empty"><b>مفيش جلسات متسجلة اليوم ده</b>الجلسات بتنزل هنا لما تعتمد اللي الدكاترة سجلوه، أو اضغط «+ جلسة» تسجلها مباشرة.</div>`}
  ${ps.length?`<div class="panel"><h2>دفعات منفصلة اليوم ده</h2><div class="list">${ps.map(p=>`<button class="row" data-act="editPay" data-id="${p.id}"><span class="t">${esc(p.patientName)}</span><span class="end money">${money(p.amount)}</span><span class="m">${METHODS[p.method]||""}${p.note?" · "+esc(p.note):""}</span><span></span></button>`).join("")}</div></div>`:""}`;
}
/* ---------- views: review ---------- */
function vReview(){
  const pend=pendingEntries();const done=reviewedEntries().slice(0,25);
  const card=(e,act)=>`<button class="row" data-act="${act}" data-id="${e.id}">
    <span class="t">${esc(e.patientName)} ${e.completion==="half"?`<span class="chip c-warn">نص حالة</span>`:""}</span>
    <span class="end">${statusChip(e.status)}</span>
    <span class="m">${esc(staffName(e.doctorSid))} · ${esc(e.typeName||"")} · ${esc(e.date)} ${esc(e.time||"")}</span>
    <span class="end m">${e.note?"فيه كومنت":""}</span></button>`;
  return `
  <div class="sec-title"><h2>مستني المراجعة</h2><span class="sub">اعتمد أو عدّل أو ارفض، والدكتور هيشوف النتيجة عنده</span></div>
  ${pend.length?`<div class="list">${pend.map(e=>card(e,"review")).join("")}</div>`:`<div class="empty"><b>مفيش حاجة مستنية مراجعة</b>لما دكتور يسجل جلسة من حسابه هتظهر هنا.</div>`}
  ${done.length?`<div class="sec-title"><h2>اتراجع مؤخراً</h2></div><div class="list">${done.map(e=>card(e,"reviewDone")).join("")}</div>`:""}`;
}
function statusChip(s){return {pending:`<span class="chip c-warn">مستني المراجعة</span>`,approved:`<span class="chip c-ok">اتعتمد</span>`,edited:`<span class="chip c-teal">اتعتمد بتعديل</span>`,rejected:`<span class="chip c-bad">اترفض</span>`}[s]||""}
/* ---------- views: patients ---------- */
function vPatients(){
  return `<div class="bar"><input id="q" class="grow" placeholder="دوّر بالاسم أو الموبايل" value="${esc(S.ui.q)}" aria-label="بحث"><button class="btn primary" data-act="newPatient">+ مريض جديد</button></div><div id="plist"></div>`;
}
function renderPatientList(){
  const el=document.getElementById("plist");if(!el)return;
  const q=nd(S.ui.q).trim();const b=balances();
  let ps=patientsSorted();if(q)ps=ps.filter(p=>(p.name||"").includes(q)||nd(p.phone||"").includes(q));
  const owe=Object.values(b).reduce((s,x)=>s+Math.max(0,x.charged-x.paid),0);
  const shown=ps.slice(0,200);
  el.innerHTML=(Object.keys(S.patients).length?`<div class="stats" style="margin-bottom:12px"><div class="stat"><div class="k">عدد الملفات</div><div class="v num">${Object.keys(S.patients).length}</div></div><div class="stat"><div class="k">إجمالي اللي على الحالات</div><div class="v money">${money(owe)}</div></div></div>`:"")+
  (shown.length?`<div class="list">${shown.map(p=>`<button class="row" data-act="openPatient" data-id="${p.id}"><span class="t">${esc(p.name)}</span><span class="end">${balChip(b[p.id])}</span><span class="m">${esc(p.phone||"بدون موبايل")}${p.diagnosis?" · "+esc(p.diagnosis):""}</span><span class="end m">${b[p.id]?b[p.id].count+" جلسة":""}</span></button>`).join("")}</div>${ps.length>shown.length?`<p class="sub">بيظهر أول 200. اكتب في البحث عشان توصل للباقي.</p>`:""}`
  :`<div class="empty"><b>${q?"مفيش مريض بالاسم ده":"لسه مفيش ملفات مرضى"}</b>${q?"جرب جزء من الاسم أو رقم الموبايل.":"اضغط «+ مريض جديد» واملا شيت الكشف، وصوّر الورقة كمان عشان لو ضاعت."}</div>`);
}
/* ---------- views: attendance (admin) ---------- */
function vAtt(){
  const d=S.ui.attDate,m=d.slice(0,7);ensureMonth(m);const base=cfg().hoursBase*60;
  const st=activeStaff();
  const rows=st.map(s=>{const r=S.att[d+"_"+s.id];const w=r?attMinutes(r):null;const ot=w!=null&&w>base?w-base:0;
    return `<button class="row" data-act="editAtt" data-sid="${s.id}"><span class="t">${esc(s.name)} <span class="chip c-mute">${ROLE_NAMES[s.role]||""}</span></span>
    <span class="end">${attChip(r,w,ot,base)}</span>
    <span class="m">${r?`حضور ${esc(r.in||"—")} · انصراف ${esc(r.out||"—")}${w!=null?" · "+hm(w):""}${r.inAt?" · سجّلها بنفسه":""}`:"اضغط عشان تسجل الحضور والانصراف"}</span><span></span></button>`}).join("");
  const sum=st.map(s=>{let days=0,ot=0,short=0;for(const r of Object.values(S.att))if(r.staffId===s.id&&(r.date||"").startsWith(m)){const w=attMinutes(r);if(w==null)continue;days++;w>base?ot+=w-base:short+=base-w}return `<tr><td>${esc(s.name)}</td><td class="num">${days}</td><td>${hm(ot)}</td><td>${hm(short)}</td></tr>`}).join("");
  return `<div class="bar">${dayNav("attDay","attPick",d)}<span class="sub grow">${esc(dayLabel(d))}</span></div>
  ${st.length?`<div class="list">${rows}</div>`:`<div class="empty"><b>مفيش فريق متسجل</b>ضيف الدكاترة والسكرتارية من الإعدادات.</div>`}
  <div class="panel"><h2>ملخص ${esc(monthLabel(m))}</h2><p class="sub" style="margin:0">اليوم الأساسي ${cfg().hoursBase} ساعات؛ أي دقيقة زيادة بتتحسب بدقيقة ونص في المرتب.</p>
  <div class="tblwrap"><table><thead><tr><th>الاسم</th><th>أيام متسجلة</th><th>أوفر تايم</th><th>ساعات ناقصة</th></tr></thead><tbody>${sum}</tbody></table></div></div>`;
}
function attChip(r,w,ot,base){if(!r)return `<span class="chip c-mute">غايب / مش متسجل</span>`;if(ot)return `<span class="chip c-acc">أوفر تايم ${hm(ot)}</span>`;if(w!=null&&w<base)return `<span class="chip c-warn">ناقص ${hm(base-w)}</span>`;return `<span class="chip c-ok">${w!=null?"تمام":"لسه مقفلش"}</span>`}
/* ---------- views: my attendance (doctor) ---------- */
function vMyAtt(){
  const sid=S.mySid,d=today(),m=d.slice(0,7),base=7*60;const r=S.att[d+"_"+sid];
  const recs=Object.values(S.att).filter(x=>x.staffId===sid&&(x.date||"").startsWith(m)).sort((a,b)=>b.date.localeCompare(a.date));
  let ot=0,days=0;recs.forEach(x=>{const w=attMinutes(x);if(w!=null){days++;if(w>base)ot+=w-base}});
  return `<div class="panel"><h2>النهارده · ${esc(dayLabel(d))}</h2>
  <div class="stats"><div class="stat"><div class="k">حضور</div><div class="v num">${esc(r?.in||"—")}</div></div><div class="stat"><div class="k">انصراف</div><div class="v num">${esc(r?.out||"—")}</div></div></div>
  <div class="bar">${r?"":`<button class="btn primary grow" data-act="selfIn">سجّل حضوري دلوقتي</button>`}${r&&r.in&&!r.out?`<button class="btn teal grow" data-act="selfOut">سجّل انصرافي دلوقتي</button>`:""}</div>
  <p class="sub" style="margin:0">الوقت بيتسجل من ساعة السيرفر، مش من ساعة الموبايل.${r?.in&&r?.out?" اليوم اتقفل، ولو فيه غلط قول لريهام تعدّله.":""}</p></div>
  <div class="stats"><div class="stat"><div class="k">أيام حضور ${esc(monthLabel(m))}</div><div class="v num">${days}</div></div><div class="stat"><div class="k">أوفر تايم الشهر ده</div><div class="v">${hm(ot)}</div></div></div>
  ${recs.length?`<div class="list">${recs.map(x=>{const w=attMinutes(x);const o=w!=null&&w>base?w-base:0;return `<div class="row" style="cursor:default"><span class="t">${esc(dayLabel(x.date))}</span><span class="end">${attChip(x,w,o,base)}</span><span class="m">حضور ${esc(x.in||"—")} · انصراف ${esc(x.out||"—")}${w!=null?" · "+hm(w):""}</span><span></span></div>`}).join("")}</div>`:`<div class="empty"><b>مفيش أيام متسجلة الشهر ده</b>اضغط «سجّل حضوري» أول ما توصل.</div>`}`;
}
/* ---------- views: reports ---------- */
function expenseTips(m,rv,ex,pr,flags){
  const tips=[];const salBase=pr.reduce((s,x)=>s+x.sal,0),otNow=pr.reduce((s,x)=>s+x.otPay,0);
  if(rv.charged&&rv.unpaid>Math.max(500,rv.charged*0.08))tips.push(`على الحالات ${money(rv.unpaid)} لسه ما اتحصّلوش من جلسات الشهر ده. التحصيل أهم من أي توفير: ريهام تتابع مع اللي عليهم فلوس، والباكدج يتدفع أوله مقدم.`);
  const ads=ex.o["إعلانات وتسويق"]||0;
  const newPats=Object.values(S.patients).filter(p=>(p.examDate||"").startsWith(m));const adPats=newPats.filter(p=>AD_SOURCES.includes(p.source)).length;
  if(ads>0)tips.push(adPats?`الإعلانات جابت ${adPats} حالة جديدة بتكلفة حوالي ${money(ads/adPats)} للحالة. قارنها بمتوسط اللي الحالة بتدفعه، ووقّف المنصة اللي مش بتجيب حالات.`:`صرفت ${money(ads)} على الإعلانات ومفيش حالة جديدة متسجلة جاية من إعلان. اتأكد إن خانة «عرفت المركز منين» بتتملي، ولو فعلاً مفيش، غيّر الإعلان أو وقفه.`);
  if(salBase&&otNow>salBase*0.08)tips.push(`الأوفر تايم ${money(otNow)} الشهر ده. وزّع المواعيد على اليوم بدل ما الحالات تتكوم آخر النهار، أو خلي الشيفتات تبدأ متأخر شوية.`);
  flags.forEach(f=>tips.push(`بند «${f.c}» ${money(f.cur)} مقابل متوسط ${money(f.avg)}. راجع الفواتير بتاعته وشوف إيه اللي زاد.`));
  const refs=newPats.filter(p=>p.source==="ترشيح من مريض"||p.source==="ترشيح من دكتور").length;
  if(newPats.length>=5&&refs/newPats.length>=0.4)tips.push(`${Math.round(refs/newPats.length*100)}% من الحالات الجديدة جاية بترشيح. خصم بسيط للمريض اللي يرشّح حد غالباً أرخص من الإعلانات.`);
  if(!tips.length)tips.push(rv.collected?"مفيش حاجة ملفتة في مصروفات الشهر ده.":"سجّل الجلسات والمصروفات الأول عشان الاقتراحات تطلع.");
  return tips;
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
  for(const p of Object.values(S.patients)){const dt=p.examDate||(p.createdAt?new Date(p.createdAt).toLocaleDateString("en-CA"):"");if(!S.ui.srcAll&&!dt.startsWith(m))continue;const k=p.source||"مش متسجل";src[k]=src[k]||{n:0,rev:0};src[k].n++;src[k].rev+=bal[p.id]?.charged||0;srcN++}
  const srcArr=Object.entries(src).sort((a,b)=>b[1].n-a[1].n);const maxN=srcArr[0]?.[1].n||1;
  const sourcesPanel=`<div class="panel"><div class="sec-title"><h2>الحالات بتيجي منين</h2><div class="seg" style="flex:0 1 auto"><label><input type="radio" name="srcScope" data-act="srcScope" value="m" ${S.ui.srcAll?"":"checked"}> الشهر ده</label><label><input type="radio" name="srcScope" data-act="srcScope" value="all" ${S.ui.srcAll?"checked":""}> من الأول</label></div></div>
  ${srcArr.length?`<div class="bars">${srcArr.map(([k,v],i)=>`<div class="brow"><span>${esc(k)}</span><div class="btrack"><div class="bfill ${i===0?"top":""}" style="width:${Math.max(4,v.n/maxN*100)}%"></div></div><span class="num">${v.n} · ${Math.round(v.n/srcN*100)}%</span></div>`).join("")}</div>
  <div class="tblwrap"><table><thead><tr><th>المصدر</th><th>حالات</th><th>إجمالي جلساتهم</th></tr></thead><tbody>${srcArr.map(([k,v])=>`<tr><td>${esc(k)}</td><td class="num">${v.n}</td><td>${money(v.rev)}</td></tr>`).join("")}</tbody></table></div>
  <p class="sub" style="margin:0">من خانة «عرفت المركز منين» في شيت الكشف.</p>`
  :`<div class="empty"><b>مفيش حالات جديدة ${S.ui.srcAll?"":"الشهر ده"}</b>لما تملا شيت الكشف وتختار «عرفت المركز منين» هتظهر هنا.</div>`}</div>`;
  const top=`<div class="bar"><input type="month" id="monthPick" value="${m}" style="max-width:190px" aria-label="الشهر"><span class="sub grow">${esc(monthLabel(m))}</span></div>${loadingNote}`;
  if(!owner)return `${top}
  <div class="stats">
    <div class="stat"><div class="k">اتحصّل فعلاً</div><div class="v money">${money(rv.collected)}</div></div>
    <div class="stat"><div class="k">كاش</div><div class="v money">${money(rv.cash)}</div></div>
    <div class="stat"><div class="k">InstaPay</div><div class="v money">${money(rv.insta)}</div></div>
    <div class="stat"><div class="k">متبقي على الحالات</div><div class="v money">${money(rv.unpaid)}</div></div>
  </div>${expensesPanel}${sourcesPanel}`;
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
    <div class="stat"><div class="k">اتحصّل فعلاً</div><div class="v money">${money(rv.collected)}</div></div>
    <div class="stat"><div class="k">مرتبات وأوفر تايم ونسب</div><div class="v money">${money(salTotal)}</div></div>
    <div class="stat"><div class="k">مصروفات تانية</div><div class="v money">${money(ex.t)}</div></div>
    <div class="stat"><div class="k">صافي الشهر</div><div class="v money" style="color:${net<0?"var(--bad)":"var(--ok)"}">${money(net)}</div></div>
  </div>
  <div class="verdict ${vcls}"><b style="font-family:var(--f-display)">${vt}</b><span>${vs}</span></div>
  <div class="panel"><h2>تقلل منين؟</h2><ul class="tips">${expenseTips(m,rv,ex,pr,flags).map(t=>`<li>${esc(t)}</li>`).join("")}</ul></div>
  <div class="panel"><h2>المرتبات</h2>
  <div class="tblwrap"><table><thead><tr><th>الاسم</th><th>الأساسي</th><th>أوفر تايم</th><th>قيمة الأوفر تايم</th><th>النسبة</th><th>الإجمالي</th></tr></thead><tbody>
  ${pr.map(x=>`<tr><td>${esc(x.s.name)}</td><td>${money(x.sal)}</td><td>${hm(x.ot)}</td><td>${money(x.otPay)}</td><td>${x.cm?`${money(x.comm)}<div class="sub">${x.full} كاملة · ${x.half} نص · من ${money(x.commBase)}</div>`:"—"}</td><td><b>${money(x.total)}</b></td></tr>`).join("")}
  </tbody><tfoot><tr><td>الإجمالي</td><td>${money(pr.reduce((s,x)=>s+x.sal,0))}</td><td></td><td>${money(otNow)}</td><td>${money(pr.reduce((s,x)=>s+x.comm,0))}</td><td>${money(salTotal)}</td></tr></tfoot></table></div>
  <p class="sub" style="margin:0">سعر الدقيقة = المرتب ÷ (${cfg().daysBase} يوم × ${cfg().hoursBase} ساعات × 60)، والأوفر تايم × ${cfg().otMult}. النسبة محسوبة على المبلغ اللي الحالة دفعته فعلاً في الجلسة.</p></div>
  ${expensesPanel}${sourcesPanel}`;
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
  <div class="panel"><div class="sec-title"><h2>أنواع الجلسات والأسعار</h2><button class="btn sm" data-act="newType">+ نوع جلسة</button></div>
  ${S.types.length?`<div class="list">${S.types.map(t=>`<button class="row" data-act="editType" data-id="${t.id}"><span class="t">${esc(t.name)}</span><span class="end money">${S.prices[t.id]!=null?money(S.prices[t.id]):"بدون سعر"}</span></button>`).join("")}</div>`:`<div class="empty"><b>مفيش أنواع جلسات</b>مثلاً: كشف، جلسة علاج طبيعي، جلسة تأهيل. الدكاترة بيشوفوا الأسماء بس، من غير أسعار.</div>`}</div>
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
function moneyFields(prefix,v){
  return `<div class="grid2">
    <label class="f">السعر<input id="${prefix}_price" inputmode="decimal" value="${v.price??""}"></label>
    <label class="f">خصم<input id="${prefix}_disc" inputmode="decimal" value="${v.discount||""}" placeholder="0"></label>
    <label class="f">دفع كام دلوقتي<input id="${prefix}_paid" inputmode="decimal" value="${v.paid??""}"></label>
    <label class="f">طريقة الدفع<select id="${prefix}_method"><option value="cash" ${v.method!=="instapay"?"selected":""}>كاش</option><option value="instapay" ${v.method==="instapay"?"selected":""}>InstaPay</option></select></label>
  </div><div class="note" id="${prefix}_sum"></div>`;
}
function wireMoney(prefix,typeSel){
  const f=k=>document.getElementById(prefix+"_"+k);
  const upd=()=>{const net=Math.max(0,num(f("price").value)-num(f("disc").value));const paid=num(f("paid").value);const d=net-paid;
    f("sum").innerHTML=`صافي الجلسة <b>${money(net)}</b> · ${d>0?`يفضل عليه <b style="color:var(--bad)">${money(d)}</b>`:d<0?`زيادة <b style="color:var(--ok)">${money(-d)}</b> تتحسب له رصيد`:"مدفوعة بالكامل"}`};
  ["price","disc","paid"].forEach(k=>f(k).addEventListener("input",upd));
  if(typeSel){const t=document.getElementById(typeSel);t.addEventListener("change",()=>{const p=S.prices[t.value];if(p!=null){f("price").value=p;if(!f("paid").value)f("paid").value=p}upd()})}
  upd();
}
function readMoney(prefix){const price=num(val(prefix+"_price")),discount=num(val(prefix+"_disc"));return{price,discount,net:Math.max(0,price-discount),paid:num(val(prefix+"_paid")),method:val(prefix+"_method")}}
/* patient running balance lives on the patient doc (charged / paid / count), kept in step with every visit and payment */
function bump(b,pid,dc,dp,dn,date){if(!pid)return;const u={charged:inc(dc),paid:inc(dp),count:inc(dn)};if(date)u.last=date;b.update(S.db.doc("patients/"+pid),u)}
/* ---------- doctor entry ---------- */
function sheetEntry(e){
  const ro=e&&e.status!=="pending";
  openSheet(e?(ro?"تفاصيل الجلسة":"تعديل الجلسة"):"سجّل جلسة",`
  ${ro?`<div class="note">${statusChip(e.status)} ${(e.review?.changes||[]).map(esc).join(" · ")}${e.review?.note?`<br>رد الاستقبال: ${esc(e.review.note)}`:""}</div>`:""}
  <label class="f">اسم الحالة<input id="e_pat" list="e_dl" value="${esc(e?.patientName||"")}" autocomplete="off" ${ro?"disabled":""}><datalist id="e_dl">${Object.values(S.pdir).map(p=>`<option value="${esc(p.name)}"></option>`).join("")}</datalist></label>
  <div class="grid2"><label class="f">التاريخ<input type="date" id="e_date" value="${e?.date||today()}" ${ro?"disabled":""}></label><label class="f">الساعة<input type="time" id="e_time" value="${e?.time||nowHM()}" ${ro?"disabled":""}></label></div>
  <label class="f">نوع الجلسة<select id="e_type" ${ro?"disabled":""}>${typeOptions(e?.typeId)}</select></label>
  ${ro?"":compSeg("e_comp",e?.completion)}
  <label class="f">كومنت (اختياري)<textarea id="e_note" placeholder="مثلاً الحالة اتحسنت، أو د. سلمى ساعدتني في نص الجلسة" ${ro?"disabled":""}>${esc(e?.note||"")}</textarea></label>
  <div class="err" id="formErr"></div>
  ${ro?"":`<div class="bar"><button class="btn primary grow" data-act="saveEntry" data-id="${e?.id||""}">${e?"حفظ التعديل":"ابعت للمراجعة"}</button>${e?`<button class="btn danger" data-act="delEntry" data-id="${e.id}" data-confirm>حذف</button>`:""}</div>`}`);
}
async function saveEntry(id){
  const name=val("e_pat").trim(),type=val("e_type");
  if(!name)return setErr("اكتب اسم الحالة");if(!type)return setErr("اختار نوع الجلسة");
  const pd=Object.entries(S.pdir).find(([k,p])=>p.name===name);
  const body={patientName:name,patientId:pd?pd[0]:null,date:val("e_date")||today(),time:val("e_time"),typeId:type,typeName:typeName(type),completion:radio("e_comp")||"full",note:val("e_note").trim(),status:"pending",doctorSid:S.mySid};
  if(id)await S.db.doc("log/"+id).update(body);else await S.db.collection("log").doc().set({...body,createdAt:Date.now()});
  closeSheet();toast("اتبعتت للمراجعة");
}
/* ---------- review ---------- */
function sheetReview(id,done){
  const e=S.log[id];if(!e)return;
  const pat=e.patientId&&S.patients[e.patientId]?pLabel(S.patients[e.patientId]):(findPatient(e.patientName)?pLabel(findPatient(e.patientName)):e.patientName);
  const price=S.prices[e.typeId];
  openSheet(done?"جلسة اتراجعت":"مراجعة جلسة",`
  <div class="note"><b>${esc(staffName(e.doctorSid))}</b> سجّل: ${esc(e.patientName)} · ${esc(e.typeName)} · ${e.completion==="half"?"نص حالة":"حالة كاملة"} · ${esc(e.date)} ${esc(e.time||"")}${e.note?`<br>الكومنت: ${esc(e.note)}`:""}</div>
  ${done?`<div class="note">${statusChip(e.status)} ${(e.review?.changes||[]).map(esc).join(" · ")}${e.review?.note?`<br>ردك: ${esc(e.review.note)}`:""}</div>${e.status!=="rejected"?`<button class="btn" data-act="editVisit" data-id="${id}">فتح الجلسة والفلوس</button>`:""}`:`
  <label class="f">الحالة${patientPicker("r_pat",pat)}</label>${newPatientFields("r")}
  <div class="grid2"><label class="f">التاريخ<input type="date" id="r_date" value="${e.date}"></label><label class="f">الساعة<input type="time" id="r_time" value="${e.time||""}"></label></div>
  <label class="f">نوع الجلسة<select id="r_type">${typeOptions(e.typeId)}</select></label>
  ${compSeg("r_comp",e.completion)}
  ${moneyFields("r",{price:price??"",paid:price??"",method:"cash"})}
  <label class="f">رد للدكتور (لازم لو هترفض)<textarea id="r_note"></textarea></label>
  <div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="approve" data-id="${id}">اعتماد</button><button class="btn danger" data-act="reject" data-id="${id}">رفض</button></div>`}`,
  done?null:()=>{watchNewPatient("r","r_pat");wireMoney("r","r_type")});
}
async function approveEntry(id,reject){
  const e=S.log[id];const ref=S.db.doc("log/"+id);const note=val("r_note").trim();
  if(reject){if(!note)return setErr("اكتب سبب الرفض عشان يوصل للدكتور");await ref.update({status:"rejected",review:{note,at:Date.now(),changes:[],by:S.mySid}});closeSheet();toast("اترفضت واتبعت للدكتور");return}
  const pv=val("r_pat").trim(),type=val("r_type");if(!pv)return setErr("اختار الحالة");if(!type)return setErr("اختار نوع الجلسة");
  const pat=await ensurePatient(pv,val("r_phone"),val("r_src"));
  const comp=radio("r_comp")||"full",date=val("r_date")||e.date;const mny=readMoney("r");
  const changes=[];
  if(pat.name!==e.patientName)changes.push(`اسم الحالة اتعدّل لـ «${pat.name}»`);
  if(type!==e.typeId)changes.push(`النوع اتعدّل لـ «${typeName(type)}»`);
  if(comp!==e.completion)changes.push(comp==="half"?"اتحسبت نص حالة":"اتحسبت حالة كاملة");
  if(date!==e.date)changes.push(`التاريخ اتعدّل لـ ${date}`);
  const b=S.db.batch();
  b.set(S.db.doc("visits/"+id),{date,time:val("r_time"),patientId:pat.id,patientName:pat.name,doctorId:e.doctorSid,typeId:type,typeName:typeName(type),...mny,completion:comp,logId:id,createdAt:Date.now()});
  bump(b,pat.id,mny.net,mny.paid,1,date);
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
  <label class="f">نوع الجلسة<select id="v_type">${typeOptions(v.typeId)}</select></label>
  <label class="f">التاريخ<input type="date" id="v_date" value="${v.date}"></label><label class="f">الساعة<input type="time" id="v_time" value="${v.time||""}"></label></div>
  ${compSeg("v_comp",v.completion)}
  ${moneyFields("v",v)}
  ${v.logId&&id?`<p class="sub" style="margin:0">الجلسة دي جاية من تسجيل الدكتور.</p>`:""}
  <div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="saveVisit" data-id="${id||""}">حفظ</button>${id?`<button class="btn danger" data-act="delVisit" data-id="${id}" data-confirm>حذف</button>`:""}</div>`,
  ()=>{watchNewPatient("v","v_pat");wireMoney("v","v_type")});
}
async function saveVisit(id){
  const pv=val("v_pat").trim(),type=val("v_type");if(!pv)return setErr("اختار الحالة");if(!type)return setErr("اختار نوع الجلسة");
  const pat=await ensurePatient(pv,val("v_phone"),val("v_src"));
  const body={date:val("v_date")||today(),time:val("v_time"),patientId:pat.id,patientName:pat.name,doctorId:val("v_doc"),typeId:type,typeName:typeName(type),...readMoney("v"),completion:radio("v_comp")||"full"};
  const b=S.db.batch();
  if(id){
    const old=S.visits[id];b.update(S.db.doc("visits/"+id),body);
    if(old&&old.patientId===body.patientId)bump(b,body.patientId,body.net-(old.net||0),body.paid-(old.paid||0),0,body.date);
    else{if(old)bump(b,old.patientId,-(old.net||0),-(old.paid||0),-1);bump(b,body.patientId,body.net,body.paid,1,body.date)}
    if(S.old.visits[id])S.old.visits[id]={...old,...body};
  }else{const ref=S.db.collection("visits").doc();b.set(ref,{...body,createdAt:Date.now()});bump(b,body.patientId,body.net,body.paid,1,body.date)}
  await b.commit();merge();closeSheet();toast("اتحفظت");
}
async function delVisit(id){
  const v=S.visits[id];if(!v)return;const b=S.db.batch();b.delete(S.db.doc("visits/"+id));bump(b,v.patientId,-(v.net||0),-(v.paid||0),-1);
  await b.commit();forget("visits",id);closeSheet();toast("اتمسحت");
}
/* ---------- payment ---------- */
async function sheetPay(id,patientId){
  let p=id?S.payments[id]:{date:S.ui.date,method:"cash",patientId};
  if(id&&!p){const d=await S.db.doc("payments/"+id).get();if(!d.exists)return;p={id,...d.data()};S.old.payments[id]=p;merge()}
  const cur=p.patientId&&S.patients[p.patientId]?pLabel(S.patients[p.patientId]):(p.patientName||"");
  openSheet(id?"تعديل دفعة":"دفعة منفصلة",`<p class="sub" style="margin:0">للحالات اللي بتدفع باكدج مقدم أو بتسدد اللي عليها. لو هترجع فلوس لحالة اكتب المبلغ بالسالب.</p>
  <label class="f">الحالة${patientPicker("p_pat",cur)}</label>
  <div class="grid2"><label class="f">المبلغ<input id="p_amt" inputmode="decimal" value="${p.amount??""}"></label><label class="f">طريقة الدفع<select id="p_method"><option value="cash">كاش</option><option value="instapay" ${p.method==="instapay"?"selected":""}>InstaPay</option></select></label><label class="f">التاريخ<input type="date" id="p_date" value="${p.date}"></label></div>
  <label class="f">ملاحظة<input id="p_note" value="${esc(p.note||"")}" placeholder="مثلاً باكدج 10 جلسات"></label>
  <div class="err" id="formErr"></div><div class="bar"><button class="btn primary grow" data-act="savePay" data-id="${id||""}">حفظ</button>${id?`<button class="btn danger" data-act="delPay" data-id="${id}" data-confirm>حذف</button>`:""}</div>`);
}
async function savePay(id){
  const pat=findPatient(val("p_pat"));if(!pat)return setErr("اختار حالة موجودة من القائمة");const amount=num(val("p_amt"));if(!amount)return setErr("اكتب المبلغ");
  const body={patientId:pat.id,patientName:pat.name,amount,method:val("p_method"),date:val("p_date")||today(),note:val("p_note").trim()};
  const b=S.db.batch();
  if(id){const old=S.payments[id];b.update(S.db.doc("payments/"+id),body);
    if(old&&old.patientId===body.patientId)bump(b,body.patientId,0,amount-(old.amount||0),0);
    else{if(old)bump(b,old.patientId,0,-(old.amount||0),0);bump(b,body.patientId,0,amount,0)}
    if(S.old.payments[id])S.old.payments[id]={...old,...body};
  }else{b.set(S.db.collection("payments").doc(),{...body,createdAt:Date.now()});bump(b,body.patientId,0,amount,0)}
  await b.commit();merge();closeSheet();toast("اتحفظت الدفعة");
}
async function delPay(id){const p=S.payments[id];if(!p)return;const b=S.db.batch();b.delete(S.db.doc("payments/"+id));bump(b,p.patientId,0,-(p.amount||0),0);await b.commit();forget("payments",id);closeSheet();toast("اتمسحت")}
/* ---------- patient file ---------- */
function sheetPatient(id){
  const p=id?S.patients[id]:{examDate:today()};if(!p)return;
  const b=balances()[id];
  const docOpts=[["owner","د. محي"],...doctors().map(d=>[d.id,d.name])];
  const F=(k,l,t="input",extra="")=>t==="ta"?`<label class="f">${l}<textarea id="pt_${k}">${esc(p[k]||"")}</textarea></label>`:`<label class="f">${l}<input id="pt_${k}" value="${esc(p[k]||"")}" ${extra}></label>`;
  openSheet(id?p.name:"ملف مريض جديد",`
  ${id?`<div class="bar">${balChip(b)}<span class="sub grow">${b?`${b.count} جلسة · إجمالي ${money(b.charged)} · دفع ${money(b.paid)}`:""}</span><button class="btn sm" data-act="payFor" data-id="${id}">+ دفعة</button></div>`:""}
  <div class="grid2">${F("name","الاسم")}${F("phone","الموبايل","input",'inputmode="tel"')}${F("age","السن","input",'inputmode="numeric"')}
  <label class="f">النوع<select id="pt_gender"><option value="">—</option><option ${p.gender==="ذكر"?"selected":""}>ذكر</option><option ${p.gender==="أنثى"?"selected":""}>أنثى</option></select></label>
  <label class="f">عرف المركز منين<select id="pt_source">${sourceOptions(p.source)}</select></label>${F("sourceDetail","تفاصيل المصدر (اسم اللي رشّح…)")}
  <label class="f">تاريخ الكشف<input type="date" id="pt_examDate" value="${p.examDate||""}"></label>
  <label class="f">الدكتور اللي كشف<select id="pt_examDoctor"><option value="">—</option>${docOpts.map(([k,n])=>`<option value="${k}" ${p.examDoctor===k?"selected":""}>${esc(n)}</option>`).join("")}</select></label></div>
  <div class="hr"></div><h3 style="font-size:15px">شيت الكشف</h3>
  ${F("complaint","الشكوى الأساسية","ta")}${F("history","التاريخ المرضي والعمليات والأدوية","ta")}${F("findings","الفحص (ROM، القوة، الألم من 10، الاختبارات الخاصة)","ta")}${F("diagnosis","التشخيص")}${F("plan","خطة العلاج وعدد الجلسات","ta")}${F("notes","ملاحظات","ta")}
  <div class="hr"></div><div class="sec-title"><h3 style="font-size:15px">صورة ورقة الكشف</h3>${id?`<label class="btn sm">رفع صورة<input type="file" id="pt_file" accept="image/*" hidden></label>`:""}</div>
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
    el.innerHTML=hist.length?`<div class="hr"></div><h3 style="font-size:15px;margin-bottom:8px">الجلسات والدفعات</h3><div class="list">${hist.map(h=>h.t==="v"?`<button class="row" data-act="editVisit" data-id="${h.x.id}"><span class="t">${esc(h.x.typeName)} ${h.x.completion==="half"?`<span class="chip c-warn">نص</span>`:""}</span><span class="end money">${money(h.x.net)}</span><span class="m">${esc(h.x.date)} · ${esc(staffName(h.x.doctorId))}</span><span class="end m">دفع ${money(h.x.paid)} ${METHODS[h.x.method]||""}</span></button>`:`<button class="row" data-act="editPay" data-id="${h.x.id}"><span class="t">دفعة ${h.x.note?"· "+esc(h.x.note):""}</span><span class="end money">${money(h.x.amount)}</span><span class="m">${esc(h.x.date)} · ${METHODS[h.x.method]||""}</span><span></span></button>`).join("")}</div>`:"";
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
async function compressImage(file){ // keeps each photo well under Firestore's 1 MB document limit
  const img=await loadImg(file);let max=1600;
  for(let round=0;round<4;round++){
    const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement("canvas");c.width=Math.round(img.naturalWidth*k);c.height=Math.round(img.naturalHeight*k);
    const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);
    for(const q of [0.72,0.6,0.5,0.4]){const u=c.toDataURL("image/jpeg",q);if(u.length<850000)return u}
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
  await b.commit();toast("اتحفظ الملف");setTimeout(()=>sheetPatient(id),300);
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
async function selfAtt(kind){
  const sid=S.mySid,d=today(),ref=S.db.doc(`att/${d}_${sid}`);const TS=firebase.firestore.FieldValue.serverTimestamp();
  if(kind==="in")await ref.set({date:d,staffId:sid,inAt:TS,in:"",out:"",note:"",by:sid});
  else await ref.update({out:nowHM(),outAt:TS});
  toast(kind==="in"?"اتسجل حضورك":"اتسجل انصرافك");
}
/* ---------- expenses ---------- */
function sheetExp(id){
  const x=id?S.expenses[id]:{date:today()};if(!x)return;
  openSheet(id?"تعديل مصروف":"مصروف جديد",`<div class="grid2"><label class="f">البند<select id="x_cat">${EXP_CATS.map(c=>`<option ${c===x.category?"selected":""}>${c}</option>`).join("")}</select></label><label class="f">المبلغ<input id="x_amt" inputmode="decimal" value="${x.amount??""}"></label><label class="f">التاريخ<input type="date" id="x_date" value="${x.date}"></label></div>
  <label class="f">ملاحظة<input id="x_note" value="${esc(x.note||"")}"></label><div class="err" id="formErr"></div>
  <div class="bar"><button class="btn primary grow" data-act="saveExp" data-id="${id||""}">حفظ</button>${id?`<button class="btn danger" data-act="delExp" data-id="${id}" data-confirm>حذف</button>`:""}</div>`);
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
  openSheet(id?"تعديل نوع جلسة":"نوع جلسة جديد",`<label class="f">الاسم (الدكاترة بيشوفوه)<input id="t_name" value="${esc(t?.name||"")}" placeholder="مثلاً جلسة علاج طبيعي"></label><label class="f">السعر (مخفي عن الدكاترة)<input id="t_price" inputmode="decimal" value="${id?S.prices[id]??"":""}"></label><div class="err" id="formErr"></div>
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
  if(id==="monthPick"&&e.target.value){S.ui.month=e.target.value;e.target.blur();render()}
  if(e.target.dataset.act==="srcScope"){S.ui.srcAll=e.target.value==="all";e.target.blur();render()}
});
const ADMIN_ACTS=new Set(["newVisit","editVisit","saveVisit","delVisit","newPay","payFor","editPay","savePay","delPay","review","reviewDone","approve","reject","newPatient","openPatient","savePatient","delPatient","editAtt","saveAtt","delAtt","newExp","editExp","saveExp","delExp","newStaff","editStaff","saveStaff","makeLogin","saveLogin","newType","editType","saveType","delType"]);
document.addEventListener("click",async e=>{
  const t=e.target.closest("[data-act]");if(!t)return;const a=t.dataset.act,id=t.dataset.id;
  if(a==="bgClose"){if(e.target===t)closeSheet();return}
  if(a==="srcScope")return;
  if(ADMIN_ACTS.has(a)&&!isAdmin())return;
  if((a==="saveCfg"||a==="backup")&&S.role!=="owner")return;
  if(t.hasAttribute("data-confirm")&&!t.dataset.armed){t.dataset.armed="1";t.dataset.label=t.textContent;t.textContent="متأكد؟ اضغط تاني";setTimeout(()=>{if(t.isConnected){delete t.dataset.armed;t.textContent=t.dataset.label}},4000);return}
  const db=S.db;
  switch(a){
    case "tab":S.tab=t.dataset.k;render();window.scrollTo(0,0);break;
    case "close":closeSheet();break;
    case "logout":S.auth.signOut();break;
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
    case "newType":sheetType(null);break;
    case "editType":sheetType(id);break;
    case "saveType":guard(t,async()=>{const name=val("t_name").trim();if(!name)return setErr("اكتب اسم الجلسة");const tid=id||("t"+Date.now().toString(36));const list=id?S.types.map(x=>x.id===id?{...x,name}:x):[...S.types,{id:tid,name}];const pr=val("t_price").trim();const p={...S.prices};if(pr)p[tid]=num(pr);else delete p[tid];const b=db.batch();b.set(db.doc("pub/types"),{list});b.set(db.doc("cfg/prices"),{p});await b.commit();closeSheet();toast("اتحفظ")});break;
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
boot();
