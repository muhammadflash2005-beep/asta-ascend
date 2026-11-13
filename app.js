let countdownInterval = null;
let workoutTimerInterval = null;
let workoutStartedAt = null;
const $=s=>document.querySelector(s), app=$('#app');let state={user:null,logs:[],schedule:{},favorites:[],page:'home',me:null,workout:[],step:0,filter:'All',search:'',selectedDay:null};
const groups={Forearms:['Wrist Curl','Reverse Wrist Curl','Fist Squeeze','Finger Extension','Palm Pulse','Knuckle Push-up'],Back:['Superman Hold','Reverse Snow Angel','Prone Y Raise','Cobra Lift','Bird Dog','Swimmers'],Core:['Crunch','Reverse Crunch','Plank','Dead Bug','Bicycle Crunch','Mountain Climber'],Legs:['Bodyweight Squat','Reverse Lunge','Glute Bridge','Calf Raise','Wall Sit','Squat Pulse'],Chest:['Push-up','Knee Push-up','Wide Push-up','Incline Push-up','Diamond Push-up','Pike Push-up'],FullBody:['Burpee','Jumping Jack','Bear Crawl','Inchworm','High Knees','Squat Thrust']};
const muscles={Forearms:'Forearm flexors and extensors',Back:'Back and spinal stabilizers',Core:'Abdominals and deep core',Legs:'Quadriceps, glutes and calves',Chest:'Pectorals, triceps and shoulders',FullBody:'Full-body conditioning'};
const cues=['Keep your movement controlled.','Brace your core and breathe steadily.','Keep your joints aligned.','Stop if you feel sharp pain.','Use a comfortable range of motion.','Avoid rushing the lowering phase.'];
const db={};Object.entries(groups).forEach(([g,names])=>names.forEach((name,i)=>{let easy=['Knee Push-up','Incline Push-up','Bird Dog','Glute Bridge','Wall Sit','Dead Bug'].includes(name);db[name]={id:name.toLowerCase().replaceAll(' ','-'),name,group:g,muscle:muscles[g],difficulty:i<2?'Beginner':i<4?'Intermediate':'Advanced',sets:3,reps:g==='Core'||name.includes('Hold')||name==='Wall Sit'?'30 sec':String(8+i*2),rest:45+i*5,steps:[`Start in a stable, comfortable position for ${name.toLowerCase()}.`,`Engage the target muscles and move slowly through the exercise.`,`Pause briefly at the strongest point without holding your breath.`,`Return with control and repeat for the prescribed reps.`],breathing:'Exhale during the effort; inhale as you return.',mistakes:['Rushing the movement','Holding your breath','Allowing the lower back to arch','Using momentum instead of muscle control'],easier:easy?'Reduce the range of motion and slow down.':`Try a smaller range or fewer repetitions of ${name}.`,harder:`Increase reps gradually or use a slower 3-second lowering phase.`,safety:'Train on a stable, non-slip surface. Stop if you feel sharp pain, dizziness or unusual shortness of breath.'};}));
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function api(path,opts={}){let r=await fetch('/api'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json',...(opts.headers||{})},...opts});let d=await r.json();if(!r.ok)throw Error(d.error||'Request failed');return d;}
function toast(s){let e=document.createElement('div');e.className='toast';e.textContent=s;document.body.append(e);setTimeout(()=>e.remove(),2600)}
function xpNext(){return 100+state.user.level*35}function rank(l){return l>=80?'S':l>=60?'A':l>=40?'B':l>=20?'C':l>=10?'D':'E'}
function svgFigure(name,wrong=false){let seed=[...name].reduce((a,c)=>a+c.charCodeAt(0),0), lean=seed%2?1:-1;return `<svg viewBox="0 0 220 150" role="img" aria-label="${esc(name)} posture illustration"><defs><filter id="glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><path d="M10 132H210" stroke="#3b2730"/><g stroke="${wrong?'#ed1639':'#f4f1f2'}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"><circle cx="${wrong?83:70}" cy="27" r="9" fill="#111"/><path d="M70 38 L${70+lean*8} 75 L${70+lean*25} 96 M${70+lean*8} 75 L${70-lean*16} 104 M${70+lean*8} 52 L${45+lean*10} 72 L${34+lean*10} 60 M${70+lean*8} 52 L${96+lean*10} 70 L${110+lean*10} 58"/><path d="M${70+lean*25} 96 L${100+lean*24} 128 M${70-lean*16} 104 L${52-lean*18} 130"/><path d="M${70+lean*3} 55 L${70+lean*3} 72" stroke="#ed1639" stroke-width="9"/></g><g fill="#ff536e" font-size="9" font-family="Arial"><text x="120" y="26">${wrong?'WRONG FORM':'TARGET MUSCLE'}</text><text x="120" y="39">${wrong?'Avoid this position':'Engage + control'}</text><path d="M118 44L91 63" stroke="#ed1639" fill="none"/></g>${wrong?'<path d="M166 78l24 24m0-24-24 24" stroke="#ed1639" stroke-width="7"/>':'<path d="M155 83l18 0m-6-6 6 6-6 6" stroke="#ed1639" stroke-width="3" fill="none"/>'}</svg>`;}
function nav(){return `<nav class="nav">${[['home','⌂','Home'],['library','▤','Exercises'],['calendar','▦','Calendar'],['progress','↗','Progress'],['shop','◈','Shop'],['profile','⚙','Profile']].map(([p,i,t])=>`<button class="${state.page===p?'active':''}" onclick="go('${p}')"><span>${i}</span>${t}</button>`).join('')}</nav>`}
function shell(content){app.innerHTML=`<div class="shell"><header class="top"><div class="brand">ASTA <b>ASCEND</b></div><div class="player"><strong>${esc(state.user.name)}</strong><br>RANK ${state.user.rank} · LV ${state.user.level} · ◈ ${state.user.coins}</div></header>${content}</div>${nav()}`;}
function home(){let today=new Date().toISOString().slice(0,10),todayLogs=state.logs.filter(x=>x.date===today),focus=state.user.focus[0]||'Full Body',routine=makeRoutine();return `<section class="panel hero"><div class="eyebrow">[ SYSTEM ONLINE ] PLAYER DETECTED</div><div class="h1">YOUR ASCENSION<br>STARTS NOW.</div><p class="muted">Every rep brings you closer to your next rank.</p><div class="row between"><b>LEVEL ${state.user.level} · RANK ${state.user.rank}</b><span class="small">${state.user.xp} / ${xpNext()} XP</span></div><div class="bar"><i style="width:${Math.min(100,state.user.xp/xpNext()*100)}%"></i></div><div class="grid"><div class="stat"><b>${streak()}</b><small>DAY STREAK 🔥</small></div><div class="stat"><b>${state.logs.length}</b><small>QUESTS CLEARED</small></div><div class="stat"><b>${state.user.coins}</b><small>ASTA COINS</small></div><div class="stat"><b>${state.user.rank}</b><small>PLAYER RANK</small></div></div></section><div class="layout"><div><section class="panel quest"><div class="eyebrow">[ DAILY QUEST ] ${today}</div><h2 class="section-title">${todayLogs.length?'Quest already cleared':'Your '+focus+' quest'}</h2><p class="muted">${routine.length} exercises · ${state.user.levelChoice} · No equipment</p>${routine.slice(0,4).map(x=>`<div class="row between"><span>${esc(x.name)}</span><span class="small">${x.sets} × ${x.reps}</span></div>`).join('')}<div class="row" style="margin-top:15px"><button class="btn" onclick="startWorkout()">${todayLogs.length?'Train again':'START DAILY QUEST'}</button><button class="btn secondary" onclick="go('setup')">Edit routine</button></div></section><section class="panel"><div class="eyebrow">[ WEEKLY DIRECTIVE ]</div><div class="row between"><b>This week</b><span class="small">${weekCount()} / ${state.user.days} sessions</span></div><div class="bar"><i style="width:${Math.min(100,weekCount()/state.user.days*100)}%"></i></div><p class="small">Consistency is built one quest at a time.</p></section></div><aside><section class="panel"><div class="eyebrow">PLAYER ATTRIBUTES</div>${Object.entries(state.user.stats).map(([k,v])=>`<div class="row between"><span>${k[0].toUpperCase()+k.slice(1)}</span><b>${v}</b></div><div class="bar"><i style="width:${Math.min(100,v*4)}%"></i></div>`).join('')}</section><section class="panel"><div class="eyebrow">SYSTEM MESSAGE</div><p>Player, your daily quest is waiting. Train with discipline. Rise without limits.</p><button class="btn secondary" onclick="go('setup')">CHOOSE YOUR FOCUS</button></section></aside></div>`;}
function makeRoutine(){let f=state.user.focus.includes('Full Body')?['Full Body']:state.user.focus;let names=f.flatMap(g=>groups[g]||[]);let count=state.user.levelChoice==='Beginner'?3:state.user.levelChoice==='Intermediate'?4:5;return names.slice(0,count).map(n=>({...db[n],sets:state.user.levelChoice==='Beginner'?2:3,reps:state.user.levelChoice==='Beginner'?'8-10':state.user.levelChoice==='Intermediate'?'10-14':'12-18'}));}
function streak(){let days=new Set(state.logs.map(x=>x.date));let n=0,d=new Date();while(days.has(d.toISOString().slice(0,10))){n++;d.setDate(d.getDate()-1);}return n;}
function weekCount(){let d=new Date(),day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);let start=d.toISOString().slice(0,10);return new Set(state.logs.filter(x=>x.date>=start).map(x=>x.date)).size;}
function setup(){return `<section class="panel"><div class="eyebrow">[ PLAYER CONFIGURATION ]</div><h1 class="h1">CHOOSE YOUR FOCUS</h1><p class="muted">Select one or more areas. Your routine regenerates automatically.</p><div id="focuses" class="row">${Object.keys(groups).map(g=>`<button class="chip ${state.user.focus.includes(g)?'selected':''}" onclick="toggleFocus('${g}',this)">${g}</button>`).join('')}</div><div class="field"><label>TRAINING LEVEL</label><select id="level"><option ${state.user.levelChoice==='Beginner'?'selected':''}>Beginner</option><option ${state.user.levelChoice==='Intermediate'?'selected':''}>Intermediate</option><option ${state.user.levelChoice==='Advanced'?'selected':''}>Advanced</option></select></div><div class="field"><label>WORKOUT DAYS PER WEEK</label><select id="days">${[1,2,3,4,5,6,7].map(x=>`<option ${state.user.days===x?'selected':''}>${x}</option>`).join('')}</select></div><button class="btn" onclick="saveSetup()">GENERATE MY ROUTINE</button></section><section class="panel"><div class="eyebrow">GENERATED ROUTINE PREVIEW</div>${makeRoutine().map(x=>`<div class="row between"><span>${x.name}</span><span class="small">${x.sets} sets · ${x.reps} · ${x.rest}s rest</span></div>`).join('')}</section>`;}
function toggleFocus(g,el){let f=state.user.focus.slice();if(g==='Full Body')f=f.includes(g)?[]:[g];else{f=f.filter(x=>x!=='Full Body');f=f.includes(g)?f.filter(x=>x!==g):[...f,g];}if(!f.length)f=['Full Body'];state.user.focus=f;$('#focuses').innerHTML=Object.keys(groups).map(x=>`<button class="chip ${f.includes(x)?'selected':''}" onclick="toggleFocus('${x}',this)">${x}</button>`).join('');}
async function saveSetup(){state.user.levelChoice=$('#level').value;state.user.days=Number($('#days').value);await api('/profile',{method:'PATCH',body:JSON.stringify({focus:state.user.focus,levelChoice:state.user.levelChoice,days:state.user.days})});toast('[SYSTEM] Routine regenerated');go('home');}
function library(){let all=Object.values(db).filter(x=>(state.filter==='All'||x.group===state.filter)&&(x.name.toLowerCase().includes(state.search.toLowerCase())||x.muscle.toLowerCase().includes(state.search.toLowerCase())));return `<div class="eyebrow">[ COMBAT DATABASE ]</div><h1 class="h1">EXERCISE LIBRARY</h1><div class="field"><input placeholder="Search exercises or muscles..." value="${esc(state.search)}" oninput="state.search=this.value;render()"></div><div class="tabs">${['All',...Object.keys(groups)].map(g=>`<button class="chip ${state.filter===g?'selected':''}" onclick="state.filter='${g}';render()">${g}</button>`).join('')}</div><section class="panel">${all.map(x=>`<div class="exercise"><div class="thumb">${svgFigure(x.name)}</div><div style="flex:1"><h3>${esc(x.name)}</h3><p>${x.group} · ${x.difficulty}</p><span class="tag">${x.sets} sets · ${x.reps}</span></div><button class="btn ghost" onclick="detail('${x.id}')">VIEW</button></div>`).join('')||'<p>No matching exercises.</p>'}</section>`;}
function detail(id){let x=Object.values(db).find(e=>e.id===id);if(!x)return;modal(`<div class="eyebrow">EXERCISE DATA</div><h2>${x.name}</h2><p class="muted">${x.muscle} · ${x.difficulty}</p><div class="figure">${svgFigure(x.name)}</div><h3>Starting posture</h3><p>Set your body in a stable position, keep your spine neutral and brace your core.</p><h3>Step-by-step form</h3><ol>${x.steps.map(s=>`<li>${s}</li>`).join('')}</ol><h3>Breathing</h3><p>${x.breathing}</p><h3>Common mistakes</h3><ul>${x.mistakes.map(s=>`<li>${s}</li>`).join('')}</ul><div class="figure">${svgFigure(x.name,true)}</div><h3>Easier variation</h3><p>${x.easier}</p><h3>Harder variation</h3><p>${x.harder}</p><p class="notice">Safety: ${x.safety}</p><p class="small">Suggested: ${x.sets} sets · ${x.reps} · ${x.rest}s rest</p><button class="btn secondary" onclick="favorite('${x.id}')">${state.favorites.includes(x.id)?'★ Remove favorite':'☆ Add favorite'}</button>`);}
async function favorite(id){let d=await api('/favorites',{method:'POST',body:JSON.stringify({exerciseId:id})});state.favorites=d.favorites;toast('Favorites updated');}
function startWorkout(){
  state.workout=makeRoutine();
  state.step=0;
  state.done=[];
  state.page='prestart';
  render();
}
function player(){let x=state.workout[state.step];if(!x)return `<section class="panel"><div class="eyebrow">[ QUEST COMPLETE ]</div><h1 class="h1">WELL DONE, PLAYER.</h1><p>You completed ${state.done.length} exercises.</p><button class="btn" onclick="finishWorkout()">CLAIM REWARDS</button></section>`;return `<section class="panel"><div class="row between"><span class="eyebrow">[ GUIDED QUEST ]</span><span class="small">${state.step+1} / ${state.workout.length}</span></div><div class="bar"><i style="width:${(state.step+1)/state.workout.length*100}%"></i></div><h1 class="h1">${x.name.toUpperCase()}</h1><p class="muted">${x.group} · ${x.sets} sets · ${x.reps} reps</p><div class="figure" id="workout3d"></div><p class="notice">FORM CUE: ${cues[state.step%cues.length]}</p><div class="grid"><div class="stat"><b id="setcount">1/${x.sets}</b><small>SET</small></div><div class="stat"><b>${x.reps}</b><small>TARGET</small></div><div class="stat"><b>${x.rest}s</b><small>REST</small></div><div class="stat"><b id="timer">00:00</b><small>WORKOUT TIME</small></div></div><div class="row" style="margin-top:15px"><button class="btn secondary" onclick="prevStep()">PREVIOUS</button><button class="btn secondary" onclick="skipStep()">SKIP</button><button class="btn" onclick="nextStep()">${state.step===state.workout.length-1?'FINISH':'NEXT'}</button></div><button class="btn ghost" style="margin-top:9px" onclick="swapExercise()">SWAP FOR EASIER VARIATION</button></section>`;}
function nextStep(){let x=state.workout[state.step];state.done.push({name:x.name,sets:x.sets,reps:x.reps});state.step++;render();}function prevStep(){state.step=Math.max(0,state.step-1);render()}function skipStep(){state.step++;render()}function swapExercise(){let x=state.workout[state.step],alts=groups[x.group].filter(n=>n!==x.name);state.workout[state.step]={...db[alts[0]],sets:2};render();toast('Exercise swapped');}
clearInterval(workoutTimerInterval);
clearInterval(countdownInterval);
if(window.speechSynthesis)window.speechSynthesis.cancel();let n=state.done.length,xp=50+n*20,coins=10+n*2;let d=await api('/log',{method:'POST',body:JSON.stringify({focus:state.user.focus.join(', '),xp,coins,exercises:state.done,duration:Math.max(1,Math.ceil((Date.now()-workoutStartedAt)/60000)),notes:'Quest completed in ASTA Ascend.'})});state.user=d.user;state.logs.push(d.log);state.page='home';render();modal(`<div class="eyebrow">[ SYSTEM ] QUEST COMPLETE</div><div class="large">+${xp} XP</div><h2>+${coins} ASTA COINS</h2><p>${n} exercises cleared. Your discipline grows stronger.</p>${d.levelUp?'<h2 class="large">[ SYSTEM ] LEVEL UP!</h2>':''}<button class="btn" onclick="closeModal()">CONTINUE</button>`);}
function calendar(){let now=new Date(),y=now.getFullYear(),m=now.getMonth(),first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),logs=new Set(state.logs.map(x=>x.date));return `<div class="eyebrow">[ PLAYER RECORD ]</div><h1 class="h1">TRAINING CALENDAR</h1><section class="panel"><div class="row between"><b>${now.toLocaleString('default',{month:'long',year:'numeric'})}</b><span class="tag">🔥 ${streak()} day streak</span></div><div class="calendar">${['S','M','T','W','T','F','S'].map(x=>`<div class="small" style="text-align:center;padding:7px">${x}</div>`).join('')}${Array(first).fill('<div></div>').join('')}${Array.from({length:days},(_,i)=>{let d=i+1,key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,done=logs.has(key);return `<button class="day ${done?'done':''} ${d===now.getDate()?'today':''}" onclick="showDay('${key}')">${d}${done?' ✓':''}</button>`}).join('')}</div><div class="row" style="margin-top:12px"><span class="tag">✓ Completed</span><span class="tag">○ Upcoming</span><span class="tag">× Missed</span></div></section><section class="panel"><div class="eyebrow">RECENT QUESTS</div>${state.logs.slice(-8).reverse().map(l=>`<div class="row between" style="padding:8px 0;border-bottom:1px solid #29232a"><span>${l.date} · ${esc(l.focus)}</span><b>+${l.xp} XP</b></div>`).join('')||'<p class="muted">No quests recorded yet.</p>'}</section>`;}
function showDay(date){let l=state.logs.filter(x=>x.date===date);modal(`<div class="eyebrow">PLAYER RECORD · ${date}</div>${l.length?l.map(x=>`<h3>${esc(x.focus)}</h3><p>+${x.xp} XP · ${x.coins} coins · ${x.duration} min</p><ul>${x.exercises.map(e=>`<li>${esc(e.name)} — ${e.sets} × ${e.reps}</li>`).join('')}</ul><p>${esc(x.notes)}</p>`).join(''):'<p>No completed quest recorded for this day.</p>'}`);}
function progress(){let total=state.logs.reduce((a,x)=>a+x.xp,0),sessions=state.logs.length;return `<div class="eyebrow">[ PLAYER ANALYTICS ]</div><h1 class="h1">PROGRESS</h1><div class="grid"><div class="stat"><b>${sessions}</b><small>QUESTS CLEARED</small></div><div class="stat"><b>${total}</b><small>XP EARNED</small></div><div class="stat"><b>${streak()}</b><small>CURRENT STREAK</small></div><div class="stat"><b>${state.user.level}</b><small>PLAYER LEVEL</small></div></div><section class="panel"><div class="eyebrow">WEEKLY SYSTEM REPORT</div><p>Sessions completed: <b>${weekCount()}</b></p><p>XP gained: <b>${state.logs.filter(x=>{let d=new Date();d.setDate(d.getDate()-7);return x.date>=d.toISOString().slice(0,10)}).reduce((a,x)=>a+x.xp,0)}</b></p><p>Best focus: <b>${topFocus()}</b></p><p>Rank: <b>${state.user.rank}</b></p></section><section class="panel"><div class="eyebrow">ATTRIBUTE GROWTH</div>${Object.entries(state.user.stats).map(([k,v])=>`<p>${k.toUpperCase()} <b style="float:right">${v}</b></p><div class="bar"><i style="width:${Math.min(100,v*4)}%"></i></div>`).join('')}</section>`;}
function topFocus(){let c={};state.logs.forEach(x=>c[x.focus]=(c[x.focus]||0)+1);return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0]||'Not determined';}
const packs=[{n:500,c:500},{n:1000,c:1000},{n:2500,c:2500},{n:5000,c:5000}];function shop(){return `<div class="eyebrow">[ SYSTEM EXCHANGE ]</div><h1 class="h1">ASTA SHOP</h1><section class="panel hero"><div class="eyebrow">YOUR BALANCE</div><div class="large">◈ ${state.user.coins}</div><p class="muted">ASTA Coins</p></section><div class="notice">Payments are processed securely through Paystack. Purchases are disabled until the owner configures merchant credentials on the server.</div><h2 class="section-title">COIN PACKS · NGN</h2><div class="grid">${packs.map(p=>`<div class="panel"><b>◈ ${p.c.toLocaleString()} COINS</b><p class="muted">₦${p.n.toLocaleString()}</p><button class="btn secondary" onclick="buy(${p.n})">BUY PACK</button></div>`).join('')}</div><h2 class="section-title">PREMIUM UNLOCKS</h2>${[['Custom routine builder',300],['30-day challenge pack',250],['Detailed analytics',200],['Ad-free mode',150],['Streak protection pass',100],['Double XP boost',250]].map(([n,c])=>`<div class="panel row between"><span>${n}</span><button class="btn secondary" onclick="spend(${c},'${n}')">◈ ${c}</button></div>`).join('')}<p class="small">No paid feature is required for the core workout experience. Transaction verification is performed server-side.</p>`;}
async function buy(n){try{let d=await api('/payments/initialize',{method:'POST',body:JSON.stringify({amount:n})});location.href=d.url;}catch(e){toast(e.message)}}function spend(c,n){if(state.user.coins<c)return toast('Not enough ASTA Coins');toast('Shop unlocks are not yet configured for this account. No coins were deducted.');}
function profile(){return `<div class="eyebrow">[ PLAYER SETTINGS ]</div><h1 class="h1">ACCOUNT</h1><section class="panel"><h3>${esc(state.user.name)}</h3><p class="muted">${esc(state.user.email)}</p><p>Level ${state.user.level} · Rank ${state.user.rank}</p><button class="btn secondary" onclick="go('setup')">Edit training focus</button></section><section class="panel"><div class="eyebrow">REMINDERS</div><p class="muted">Set a daily local reminder. Notifications work while the app is open; background push requires a push-service setup.</p><div class="field"><label>REMINDER TIME</label><input id="remindtime" type="time" value="${state.me.reminders?.time||'18:00'}"></div><button class="btn secondary" onclick="setReminder()">SAVE REMINDER</button></section><section class="panel"><div class="eyebrow">LEGAL</div><button class="btn ghost" onclick="legal('Privacy Policy')">Privacy Policy</button> <button class="btn ghost" onclick="legal('Terms of Use')">Terms of Use</button></section><section class="panel"><button class="btn secondary" onclick="logout()">LOG OUT</button> <button class="btn ghost" onclick="deleteAccount()">DELETE ACCOUNT & DATA</button></section>`;}
async function setReminder(){let t=$('#remindtime').value;if(!t)return;if(!('Notification'in window))return toast('Notifications are not supported by this browser.');let perm=await Notification.requestPermission();if(perm!=='granted')return toast('Notification permission not granted.');await api('/profile',{method:'PATCH',body:JSON.stringify({reminders:{time:t}})});state.me.reminders={time:t};toast('Reminder saved');scheduleReminder(t);}
function scheduleReminder(t){let [h,m]=t.split(':').map(Number),now=new Date(),at=new Date();at.setHours(h,m,0,0);if(at<=now)at.setDate(at.getDate()+1);setTimeout(()=>{new Notification('[SYSTEM] Daily Quest',{body:`${state.user.name}, your daily quest is waiting.`});scheduleReminder(t)},at-now);}
function legal(n){modal(`<div class="eyebrow">ASTA ASCEND</div><h2>${n}</h2><p>ASTA Ascend stores account details and workout logs to provide saved progress. Passwords are stored as salted password hashes. Payment card details are handled by Paystack and are not stored by ASTA Ascend.</p><p>Workout information is educational and is not medical advice. Train within your ability and stop if you experience pain or dizziness.</p><p>You may delete your account and associated app data from Account settings. Contact the app operator for privacy or data requests.</p><p>Use the app responsibly. Virtual coins have no cash value and are not redeemable for money.</p>`);}
function modal(html){let old=$('.modal');if(old)old.remove();let e=document.createElement('div');e.className='modal';e.innerHTML=`<div class="modalbox"><button class="btn ghost" style="float:right" onclick="closeModal()">✕</button>${html}</div>`;document.body.append(e);}function closeModal(){$('.modal')?.remove();}
async function deleteAccount(){if(!confirm('Permanently delete your account and workout history?'))return;await api('/delete-account',{method:'POST'});state.user=null;auth();}async function logout(){await api('/logout',{method:'POST'});state.user=null;auth();}
function go(p){state.page=p;render()}function render(){
if(!state.user)return auth();
let content=({home,setup,library,calendar,progress,shop,profile,player,prestart,countdown})[state.page]||home;
shell(content());
if(state.page==='player'){
let exercise=state.workout[state.step];
let host=document.getElementById('workout3d');
if(exercise&&host&&window.ASTAWorkout3D)window.ASTAWorkout3D.mount(host,exercise.name);
}
}
function auth(){app.innerHTML=`<div class="auth"><div class="brand">ASTA <b>ASCEND</b></div><section class="panel hero"><div class="eyebrow">[ SYSTEM INITIALIZATION ]</div><h1 class="h1">ARISE, PLAYER.</h1><p class="muted">Build strength. Complete quests. Ascend through the ranks.</p><div class="tabs"><button class="chip selected" id="tablogin" onclick="authMode('login')">LOGIN</button><button class="chip" id="tabreg" onclick="authMode('register')">CREATE ACCOUNT</button></div><form id="authform"><div id="namefield" class="field hide"><label>PLAYER NAME</label><input name="name" autocomplete="name"></div><div class="field"><label>EMAIL</label><input name="email" type="email" required autocomplete="email"></div><div class="field"><label>PASSWORD (8+ CHARACTERS)</label><input name="password" type="password" required minlength="8" autocomplete="current-password"></div><button class="btn" style="width:100%" id="authbtn">ENTER SYSTEM</button><p class="small" id="autherror"></p></form></section><p class="small">Free to begin · No equipment required · Your progress is saved</p></div>`;window.authMode=authMode;authMode('login');}
let mode='login';function authMode(m){mode=m;$('#namefield').classList.toggle('hide',m==='login');$('#authbtn').textContent=m==='login'?'ENTER SYSTEM':'CREATE PLAYER';$('#tablogin').classList.toggle('selected',m==='login');$('#tabreg').classList.toggle('selected',m==='register');$('#authform').onsubmit=async e=>{e.preventDefault();let f=new FormData(e.target),payload=Object.fromEntries(f.entries());try{let d=await api(m==='login'?'/login':'/register',{method:'POST',body:JSON.stringify(payload)});await loadMe(d.user);toast('[SYSTEM] Player authenticated');}catch(err){$('#autherror').textContent=err.message;}};}
async function loadMe(user){state.user=user;let d=await api('/me');state.me=d;state.user=d.user;state.logs=d.logs||[];state.schedule=d.schedule||{};state.favorites=d.favorites||[];state.page='home';render();if(d.reminders?.time)scheduleReminder(d.reminders.time);}
async function init(){if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});try{let d=await api('/me');await loadMe(d.user);const ref=new URLSearchParams(location.search).get('reference');if(ref){try{let paid=await api('/payments/verify',{method:'POST',body:JSON.stringify({reference:ref})});state.user=paid.user;toast('[SYSTEM] Payment verified · Coins credited');history.replaceState({},'', '/');render();}catch(e){toast(e.message);}}}catch{auth();}}
init();
function workoutVoices(){
  return window.speechSynthesis
    ? window.speechSynthesis.getVoices()
    : [];
}

function prestart(){
  const voices=workoutVoices();
  const selected=localStorage.getItem('astaWorkoutVoice')||'default';

  return `<section class="panel">
    <div class="eyebrow">[ WORKOUT PREPARATION ]</div>
    <h1 class="h1">GET READY, PLAYER.</h1>
    <p class="muted">Your workout begins with a 5-second countdown.</p>

    <div class="field">
      <label>COUNTDOWN VOICE</label>
      <select id="workoutVoice" onchange="localStorage.setItem('astaWorkoutVoice',this.value)">
        <option value="default" ${selected==='default'?'selected':''}>Device default voice</option>
        <option value="off" ${selected==='off'?'selected':''}>Voice off · Screen only</option>
        ${voices.map(v=>`<option value="${esc(v.voiceURI)}" ${selected===v.voiceURI?'selected':''}>${esc(v.name)} (${esc(v.lang)})</option>`).join('')}
      </select>
    </div>

    <button class="btn" onclick="beginWorkoutCountdown()">START COUNTDOWN</button>
    <button class="btn secondary" onclick="state.page='home';render()">CANCEL</button>
  </section>`;
}
function speakWorkout(value){
  if(!window.speechSynthesis)return;

  const choice=localStorage.getItem('astaWorkoutVoice')||'default';
  if(choice==='off')return;

  const voices=workoutVoices();
  const speech=new SpeechSynthesisUtterance(String(value));

  if(choice!=='default'){
    speech.voice=voices.find(v=>v.voiceURI===choice)||null;
  }

  speech.rate=0.9;
  speech.pitch=1;
  window.speechSynthesis.speak(speech);
}
function countdown(){
  return `<section class="panel" style="text-align:center;padding:45px 20px">
    <div class="eyebrow">[ SYSTEM INITIALIZING ]</div>
    <h1 class="h1">GET READY!</h1>
    <div id="countdownNumber" style="font-size:100px;font-weight:900;color:#e84b68">5</div>
    <p class="muted">YOUR QUEST BEGINS SOON</p>
  </section>`;
}
function beginWorkoutCountdown(){
  clearInterval(countdownInterval);
  if(window.speechSynthesis)window.speechSynthesis.cancel();

  let count=5;
  state.page='countdown';
  render();
  speakWorkout(count);

  countdownInterval=setInterval(()=>{
    count--;

    const display=document.getElementById('countdownNumber');

    if(count>0){
      if(display)display.textContent=count;
      speakWorkout(count);
    }else{
      clearInterval(countdownInterval);
      if(display)display.textContent='GO!';
      speakWorkout('Start!');
      setTimeout(()=>{
        workoutStartedAt=Date.now();
        state.page='player';
        render();
        startWorkoutClock();
      },700);
    }
  },1000);
}
function startWorkoutClock(){
  clearInterval(workoutTimerInterval);

  workoutTimerInterval=setInterval(()=>{
    if(!workoutStartedAt)return;

    const elapsed=Math.floor((Date.now()-workoutStartedAt)/1000);
    const minutes=String(Math.floor(elapsed/60)).padStart(2,'0');
    const seconds=String(elapsed%60).padStart(2,'0');

    const timer=document.getElementById('timer');
    if(timer)timer.textContent=`${minutes}:${seconds}`;
  },250);
}
