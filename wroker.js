const TELEGRAM_BOT = "8757155296:AAHbLEz15Gp4ccaV0OUpB8oPHwZdJsv-O0s";
const TELEGRAM_CHAT = "-1003310956167";

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
  const MASTER_KEY = "4321";

    // License systems
  const LICENSE_EXPIRE = "2026-12-31";   // Static date license
  const USE_KV_LICENSE = true;           // Enable KV license system

  const cookie = request.headers.get("Cookie") || "";
  const loggedIn = cookie.includes("auth=1");
  
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

  if (url.pathname === "/api/save-vehicle" && request.method === "POST") {

    const data = await request.json();
    await env.DATA_STORE.put("vehicle:"+Date.now(),JSON.stringify(data));

    return Response.json({success:true});
  }

  if (url.pathname === "/api/delete" && request.method === "POST") {

    const data = await request.json();
    await env.DATA_STORE.delete(data.key);

    return Response.json({success:true});
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
<button onclick="location.href='/vehicles'">🚗 Vehicles</button>

<hr>

<button onclick="location.href='/add-bank'">➕ Add Bank</button>
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

location.href="/vehicles?car="+encodeURIComponent(car)+"&doc="+encodeURIComponent(doc);

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

row.append(copy,sms,whatsapp);
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
