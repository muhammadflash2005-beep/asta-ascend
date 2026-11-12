const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const ROOT = __dirname, PUB = ROOT, DBFILE = path.join(ROOT,'data.json');
const PORT = process.env.PORT || 3000;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const ORIGIN = process.env.APP_URL || '';
let db = {users:{}, sessions:{}, payments:{}};
try { db = {...db, ...JSON.parse(fs.readFileSync(DBFILE,'utf8'))}; } catch {}
function save(){ fs.writeFileSync(DBFILE, JSON.stringify(db,null,2)); }
function json(res, code, data){ res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}); res.end(JSON.stringify(data)); }
function cookie(res, token){ res.setHeader('Set-Cookie',`asta_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${process.env.NODE_ENV==='production'?'; Secure':''}`); }
function getToken(req){ return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('asta_session='))?.slice(13); }
function userFor(req){ const t=getToken(req), id=db.sessions[t]; return id ? db.users[id] : null; }
function publicUser(u){ return {id:u.id,email:u.email,name:u.name,coins:u.coins,xp:u.xp,level:u.level,rank:u.rank,stats:u.stats,focus:u.focus,levelChoice:u.levelChoice,days:u.days,createdAt:u.createdAt}; }
function body(req){ return new Promise((resolve,reject)=>{let s='';req.on('data',d=>{s+=d;if(s.length>1e6)reject(new Error('Request too large'));});req.on('end',()=>{try{resolve(s?JSON.parse(s):{});}catch{reject(new Error('Invalid JSON'));}});}); }
function rank(level){return level>=80?'S':level>=60?'A':level>=40?'B':level>=20?'C':level>=10?'D':'E';}
function levelFromXp(xp){let l=1,need=100,total=0;while(l<100&&xp>=total+need){total+=need;l++;need=100+l*35;}return l;}
function xpForNext(level){return 100+(level*35);}
function safeText(s,max=80){return String(s||'').trim().slice(0,max);}
async function api(req,res,url){
 const p=url.pathname;
 if(p==='/api/health') return json(res,200,{ok:true,app:'ASTA Ascend',payments:!!PAYSTACK_SECRET});
 if(p==='/api/register'&&req.method==='POST'){
  const b=await body(req), email=safeText(b.email,160).toLowerCase(), name=safeText(b.name,50), password=String(b.password||'');
  if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8||!name) return json(res,400,{error:'Enter a valid email, name and password of at least 8 characters.'});
  if(Object.values(db.users).some(u=>u.email===email)) return json(res,409,{error:'An account with this email already exists.'});
  const id=crypto.randomUUID(), salt=crypto.randomBytes(16).toString('hex'), hash=crypto.scryptSync(password,salt,64).toString('hex');
  const u={id,email,name,salt,hash,coins:0,xp:0,level:1,rank:'E',stats:{strength:1,endurance:1,agility:1,discipline:1},focus:['Full Body'],levelChoice:'Beginner',days:3,logs:[],schedule:{},favorites:[],createdAt:new Date().toISOString(),reminders:{}};
  db.users[id]=u; const token=crypto.randomBytes(32).toString('hex');db.sessions[token]=id;save();cookie(res,token);return json(res,201,{user:publicUser(u)});
 }
 if(p==='/api/login'&&req.method==='POST'){
  const b=await body(req), email=safeText(b.email,160).toLowerCase(), u=Object.values(db.users).find(x=>x.email===email);
  if(!u||crypto.scryptSync(String(b.password||''),u.salt,64).toString('hex')!==u.hash) return json(res,401,{error:'Incorrect email or password.'});
  const token=crypto.randomBytes(32).toString('hex');db.sessions[token]=u.id;save();cookie(res,token);return json(res,200,{user:publicUser(u)});
 }
 if(p==='/api/logout'&&req.method==='POST'){const t=getToken(req);delete db.sessions[t];save();res.setHeader('Set-Cookie','asta_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 const u=userFor(req);
 if(p.startsWith('/api/')&&!u) return json(res,401,{error:'Please sign in.'});
 if(p==='/api/me') return json(res,200,{user:publicUser(u),logs:u.logs,schedule:u.schedule,favorites:u.favorites,reminders:u.reminders});
 if(p==='/api/profile'&&req.method==='PATCH'){
  const b=await body(req);if(Array.isArray(b.focus)&&b.focus.length){u.focus=b.focus.slice(0,6);u.levelChoice=['Beginner','Intermediate','Advanced'].includes(b.levelChoice)?b.levelChoice:'Beginner';u.days=Math.max(1,Math.min(7,Number(b.days)||3));}
  if(b.reminders)u.reminders=b.reminders;save();return json(res,200,{user:publicUser(u)});
 }
 if(p==='/api/favorites'&&req.method==='POST'){const b=await body(req);const id=safeText(b.exerciseId,80);u.favorites=u.favorites.includes(id)?u.favorites.filter(x=>x!==id):[...u.favorites,id];save();return json(res,200,{favorites:u.favorites});}
 if(p==='/api/log'&&req.method==='POST'){
  const b=await body(req);const xp=Math.max(0,Math.min(2000,Number(b.xp)||0)), coins=Math.max(0,Math.min(500,Number(b.coins)||0));
  const log={id:crypto.randomUUID(),date:safeText(b.date,10)||new Date().toISOString().slice(0,10),focus:safeText(b.focus,40),exercises:Array.isArray(b.exercises)?b.exercises.slice(0,30):[],xp,coins,notes:safeText(b.notes,500),duration:Number(b.duration)||0,completedAt:new Date().toISOString()};
  u.logs.push(log);u.xp+=xp;u.coins+=coins;const old=u.level;u.level=levelFromXp(u.xp);u.rank=rank(u.level);
  const f=(log.focus||'').toLowerCase();if(f.includes('leg'))u.stats.strength++;else if(f.includes('core'))u.stats.discipline++;else if(f.includes('back'))u.stats.endurance++;else u.stats.agility++;if(u.level>old)u.coins+=u.level-old>=5?100:25;
  save();return json(res,201,{log,user:publicUser(u),levelUp:u.level>old});
 }
 if(p==='/api/schedule'&&req.method==='PATCH'){const b=await body(req);u.schedule=b.schedule||{};save();return json(res,200,{schedule:u.schedule});}
 if(p==='/api/delete-account'&&req.method==='POST'){const t=getToken(req);delete db.sessions[t];delete db.users[u.id];save();res.setHeader('Set-Cookie','asta_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 if(p==='/api/payments/initialize'&&req.method==='POST'){
  if(!PAYSTACK_SECRET)return json(res,503,{error:'Payments are not configured yet. Add PAYSTACK_SECRET_KEY on the server.'});
  const b=await body(req), packs={500:50000,1000:100000,2500:250000,5000:500000}, amount=packs[Number(b.amount)];if(!amount)return json(res,400,{error:'Invalid coin pack.'});
  const reference='ASTA_'+crypto.randomBytes(12).toString('hex');
  const r=await fetch('https://api.paystack.co/transaction/initialize',{method:'POST',headers:{Authorization:`Bearer ${PAYSTACK_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({email:u.email,amount,reference,callback_url:(ORIGIN||`${url.protocol}//${url.host}`)+'/payment-return',metadata:{userId:u.id,coins:Number(b.amount)}})});const d=await r.json();if(!r.ok||!d.status)return json(res,502,{error:d.message||'Could not initialize payment.'});db.payments[reference]={userId:u.id,coins:Number(b.amount),amount,status:'initialized'};save();return json(res,200,{url:d.data.authorization_url,reference});
 }
 if(p==='/api/payments/verify'&&req.method==='POST'){
  if(!PAYSTACK_SECRET)return json(res,503,{error:'Payments are not configured.'});const b=await body(req),ref=safeText(b.reference,100),pay=db.payments[ref];if(!pay||pay.userId!==u.id)return json(res,404,{error:'Payment reference not found.'});if(pay.status==='success')return json(res,200,{ok:true,user:publicUser(u),credited:true});
  const r=await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(ref)}`,{headers:{Authorization:`Bearer ${PAYSTACK_SECRET}`}});const d=await r.json();if(!r.ok||!d.status||d.data.status!=='success'||d.data.amount!==pay.amount||d.data.currency!=='NGN')return json(res,400,{error:'Payment has not been verified as successful.'});
  pay.status='success';pay.verifiedAt=new Date().toISOString();u.coins+=pay.coins;save();return json(res,200,{ok:true,user:publicUser(u),credited:true});
 }
 return json(res,404,{error:'Not found'});
}
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname.startsWith('/api/'))return await api(req,res,url);let file=path.join(PUB,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname));if(!file.startsWith(PUB))return json(res,403,{error:'Forbidden'});if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(PUB,'index.html');res.writeHead(200,{'Content-Type':(mime[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);}catch(e){json(res,500,{error:e.message||'Server error'});}});
server.listen(PORT,()=>console.log(`ASTA Ascend running on ${PORT}`));
