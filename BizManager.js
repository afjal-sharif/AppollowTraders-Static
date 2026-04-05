const TELEGRAM_BOT = "8757155296:AAHbLEz15Gp4ccaV0OUpB8oPHwZdJsv-O0s";
const TELEGRAM_CHAT = "-1003310956167";
const CRON_SECRET = "apollo-cron-2026-secure";

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      return new Response(
        "<h2>Worker Error</h2><pre>" + err.toString() + "</pre>",
        { headers: { "content-type": "text/html;charset=UTF-8" } }
      );
    }
  }
};

async function handleRequest(request, env) {

  const url = new URL(request.url);
  const PIN = "1234";
  const MASTER_KEY = "698846";

    // License systems
  const LICENSE_EXPIRE = "2026-12-31";   // Static date license
  const USE_KV_LICENSE = true;           // Enable KV license system

  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("auth=1");
  
 // Secure Cron Endpoint
if (url.pathname === "/cron-check") {

  const token = url.searchParams.get("token");

  if(token !== CRON_SECRET){
    return new Response("Unauthorized",{status:403});
  }

  await checkVehicleAlerts(env);
    // auto backup
  await handleRequest(
    new Request(request.url.replace("/cron-check","/api/backup")),
    env
  );

  return new Response("Cron executed successfully");
} 
 
  // Static Date License Check

const masterAccess = url.searchParams.get("master") === MASTER_KEY;

if (!masterAccess) {

const today = new Date().toISOString().split("T")[0];

if (today > LICENSE_EXPIRE) {
  return html(expiredPage());
}

if (USE_KV_LICENSE) {

  const kvLicense = await env.DATA_STORE.get("APP_LICENSE");

  if (kvLicense && today > kvLicense) {
    return html(expiredPage());
  }

}

}

if (url.pathname === "/api/license-info") {

const kv = await env.DATA_STORE.get("APP_LICENSE");

let expiry = kv || LICENSE_EXPIRE;

const today = new Date();
const exp = new Date(expiry);

const days = Math.floor((exp - today)/(1000*60*60*24));

return Response.json({
expiry,
days,
status: days < 0 ? "Expired" : "Active"
});

}

if (url.pathname === "/api/set-license" && request.method === "POST") {

  const masterAccess = url.searchParams.get("master") === MASTER_KEY;

  if(!masterAccess){
    return Response.json({success:false,error:"Unauthorized"});
  }

  const data = await request.json();

  if(!data.date){
    return Response.json({success:false,error:"Missing date"});
  }

  await env.DATA_STORE.put("APP_LICENSE", data.date);

  return Response.json({success:true});

}

  if (url.pathname === "/login" && request.method === "POST") {

    const form = await request.formData();

    if (form.get("pin") === PIN) {
      return new Response(null,{
        status:302,
        headers:{
          "Set-Cookie":"auth=1; Path=/; HttpOnly; SameSite=Strict",
          "Location":"/"
        }
      });
    }

    return html(loginPage("Wrong PIN ❌"));
  }

  if (!loggedIn && url.pathname !== "/login") {
    return html(loginPage(""));
  }


if (url.pathname === "/api/expiry-summary") {

  const vehicles = await safeList(env,"vehicle:");
  const today = new Date();

  const expired = [];
  const warning = [];

  for(const v of vehicles){

    if(!v.expiry) continue;

    const exp = new Date(v.expiry);
    const diff = Math.floor((exp - today)/(1000*60*60*24));

    if(diff <= 0){

      expired.push({
        car:v.carNumber,
        doc:v.docType
      });

    }

    else if(diff <= 30){

      warning.push({
        car:v.carNumber,
        doc:v.docType,
        days:diff
      });

    }
  }

  const docs = await safeList(env,"doc:");

  docs.forEach(d=>{

  if(!d.expiry) return;

  const exp = new Date(d.expiry);
  const diff = Math.floor((exp - today)/(1000*60*60*24));

  if(diff <= 0){
  expired.push({
  car:"DOC",
  doc:d.name
  });
  }
  else if(diff <= 30){
  warning.push({
  car:"DOC",
  doc:d.name,
  days:diff
  });
  }

  });
  
  return Response.json({expired,warning});
}

  if (url.pathname === "/api/banks")
    return Response.json(await safeList(env,"bank:"));

  if (url.pathname === "/api/vehicles")
    return Response.json(await safeList(env,"vehicle:"));

  if (url.pathname === "/api/save-bank" && request.method === "POST") {

    const data = await request.json();
    await env.DATA_STORE.put("bank:"+Date.now(),JSON.stringify(data));

    return Response.json({success:true});
  }

if (url.pathname === "/api/save-document" && request.method === "POST") {

  if(request.headers.get("content-type").includes("application/json")){

    const data = await request.json();

    const key = data.key ? data.key : ("doc:"+Date.now());

  const old = await env.DATA_STORE.get(key);
  const oldData = old ? JSON.parse(old) : {};

  // version history
  if(old){
    await env.DATA_STORE.put(
      "history:"+key+":"+Date.now(),
      old
    );
  }

    await env.DATA_STORE.put(key, JSON.stringify({
      ...oldData,
      name:data.name,
      number:data.number,
      type:data.type,
      expiry:data.expiry
    }));

    return Response.json({success:true});
  }

  const form = await request.formData();

  const file = form.get("file");
  let fileUrl = "";

  if(file && file.size>0){

    const key = "docs/"+Date.now()+"-"+file.name;

    await env.DOC_BUCKET.put(key,file.stream(),{
      httpMetadata:{contentType:file.type}
    });

    fileUrl = key;
  }

  const key = "doc:"+Date.now();

  await env.DATA_STORE.put(key, JSON.stringify({
    name:form.get("name"),
    number:form.get("number"),
    type:form.get("type"),
    expiry:form.get("expiry"),
    file:fileUrl
  }));

  return Response.json({success:true});
}

if (url.pathname === "/api/save-vehicle" && request.method === "POST") {

  const data = await request.json();

  const key = data.key ? data.key : ("vehicle:" + Date.now());

  // 👉 SAVE VERSION HISTORY
  const old = await env.DATA_STORE.get(key);

  if(old){
    await env.DATA_STORE.put(
      "history:"+key+":"+Date.now(),
      old
    );
  }

  await env.DATA_STORE.put(key, JSON.stringify({
    name:data.name,
    carNumber:data.carNumber,
    docType:data.docType,
    expiry:data.expiry
  }));

  return Response.json({success:true});
}

  if (url.pathname === "/api/delete" && request.method === "POST") {

    const data = await request.json();
    await env.DATA_STORE.delete(data.key);

    return Response.json({success:true});
  }

  // ================= BACKUP =================

  if (url.pathname === "/api/backup") {

    const list = await env.DATA_STORE.list();

    const values = await Promise.all(
      list.keys.map(k => env.DATA_STORE.get(k.name))
    );

    const data = [];

    for (let i=0;i<values.length;i++){
      if(values[i]){
      let parsed;

      try{
        parsed = JSON.parse(values[i]);
      }catch{
        parsed = values[i];
      }

      data.push({
        key:list.keys[i].name,
        value:parsed
      });
      }
    }

    const json = JSON.stringify(data);

    const fileKey = "backup/"+Date.now()+".json";

    await env.DOC_BUCKET.put(fileKey, json);

    return Response.json({success:true});
  }

  if (url.pathname === "/api/backups") {

    const list = await env.DOC_BUCKET.list({ prefix:"backup/" });

    return Response.json(list.objects);
  }

  if (url.pathname === "/api/delete-backup" && request.method === "POST") {

    const data = await request.json();

    await env.DOC_BUCKET.delete(data.key);

    return Response.json({success:true});
  }

  // DELETE ALL
  if (url.pathname === "/api/delete-all" && request.method === "POST") {

    const data = await request.json();

    const list = await env.DATA_STORE.list({ prefix: data.prefix });

    await Promise.all(
      list.keys.map(k => env.DATA_STORE.delete(k.name))
    );

    return Response.json({success:true});
  }

  if (url.pathname === "/api/restore" && request.method === "POST") {

    const data = await request.json();

    const file = await env.DOC_BUCKET.get(data.key);

    const json = await file.text();
    const items = JSON.parse(json);

    for(const item of items){
      await env.DATA_STORE.put(item.key, JSON.stringify(item.value));
    }

    return Response.json({success:true});
  }

  if (url.pathname === "/api/history") {

  const key = url.searchParams.get("key");

  const list = await env.DATA_STORE.list({ prefix:"history:"+key });

  return Response.json(list.keys);
}

  if (url.pathname === "/file") {

  const key = url.searchParams.get("key");

  const object = await env.DOC_BUCKET.get(key);

  if(!object) return new Response("Not found",{status:404});

  return new Response(object.body,{
    headers:{
      "content-type":object.httpMetadata.contentType
    }
    
  });
  
}

  if (url.pathname === "/add-bank")
  return html(layout(addBankPage()));

  if (url.pathname === "/add-vehicle")
  return html(layout(addVehiclePage()));

  if (url.pathname === "/banks")
    return html(layout(banksPage()));

  if (url.pathname === "/super-admin")
  return html(layout(await superAdminPage(env)));

  if (url.pathname === "/vehicles")
    return html(layout(vehiclesPage()));

  if (url.pathname === "/admin")
    return html(layout(adminPage()));

  if (url.pathname === "/documents")
    return html(layout(documentsPage()));

  if (url.pathname === "/add-document")
    return html(layout(addDocumentPage()));

  if (url.pathname === "/api/documents")
    return Response.json(await safeList(env,"doc:"));

  await checkVehicleAlerts(env);

  return html(layout(await homePage()));
}

async function safeList(env, prefix) {

  if (!env.DATA_STORE) return [];

  const list = await env.DATA_STORE.list({ prefix });

  const values = await Promise.all(
    list.keys.map(k => env.DATA_STORE.get(k.name))
  );

  const result = [];

  for (let i = 0; i < values.length; i++) {

    if (values[i]) {
      result.push({
        key:list.keys[i].name,
        ...JSON.parse(values[i])
      });
    }

  }

  return result;
}

async function checkVehicleAlerts(env){

const vehicles = await safeList(env,"vehicle:");
const today = new Date();
const todayStr = today.toISOString().split("T")[0];

for(const v of vehicles){

const exp = new Date(v.expiry);
const diff = Math.floor((exp - today)/(1000*60*60*24));

let warn="";

if(diff<=0)
warn="🚨 মেয়াদ শেষ, রিনিউ করুন";

else if(diff<=7)
warn="⚠ "+diff+" দিন পর মেয়াদ শেষ হবে";

else if(diff<=15)
warn="⚠ "+diff+" দিন পর মেয়াদ শেষ হবে";

else if(diff<=30)
warn="⚠ "+diff+" দিন পর মেয়াদ শেষ হবে";

if(!warn) continue;

// unique daily alert key
const alertKey =
"alert:"+v.carNumber+":"+v.docType+":"+todayStr;

// check KV if alert already sent
const alreadySent = await env.DATA_STORE.get(alertKey);

if(alreadySent) continue;

// compose message
const text =
warn+"\n\n"+
"Vehicle: "+v.name+"\n"+
"Car: "+v.carNumber+"\n"+
"Document: "+v.docType+"\n"+
"Expiry: "+v.expiry;

// send alerts
await sendTelegram(text);

// mark alert sent
await env.DATA_STORE.put(alertKey,"1",{expirationTtl:86400});

}

}

async function sendTelegram(text){

const url =
"https://api.telegram.org/bot"+TELEGRAM_BOT+
"/sendMessage?chat_id="+TELEGRAM_CHAT+
"&text="+encodeURIComponent(text);

await fetch(url);

}

function html(content){
  return new Response(content,{
    headers:{ "content-type":"text/html;charset=UTF-8"}
  });
}

function layout(content){

return `
<html>
<head>

<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

<style>

*{box-sizing:border-box}

body{
font-family:'Inter',sans-serif;
background:#f8fafc;
margin:0;
padding:20px;
color:#1e293b
}

@keyframes flashHighlight{
0%{background:#fee2e2}
50%{background:#fca5a5}
100%{background:#fee2e2}
}

@keyframes flashWarn{
0%{background:#fff3cd}
50%{background:#fca5a5}
100%{background:#fff3cd}
}

@keyframes shakeWarn{
0%{transform:translateX(0)}
25%{transform:translateX(-4px)}
50%{transform:translateX(4px)}
75%{transform:translateX(-4px)}
100%{transform:translateX(0)}
}

.dash-alert{
cursor:pointer;
animation:flashWarn 2s infinite, shakeWarn 0.8s infinite;
}

.card{
background:white;
padding:18px;
margin:14px 0;
border-radius:18px;
box-shadow:0 8px 24px rgba(0,0,0,.06)
}

button{
padding:14px;
margin-top:10px;
border:none;
border-radius:14px;
background:#2563eb;
color:white;
width:100%;
font-weight:600
}

input,select{
width:100%;
padding:14px;
margin-top:10px;
border-radius:14px;
border:1px solid #e2e8f0
}

.warn{padding:12px;border-radius:12px;margin-bottom:12px;font-size:13px;font-weight:600}
.w30{background:#fef9c3}
.w15{background:#fde68a}
.w7{background:#fecaca}
.expired{background:#fca5a5}

.btn-row{
display:flex;
gap:10px;
margin-top:15px
}

.btn-row button{
flex:1;
padding:9px;
font-size:13px
}

.menu-btn{
position:fixed;
top:15px;
right:15px;
background:white;
border-radius:12px;
padding:10px 12px;
box-shadow:0 6px 18px rgba(0,0,0,.15);
cursor:pointer
}

.side-menu{
position:fixed;
top:60px;
right:15px;
width:200px;
background:white;
border-radius:14px;
box-shadow:0 10px 30px rgba(0,0,0,.15);
padding:12px;
display:none;
z-index:999
}

.side-menu button{
width:100%;
margin-top:6px;
font-size:14px
}

</style>

</head>

<body>

<div class="menu-btn" onclick="toggleMenu()">
<i class="fa-solid fa-ellipsis-vertical"></i>
</div>

<div id="menu" class="side-menu">

<button onclick="location.href='/'">🏠 Dashboard</button>
<button onclick="location.href='/banks'">🏦 Banks</button>
<button onclick="location.href='/documents'">📄 Documents</button>
<button onclick="location.href='/vehicles'">🚗 Vehicles</button>

<hr>

<button onclick="location.href='/add-bank'">➕ Add Bank</button>
<button onclick="location.href='/add-document'">➕ Add Document</button>
<button onclick="location.href='/add-vehicle'">➕ Add Vehicle</button>

</div>

${content}

<script>

function toggleMenu(){

const m=document.getElementById("menu");

if(m.style.display==="block"){
m.style.display="none";
}else{
m.style.display="block";
}

}

</script>

</body>

</html>
`;
}



function loginPage(msg){

return `
<html>

<head>

<meta name="viewport" content="width=device-width, initial-scale=1">

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">

<style>

*{box-sizing:border-box}

body{
margin:0;
font-family:'Inter',sans-serif;
background:linear-gradient(135deg,#1e3a8a,#2563eb);
height:100vh;
display:flex;
align-items:center;
justify-content:center;
}

.login-box{
background:white;
width:340px;
padding:35px;
border-radius:22px;
box-shadow:0 20px 60px rgba(0,0,0,.25);
text-align:center;
}

.logo{
width:80px;
margin-bottom:10px;
}

.title{
font-size:20px;
font-weight:700;
margin-bottom:20px;
color:#1e293b
}

input{
width:100%;
padding:14px;
border-radius:14px;
border:1px solid #e2e8f0;
margin-top:10px;
font-size:14px
}

button{
width:100%;
margin-top:15px;
padding:14px;
border:none;
border-radius:14px;
background:#2563eb;
color:white;
font-weight:600;
font-size:15px;
cursor:pointer;
transition:.2s
}

button:hover{
background:#1d4ed8
}

.error{
color:red;
margin-top:10px;
font-size:13px
}

</style>

</head>

<body>

<div class="login-box">

<img class="logo" src="https://pub-3a5a359d774b49a0a5b0cbdc87c4f674.r2.dev/logo.png">

<div class="title">মেসার্স এপোলো ট্রেডার্স</div>

<form method="POST" action="/login">

<input name="pin" type="password" placeholder="Enter Security PIN" required>

<button>Login</button>

</form>

<div class="error">${msg||""}</div>

</div>

</body>

</html>
`;
}



async function homePage(){

return `
<br>
<style>
.logo{
width:60px;
margin-bottom:0px;
}
</style>
 <center><img class="logo" src="https://pub-3a5a359d774b49a0a5b0cbdc87c4f674.r2.dev/logo.png"><h3>মেসার্স এপোলো ট্রেডার্স</h3></center>
<div id="expirySummary"></div>

<div id="licenseWarn"></div>
 <br>

<button onclick="location.href='/banks'">🏦 ব্যাংক একাউন্টস</button>
<button onclick="location.href='/documents'">📄 ব্যবসায়িক ডকুমেন্টস</button>
<button onclick="location.href='/vehicles'">🚗 গাড়ির ডকুমেন্টস</button>
<br><br><br><br><br><br><br><br>
<div id="licenseFooter" style="margin-top:40px;font-size:11px;text-align:center;color:#64748b"></div>

<script>

// license info
fetch('/api/license-info')
.then(r=>r.json())
.then(d=>{

if(d.days <= 30){

document.getElementById("licenseWarn").innerHTML =
'<div class="card" style="background:#fff3cd;font-weight:600">⚠ License expires in '+d.days+' days</div>';

}

document.getElementById("licenseFooter").innerText =
"License: "+d.status+" | Exp: "+d.expiry+" | "+d.days+" days left";

});

// expiry summary
fetch('/api/expiry-summary')
.then(r=>r.json())
.then(d=>{

let html="";

d.expired.forEach(v=>{

html +=
'<div class="card expired dash-alert" '+
'data-car="'+v.car+'" data-doc="'+v.doc+'">'+
'🚨 '+v.car+' – '+v.doc+' এর মেয়াদ শেষ </div>';

});

d.warning.forEach(v=>{

html +=
'<div class="card w30 dash-alert" '+
'data-car="'+v.car+'" data-doc="'+v.doc+'">'+
'⚠ '+v.car+' – '+v.doc+' এর মেয়াদ '+v.days+' দিনের মধ্যে শেষ হবে</div>';

});

document.getElementById("expirySummary").innerHTML = html;

// clickable alerts
document.querySelectorAll(".dash-alert").forEach(el=>{

el.onclick=function(){

const car=this.dataset.car;
const doc=this.dataset.doc;

if(car === "DOC"){
  location.href="/documents?doc="+encodeURIComponent(doc);
}else{
  location.href="/vehicles?car="+encodeURIComponent(car)+"&doc="+encodeURIComponent(doc);
}

};

});

});



</script>
`;
}


function banksPage(){

return `
<br>
<h2>🏦 ব্যাংক একাউন্টস</h2>

<input id="searchBank" placeholder="Search bank..." oninput="filterBanks()">

<div id="banks"></div>

<script>

let allBanks=[];

fetch('/api/banks')
.then(r=>r.json())
.then(data=>{
allBanks=data||[];
renderBanks(allBanks);
});

function renderBanks(data){

const div=document.getElementById('banks');
div.innerHTML="";

data.forEach(b=>{

const card=document.createElement("div");
card.className="card";

const text=
"Bank: "+b.name+"\\n"+
"Title: "+(b.title||"")+"\\n"+
"Account: "+b.account+"\\n"+
"Routing: "+b.routing+"\\n"+
"Branch: "+b.branch;

card.innerHTML=
"<b>"+b.name+"</b><br><br>"+
"Title: "+(b.title||"-")+"<br>"+
"Acc: "+b.account+"<br>"+
"Routing: "+b.routing+"<br>"+
"Branch: "+b.branch;

const row=document.createElement("div");
row.className="btn-row";

const copy=document.createElement("button");
copy.innerHTML='<i class="fa-solid fa-copy"></i>';
copy.onclick=()=>navigator.clipboard.writeText(text);

const sms=document.createElement("button");
sms.innerHTML='<i class="fa-solid fa-comment-sms"></i>';
sms.onclick=()=>window.location.href="sms:?body="+encodeURIComponent(text);

const whatsapp=document.createElement("button");
whatsapp.innerHTML='<i class="fa-brands fa-square-whatsapp"></i>';
whatsapp.onclick=()=>window.open(
"https://wa.me/?text="+encodeURIComponent(text),
"_blank"
);

row.append(copy,sms,whatsapp);
card.appendChild(row);
div.appendChild(card);

});

}

function toggleOtherDoc(){

const sel=document.getElementById("vtype").value;
const other=document.getElementById("vtypeOther");

other.style.display = sel==="other" ? "block" : "none";

}

function filterBanks(){

const q=document.getElementById("searchBank").value.toLowerCase();

renderBanks(
allBanks.filter(b=>
(b.name||"").toLowerCase().includes(q)||
(b.title||"").toLowerCase().includes(q)||
(b.account||"").toLowerCase().includes(q)
)
);

}

</script>
`;
}

function addBankPage(){

return `
<br>
<h2>➕ Add Bank Account</h2>

<input id="btitle" placeholder="Account Title">
<input id="bname" placeholder="Bank Name">
<input id="bacc" placeholder="Account">
<input id="brout" placeholder="Routing">
<input id="bbranch" placeholder="Branch">

<button onclick="save()">Save Bank</button>

<script>

function save(){

fetch('/api/save-bank',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
title:btitle.value,
name:bname.value,
account:bacc.value,
routing:brout.value,
branch:bbranch.value
})
})
.then(()=>{

alert("Bank Saved");
location.href="/banks";

});

}

</script>
`;
}


function vehiclesPage(){

return `
<br>
<h2>🚗 গাড়ির ডকুমেন্টস</h2>

<input id="searchVehicle" placeholder="Search vehicle..." oninput="filterVehicles()">

<div id="vehicles"></div>

<script>

const params = new URLSearchParams(window.location.search);
const highlightCar = params.get("car");
const highlightDoc = params.get("doc");

let allVehicles=[];

fetch('/api/vehicles')
.then(r=>r.json())
.then(data=>{

allVehicles=(data||[]).sort((a,b)=>
new Date(a.expiry)-new Date(b.expiry)
);

renderVehicles(allVehicles);

});

function renderVehicles(data){

const div=document.getElementById('vehicles');
div.innerHTML="";

const today=new Date();

data.forEach(v=>{

const exp=new Date(v.expiry);
const diff=Math.floor((exp-today)/(1000*60*60*24));

let warn="";

if(diff<=0)
warn="<div class='warn expired'>🚨 মেয়াদ শেষ, রিনিউ করুন</div>";

else if(diff<=7)
warn="<div class='warn w7'>⚠ "+diff+" দিন পর মেয়াদ শেষ হবে</div>";

else if(diff<=15)
warn="<div class='warn w15'>⚠ "+diff+" দিন পর মেয়াদ শেষ হবে</div>";

else if(diff<=30)
warn="<div class='warn w30'>⚠ "+diff+" দিন পর মেয়াদ শেষ হবে</div>";

const card=document.createElement("div");
card.className="card";

if(
highlightCar &&
highlightDoc &&
highlightCar === v.carNumber &&
highlightDoc === v.docType
){

card.style.border="3px solid #ef4444";
card.style.background="#fee2e2";
card.style.animation="flashHighlight 1s ease-in-out 3";

setTimeout(()=>{
card.scrollIntoView({
behavior:"smooth",
block:"center"
});
},200);

}

const text =
"Vehicle: "+v.name+"\\n"+
"Car Number: "+v.carNumber+"\\n"+
"Document: "+v.docType+"\\n"+
"Expiry: "+v.expiry;

card.innerHTML =
warn+
"<b>"+v.name+"</b><br>"+
"Car: "+v.carNumber+"<br>"+
"Type: "+v.docType+"<br>"+
"Expiry: "+v.expiry;

const row=document.createElement("div");
row.className="btn-row";

const copy=document.createElement("button");
copy.innerHTML='<i class="fa-solid fa-copy"></i>';
copy.title="Copy";
copy.onclick=()=>navigator.clipboard.writeText(text);

const sms=document.createElement("button");
sms.innerHTML='<i class="fa-solid fa-comment-sms"></i>';
sms.title="SMS";
sms.onclick=()=>window.location.href="sms:?body="+encodeURIComponent(text);

const whatsapp=document.createElement("button");
whatsapp.innerHTML='<i class="fa-brands fa-square-whatsapp"></i>';
whatsapp.title="WhatsApp";
whatsapp.onclick=()=>window.open(
"https://wa.me/?text="+encodeURIComponent(text),
"_blank"
);

const edit=document.createElement("button");
edit.innerHTML='<i class="fa-solid fa-pen"></i>';

edit.onclick=()=>{

card.innerHTML="";

// inputs
const vname=document.createElement("input");
vname.value=v.name;

const vcar=document.createElement("input");
vcar.value=v.carNumber;

// ✅ DROPDOWN (FIXED)
const vdoc=document.createElement("select");

const options=[
"Registration Certificate (Smart Card)",
"Fitness Certificate",
"Tax Token",
"Route Permit",
"Insurance Certificate",
"Others"
];

options.forEach(opt=>{
const o=document.createElement("option");
o.value=opt;
o.textContent=opt;

if(opt===v.docType) o.selected=true;

vdoc.appendChild(o);
});

// ✅ OTHER FIELD
const vdocOther=document.createElement("input");
vdocOther.placeholder="Describe Document Type";

if(!options.includes(v.docType)){
vdoc.value="Others";
vdocOther.style.display="block";
vdocOther.value=v.docType;
}else{
vdocOther.style.display="none";
}

vdoc.onchange=()=>{
vdocOther.style.display = vdoc.value==="Others" ? "block" : "none";
};

// date
const vexp=document.createElement("input");
vexp.type="date";
vexp.value=v.expiry;

// buttons
const save=document.createElement("button");
save.innerText="💾 Save";

const cancel=document.createElement("button");
cancel.innerText="❌ Cancel";

const row=document.createElement("div");
row.className="btn-row";

row.append(save,cancel);

// append all
card.append(vname,vcar,vdoc,vdocOther,vexp,row);

// SAVE
save.onclick=()=>{

fetch('/api/save-vehicle',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
key:v.key,
name:vname.value,
carNumber:vcar.value,
docType: vdoc.value==="Others" ? vdocOther.value : vdoc.value,
expiry:vexp.value
})
})
.then(()=>{

// update local UI
v.name=vname.value;
v.carNumber=vcar.value;
v.docType= vdoc.value==="Others" ? vdocOther.value : vdoc.value;
v.expiry=vexp.value;

renderVehicles(allVehicles);

});

};

// CANCEL
cancel.onclick=()=>renderVehicles(allVehicles);

};

row.append(copy,sms,whatsapp,edit);
card.appendChild(row);

div.appendChild(card);

});

}

function filterVehicles(){

const q=document.getElementById("searchVehicle").value.toLowerCase();

renderVehicles(
allVehicles.filter(v=>
(v.name||"").toLowerCase().includes(q)||
(v.carNumber||"").toLowerCase().includes(q)||
(v.docType||"").toLowerCase().includes(q)
)
);

}

</script>
`;
}

function addVehiclePage(){

return `
<br>
<h2>➕ Add Vehicle Document</h2>

<input id="vname" placeholder="Vehicle Model">
<input id="vcar" placeholder="Car Number">

<select id="vtype" onchange="toggleOtherDoc()">
<option value="">Select Document Type</option>
<option>Registration Certificate (Smart Card)</option>
<option>Fitness Certificate</option>
<option>Tax Token</option>
<option>Route Permit</option>
<option>Insurance Certificate</option>
<option value="other">Others</option>
</select>

<input id="vtypeOther" placeholder="Describe Document Type" style="display:none">

<input type="date" id="vexp">

<button onclick="save()">Save Vehicle</button>

<script>

function toggleOtherDoc(){

const sel=document.getElementById("vtype").value;
const other=document.getElementById("vtypeOther");

other.style.display = sel==="other" ? "block" : "none";

}

function save(){

fetch('/api/save-vehicle',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
name:vname.value,
carNumber:vcar.value,
docType: vtype.value==="other" ? vtypeOther.value : vtype.value,
expiry:vexp.value
})
})
.then(()=>{

alert("Vehicle Saved");
location.href="/vehicles";

});

}

</script>
`;
}

function documentsPage(){

return `<br>
<h2>📄 Business Documents</h2>

<input id="searchDoc" placeholder="Search document..." oninput="filterDocs()">

<div id="docs"></div>

<div id="viewerModal" style="
display:none;
position:fixed;
top:0;
left:0;
width:100%;
height:100%;
background:rgba(0,0,0,0.85);
z-index:9999;
justify-content:center;
align-items:center;
">

<div style="
background:#fff;
width:95%;
max-width:900px;
height:90%;
border-radius:16px;
display:flex;
flex-direction:column;
overflow:hidden;
position:relative;
">

<!-- HEADER -->
<div style="
display:flex;
justify-content:space-between;
align-items:center;
padding:10px;
background:#1e293b;
color:white;
">

<div style="font-weight:600">📄 Document Viewer</div>

<div style="display:flex;gap:6px">

<button onclick="zoomIn()" style="padding:6px 10px">+</button>
<button onclick="zoomOut()" style="padding:6px 10px">−</button>
<button onclick="resetZoom()" style="padding:6px 10px">⟳</button>

<button id="downloadBtn" style="padding:6px 10px">
<i class="fa-solid fa-download"></i>
</button>

<button onclick="closeViewer()" style="
background:#ef4444;
padding:6px 10px;
">✖</button>

</div>
</div>

<div id="viewerContent" style="
width:100%;
height:100%;
overflow:hidden;
position:relative;
touch-action:none;
background:#f1f5f9;
">

<div id="zoomWrapper" style="
position:absolute;
top:0;
left:0;
transform-origin:0 0;
">

</div>

</div>


<script>
function openViewer(key){
document.getElementById("viewerModal").style.display="flex";
document.getElementById("viewerFrame").src="/file?key="+key;
}

function closeViewer(){
document.getElementById("viewerModal").style.display="none";
document.getElementById("viewerFrame").src="";
}

const params = new URLSearchParams(window.location.search);
const highlightDoc = params.get("doc");

let allDocs=[];

fetch('/api/documents')
.then(r=>r.json())
.then(data=>{
allDocs=data||[];
renderDocs(allDocs);
});

function renderDocs(data){

const div=document.getElementById('docs');
div.innerHTML="";

const today=new Date();

data.forEach(d=>{

const exp=new Date(d.expiry);
const diff=Math.floor((exp-today)/(1000*60*60*24));

let warn="";

if(diff<=0)
warn="<div class='warn expired'>🚨 মেয়াদ শেষ</div>";
else if(diff<=30)
warn="<div class='warn w30'>⚠ "+diff+" দিন</div>";

const card=document.createElement("div");
card.className="card";

if(highlightDoc && highlightDoc === d.name){

card.style.border="3px solid #ef4444";
card.style.background="#fee2e2";
card.style.animation="flashHighlight 1s ease-in-out 3";

setTimeout(()=>{
card.scrollIntoView({
behavior:"smooth",
block:"center"
});
},200);

}

// thumbnail
let thumb="";
if(d.file){
thumb = "<img src='/file?key="+d.file+"' style='width:100%;max-height:150px;object-fit:cover;border-radius:10px;margin-bottom:10px'>";
}

const text =
"Document: "+d.name+"\\n"+
"Type: "+d.type+"\\n"+
"Number: "+d.number+"\\n"+
"Expiry: "+d.expiry;

card.innerHTML =
warn+
thumb+
"<b>"+d.name+"</b><br>"+
"Type: "+d.type+"<br>"+
"Number: "+d.number+"<br>"+
"Expiry: "+d.expiry;

// buttons
const row=document.createElement("div");
row.className="btn-row";

// copy
const copy=document.createElement("button");
copy.innerHTML='<i class="fa-solid fa-copy"></i>';
copy.onclick=()=>navigator.clipboard.writeText(text);

// sms
const sms=document.createElement("button");
sms.innerHTML='<i class="fa-solid fa-comment-sms"></i>';
sms.onclick=()=>window.location.href="sms:?body="+encodeURIComponent(text);

// whatsapp
const wa=document.createElement("button");
wa.innerHTML='<i class="fa-brands fa-square-whatsapp"></i>';
wa.onclick=()=>window.open(
"https://wa.me/?text="+encodeURIComponent(text),
"_blank"
);

// view file
if(d.file){
const view=document.createElement("button");
view.innerHTML='<i class="fa-solid fa-file"></i>';
view.onclick=()=>openViewer(d.file);
row.appendChild(view);
}
// Download file
const download=document.createElement("button");
download.innerHTML='<i class="fa-solid fa-download"></i>';
download.onclick=()=>window.open("/file?key="+d.file,"_blank");

row.appendChild(download);

// delete
const del=document.createElement("button");
del.innerHTML='<i class="fa-solid fa-trash"></i>';
del.onclick=()=>{

if(!confirm("Delete this document?")) return;

fetch('/api/delete',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({key:d.key})
})
.then(()=>renderDocs(allDocs.filter(x=>x.key!==d.key)));

};

// edit
const edit=document.createElement("button");
edit.innerHTML='<i class="fa-solid fa-pen"></i>';

edit.onclick=()=>{

card.innerHTML="";

const name=document.createElement("input");
name.value=d.name;

const number=document.createElement("input");
number.value=d.number;

const type=document.createElement("input");
type.value=d.type;

const exp=document.createElement("input");
exp.type="date";
exp.value=d.expiry;

const save=document.createElement("button");
save.innerText="💾";

const cancel=document.createElement("button");
cancel.innerText="❌";

const row2=document.createElement("div");
row2.className="btn-row";
row2.append(save,cancel);

card.append(name,number,type,exp,row2);

save.onclick=()=>{

fetch('/api/save-document',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
key:d.key,
name:name.value,
number:number.value,
type:type.value,
expiry:exp.value
})
})
.then(()=>{

d.name=name.value;
d.number=number.value;
d.type=type.value;
d.expiry=exp.value;

renderDocs(allDocs);

});

};

cancel.onclick=()=>renderDocs(allDocs);

};

row.append(copy,sms,wa,edit);
card.appendChild(row);

div.appendChild(card);

});

}

function filterDocs(){

const q=document.getElementById("searchDoc").value.toLowerCase();

renderDocs(
allDocs.filter(d=>
(d.name||"").toLowerCase().includes(q)||
(d.type||"").toLowerCase().includes(q)||
(d.number||"").toLowerCase().includes(q)
)
);

}

let scale = 1;
let posX = 0;
let posY = 0;

let startX = 0;
let startY = 0;
let startDist = 0;
let isDragging = false;

let currentFile = "";
let pdfDoc = null;

function openViewer(key){

  currentFile = key;

  document.getElementById("viewerModal").style.display="flex";

  const wrapper = document.getElementById("zoomWrapper");
  wrapper.innerHTML="";

  if(key.endsWith(".pdf")){
    loadPDF(key);
  }else{
    loadImage(key);
  }

  document.getElementById("downloadBtn").onclick = ()=>{
    window.open("/file?key="+key,"_blank");
  };

  resetZoom();
}

function closeViewer(){
  document.getElementById("viewerModal").style.display="none";
  document.getElementById("zoomWrapper").innerHTML="";
}

// IMAGE
function loadImage(key){
  const img=document.createElement("img");
  img.src="/file?key="+key;
  img.style.display="block";
  img.style.maxWidth="none";

  document.getElementById("zoomWrapper").appendChild(img);
}

// PDF
async function loadPDF(key){
  const pdf = await pdfjsLib.getDocument("/file?key="+key).promise;
  pdfDoc = pdf;
  renderPDFPage(1);
}

async function renderPDFPage(pageNum){

  const wrapper = document.getElementById("zoomWrapper");
  wrapper.innerHTML="";

  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1 });

  const canvas=document.createElement("canvas");
  const ctx=canvas.getContext("2d");

  canvas.height=viewport.height;
  canvas.width=viewport.width;

  await page.render({
    canvasContext: ctx,
    viewport: viewport
  }).promise;

  wrapper.appendChild(canvas);
}

// TRANSFORM
function updateTransform(){
  document.getElementById("zoomWrapper").style.transform =
    "translate("+posX+"px,"+posY+"px) scale("+scale+")";
}

// BUTTON ZOOM
function zoomIn(){
  scale+=0.2;
  updateTransform();
}

function zoomOut(){
  scale-=0.2;
  if(scale<0.5) scale=0.5;
  updateTransform();
}

function resetZoom(){
  scale=1;
  posX=0;
  posY=0;
  updateTransform();
}

// TOUCH SYSTEM
const container = document.getElementById("viewerContent");

container.addEventListener("touchstart",(e)=>{

  if(e.touches.length===1){
    isDragging=true;
    startX=e.touches[0].clientX-posX;
    startY=e.touches[0].clientY-posY;
  }

  if(e.touches.length===2){
    isDragging=false;

    const dx=e.touches[0].clientX-e.touches[1].clientX;
    const dy=e.touches[0].clientY-e.touches[1].clientY;

    startDist=Math.sqrt(dx*dx+dy*dy);
  }

});

container.addEventListener("touchmove",(e)=>{

  if(e.touches.length===1 && isDragging){
    posX=e.touches[0].clientX-startX;
    posY=e.touches[0].clientY-startY;
    updateTransform();
  }

  if(e.touches.length===2){

    const dx=e.touches[0].clientX-e.touches[1].clientX;
    const dy=e.touches[0].clientY-e.touches[1].clientY;

    const newDist=Math.sqrt(dx*dx+dy*dy);

    let zoom=newDist/startDist;

    scale=Math.min(Math.max(scale*zoom,0.5),5);

    startDist=newDist;

    updateTransform();
  }

},{passive:false});

container.addEventListener("touchend",()=>{
  isDragging=false;
});

</script>
`;
}

function addDocumentPage(){

return `
<h2>➕ Add Business Document</h2>

<form id="form">

<input name="name" placeholder="Document Name (e.g. Trade License)" required>

<input name="number" placeholder="Document Number">

<select name="type">
<option>NID</option>
<option>Passport</option>
<option>Driving License</option>
<option>Trade License</option>
<option>TIN Certificate</option>
<option>BIN Certificate</option>
<option>Firearms License</option>
<option>Import License</option>
<option>Export License</option>
<option>Tender (PWD/LGED/RHD) License</option>
<option>Others</option>
</select>

<input type="date" name="expiry">

<input type="file" name="file">

<button type="submit">Save Document</button>

</form>

<script>

document.getElementById("form").onsubmit=(e)=>{
e.preventDefault();

const formData=new FormData(e.target);

fetch('/api/save-document',{
method:'POST',
body:formData
})
.then(()=>{
alert("Document Saved");
location.href="/documents";
});

};

</script>
`;
}

function expiredPage(){

return `
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">

<style>

body{
font-family:Arial;
background:#f8fafc;
display:flex;
align-items:center;
justify-content:center;
height:100vh;
margin:0
}

.box{
background:white;
padding:40px;
border-radius:20px;
text-align:center;
box-shadow:0 10px 40px rgba(0,0,0,.1)
}

h2{
color:#dc2626
}

</style>

</head>

<body>

<div class="box">

<h2>⚠ দুঃখিত, সফটওয়্যার এর মেয়াদ শেষ হয়ে গেছে </h2>

<p>সফটওয়্যার পুনরায় ব্যাবহার করতে বাৎসরিক বিল পরিশোধ করে দ্রুত রিনিউ করুন</p>

</div>

</body>

</html>
`;
}

async function superAdminPage(env){

const kvLicense = await env.DATA_STORE.get("APP_LICENSE");
const staticLicense = "2026-12-31";

let expiry = kvLicense || staticLicense;

const today = new Date();
const exp = new Date(expiry);

const days = Math.floor((exp - today)/(1000*60*60*24));
const status = days < 0 ? "Expired" : "Active";

return `
<h2>🔐 Super Admin License Panel</h2>

<div class="card">
<b>Status</b><br>
${status}
</div>

<div class="card">
<b>Current Expiry</b><br>
${expiry}
</div>

<div class="card">
<b>Remaining Days</b><br>
${days}
</div>

<div class="card">

<h3>Renew License</h3>

<input type="date" id="renewDate">

<button id="renewBtn">Update License</button>

</div>

<script>

document.getElementById("renewBtn").addEventListener("click", function(){

const date = document.getElementById("renewDate").value;

if(!date){
alert("Select a date first");
return;
}

fetch('/api/set-license?master=4321',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({date})
})
.then(r=>r.json())
.then(d=>{

if(d.success){
alert("License Updated");
location.reload();
}else{
alert("Update failed");
}

})
.catch(()=>alert("Server error"));

});

</script>
`;
}

function adminPage(){

return `
<h2>Admin Panel</h2>

<label style="display:flex;gap:8px;margin-bottom:10px">
<input type="checkbox" id="liveMode" checked>
Instant update
</label>

<h3>Add Bank</h3>

<input id="btitle" placeholder="Account Title">
<input id="bname" placeholder="Bank Name">
<input id="bacc" placeholder="Account">
<input id="brout" placeholder="Routing">
<input id="bbranch" placeholder="Branch">

<button onclick="saveBank()">Save Bank</button>

<h3>Add Vehicle</h3>

<input id="vname" placeholder="Vehicle Model">
<input id="vcar" placeholder="Car Number">
<select id="vtype" onchange="toggleOtherDoc()">
<option value="">Select Document Type</option>
<option>Registration Certificate (Smart Card)</option>
<option>Fitness Certificate</option>
<option>Tax Token</option>
<option>Insurance Certificate</option>
<option value="other">Others</option>
</select>

<input id="vtypeOther" placeholder="Describe Document Type" style="display:none">
<input type="date" id="vexp">

<button onclick="saveVehicle()">Save Vehicle</button>

<h3>Delete Item</h3>

<select id="deleteSelect"></select>
<button onclick="deleteItem()">Delete Selected</button>

<h3>⚠ Delete All Data</h3>

<button onclick="deleteAll('bank:')">Delete All Banks</button>
<button onclick="deleteAll('vehicle:')">Delete All Vehicles</button>
<button onclick="deleteAll('doc:')">Delete All Documents</button>

<h3>💾 Backup System</h3>

<button onclick="createBackup()">Create Backup</button>

<div id="backupList"></div>

<script>

// ================= DELETE =================
function deleteAll(prefix){

if(!confirm("Are you sure?")) return;

fetch('/api/delete-all',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({prefix})
})
.then(()=>alert("Deleted"));

}

// ================= BACKUP =================
function createBackup(){

fetch('/api/backup')
.then(r=>r.json())
.then(()=>{
alert("Backup created");
loadBackups();
});

}

// ================= LOAD BACKUPS =================
function loadBackups(){

fetch('/api/backups')
.then(r=>r.json())
.then(list=>{

let html="";

if(!list.length){
html="<div class='card'>No backups found</div>";
}

list.forEach(b=>{

const timestamp = b.key.split("/")[1].replace(".json","");
const date = new Date(parseInt(timestamp)).toLocaleString();
const size = Math.round((b.size || 0)/1024);

html += "<div class='card'>" +
"<b>📦 Backup</b><br>" +
"Date: " + date + "<br>" +
"Size: " + size + " KB<br>" +

"<div class='btn-row'>" +

"<button class='download-btn' data-key='"+b.key+"'>⬇ Download</button>" +
"<button class='restore-btn' data-key='"+b.key+"'>♻ Restore</button>" +
"<button class='delete-btn' data-key='"+b.key+"'>🗑 Delete</button>" +

"</div>" +

"</div>";

});

document.getElementById("backupList").innerHTML=html;

setTimeout(()=>{

document.querySelectorAll(".download-btn").forEach(btn=>{
btn.onclick = ()=>{
downloadBackup(btn.dataset.key);
};
});

document.querySelectorAll(".restore-btn").forEach(btn=>{
btn.onclick = ()=>{
restoreBackup(btn.dataset.key);
};
});

document.querySelectorAll(".delete-btn").forEach(btn=>{
btn.onclick = ()=>{
deleteBackup(btn.dataset.key);
};
});

},100);

});

}

// ================= DOWNLOAD =================
function downloadBackup(key){

fetch('/file?key=' + key)
.then(r=>r.blob())
.then(blob=>{

const a=document.createElement("a");

const filename = key.split("/")[1];

a.href=URL.createObjectURL(blob);
a.download="backup-"+filename;

a.click();

});

}

// ================= RESTORE =================
function restoreBackup(key){

if(!confirm("Restore this backup?")) return;

fetch('/api/restore',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({key})
})
.then(()=>alert("Restored successfully"));

}

// ================= DELETE BACKUP =================
function deleteBackup(key){

if(!confirm("Delete this backup file?")) return;

fetch('/api/delete-backup',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({key})
})
.then(()=>{
alert("Backup deleted");
loadBackups();
});

}

// INIT
loadBackups();

</script>

<script>

loadOptions();

function saveBank(){

fetch('/api/save-bank',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
title:btitle.value,
name:bname.value,
account:bacc.value,
routing:brout.value,
branch:bbranch.value
})
})
.then(()=>{
alert("Saved");

if(document.getElementById("liveMode").checked)
location.href="/banks";

else
loadOptions();
});

}

function saveVehicle(){

fetch('/api/save-vehicle',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({
name:vname.value,
carNumber:vcar.value,
docType: vtype.value==="other" ? vtypeOther.value : vtype.value,
expiry:vexp.value
})
})
.then(()=>{
alert("Saved");

if(document.getElementById("liveMode").checked)
location.href="/vehicles";

else
loadOptions();
});

}

function loadOptions(){

Promise.all([
fetch('/api/banks').then(r=>r.json()),
fetch('/api/vehicles').then(r=>r.json())
])
.then(([banks,vehicles])=>{

const sel=document.getElementById('deleteSelect');
sel.innerHTML="";

banks.forEach(b=>{
sel.innerHTML+=\`<option value="\${b.key}">Bank - \${b.name}</option>\`;
});

vehicles.forEach(v=>{
sel.innerHTML+=\`<option value="\${v.key}">Vehicle - \${v.name}</option>\`;
});

});

}

function deleteItem(){

fetch('/api/delete',{
method:'POST',
headers:{'Content-Type':'application/json'},
body:JSON.stringify({key:deleteSelect.value})
})
.then(()=>{
alert("Deleted");
loadOptions();
});

}

</script>
`;
}
