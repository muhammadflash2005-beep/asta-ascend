/* ASTA ASCEND 3D DEMO — compatible with the existing workout player */
(function(){
"use strict";
const CDN="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
let loading=null;const active=new Map();
const names=["Wrist Curl","Reverse Wrist Curl","Fist Squeeze","Finger Extension","Palm Pulse","Knuckle Push-up","Superman Hold","Reverse Snow Angel","Prone Y Raise","Cobra Lift","Bird Dog","Swimmers","Crunch","Reverse Crunch","Plank","Dead Bug","Bicycle Crunch","Mountain Climber","Bodyweight Squat","Reverse Lunge","Glute Bridge","Calf Raise","Wall Sit","Squat Pulse","Push-up","Knee Push-up","Wide Push-up","Incline Push-up","Diamond Push-up","Pike Push-up","Burpee","Jumping Jack","Bear Crawl","Inchworm","High Knees","Squat Thrust"];
const staticNames=new Set(["Superman Hold","Plank","Wall Sit"]);
function getThree(){
 if(window.THREE)return Promise.resolve(window.THREE);
 if(loading)return loading;
 loading=new Promise((ok,no)=>{let s=document.createElement("script");s.src=CDN;s.onload=()=>window.THREE?ok(window.THREE):no(Error("Three.js unavailable"));s.onerror=()=>no(Error("Could not load Three.js"));document.head.append(s)});
 return loading;
}
function norm(s){return String(s||"").toLowerCase().replace(/[_-]/g," ").trim()}
function makeRig(T,scene){
 const g=new T.Group();scene.add(g);
 const mats={
 skin:new T.MeshStandardMaterial({color:0xd5a17f}),
 top:new T.MeshStandardMaterial({color:0x292832}),
 shorts:new T.MeshStandardMaterial({color:0x17171d}),
 joint:new T.MeshStandardMaterial({color:0xe33b59}),
 dark:new T.MeshStandardMaterial({color:0x111117})
 };
 const keys=["head","neck","chest","hip","ls","rs","le","re","lw","rw","lh","rh","lk","rk","la","ra","lt","rt"];
 const joints={};
 keys.forEach(k=>{let m=new T.Mesh(new T.SphereGeometry(k==="head"?.16:.075,10,8),k==="head"||k==="neck"?mats.skin:(["chest","ls","rs"].includes(k)?mats.top:(["hip","lh","rh"].includes(k)?mats.shorts:mats.skin)));g.add(m);joints[k]=m});
 const torso=new T.Mesh(new T.SphereGeometry(1,12,10),mats.top);torso.scale.set(.25,.48,.16);g.add(torso);
 const pelvis=new T.Mesh(new T.SphereGeometry(1,12,10),mats.shorts);pelvis.scale.set(.23,.16,.16);g.add(pelvis);
 const pairs=[["neck","head"],["chest","neck"],["hip","chest"],["ls","chest"],["rs","chest"],["ls","le"],["le","lw"],["rs","re"],["re","rw"],["hip","lh"],["hip","rh"],["lh","lk"],["lk","la"],["rh","rk"],["rk","ra"],["la","lt"],["ra","rt"]];
 const bones=pairs.map((p,i)=>{let m=new T.Mesh(new T.CylinderGeometry(i<3?.1:.055,i<3?.1:.055,1,8),i<3?mats.top:(i>8?mats.dark:mats.skin));g.add(m);return {a:p[0],b:p[1],m}});
 function pose(t,n){
  let p={head:[0,1,0],neck:[0,.78,0],chest:[0,.52,0],hip:[0,0,0],ls:[-.27,.65,0],rs:[.27,.65,0],le:[-.4,.34,0],re:[.4,.34,0],lw:[-.42,.04,0],rw:[.42,.04,0],lh:[-.14,-.08,0],rh:[.14,-.08,0],lk:[-.17,-.52,0],rk:[.17,-.52,0],la:[-.17,-.98,0],ra:[.17,-.98,0],lt:[-.17,-1.04,.1],rt:[.17,-1.04,.1]};
  const s=Math.sin(t*2.2),q=Math.sin(t*4.4),put=(k,x,y,z=0)=>p[k]=[x,y,z];
  g.rotation.set(0,0,0);g.position.set(0,1.08,0);
  const horizontal=()=>{g.rotation.z=Math.PI/2;g.position.set(0,.55,0)};
  if(["Wrist Curl","Reverse Wrist Curl","Fist Squeeze","Finger Extension","Palm Pulse"].includes(n)){
   put("le",-.43,.31);put("re",.43,.31);put("lw",-.52,.27+.09*s);put("rw",.52,.27+.09*s);
  }else if(n==="Jumping Jack"){
   let a=(1+Math.sin(t*2.5))/2;put("lw",-.65,.65+.65*a);put("rw",.65,.65+.65*a);put("le",-.5,.7+.2*a);put("re",.5,.7+.2*a);put("la",-.4,-.98);put("ra",.4,-.98);put("lk",-.28,-.52);put("rk",.28,-.52);
  }else if(["Bodyweight Squat","Squat Pulse","Wall Sit"].includes(n)){
   let b=n==="Wall Sit"?.45:(n==="Squat Pulse"?.4+.04*q:.38+.12*(.5+.5*s));put("hip",0,-b);put("chest",0,.52-b*.3);put("lk",-.3,-.55);put("rk",.3,-.55);
  }else if(n==="Reverse Lunge"){
   put("hip",0,-.14);put("rk",.36,-.68-.12*Math.max(0,s));put("ra",.5,-.98);put("lk",-.18,-.54);
  }else if(n==="Calf Raise"){
   put("la",-.17,-.98+.08*(.5+.5*s));put("ra",.17,-.98+.08*(.5+.5*s));put("hip",0,.04*(.5+.5*s));
  }else if(n==="High Knees"){
   put("lk",-.2,-.5-.35*Math.max(0,s));put("rk",.2,-.5-.35*Math.max(0,-s));put("la",-.2,-.92);put("ra",.2,-.92);put("le",-.4,.25-.15*s);put("re",.4,.25+.15*s);
  }else if(["Push-up","Knee Push-up","Wide Push-up","Incline Push-up","Diamond Push-up","Knuckle Push-up","Plank","Mountain Climber","Pike Push-up","Bear Crawl"].includes(n)){
   horizontal();let bend=["Plank","Bear Crawl"].includes(n)?0:.14*(.5+.5*s);
   put("lw",-.42,.43);put("rw",.42,.43);put("le",-.34,.42-bend);put("re",.34,.42-bend);
   if(n==="Mountain Climber"||n==="Bear Crawl"){put("lk",-.2,-.42-.3*Math.max(0,s));put("rk",.2,-.42-.3*Math.max(0,-s))}
   if(n==="Pike Push-up"){put("hip",0,.35);put("chest",0,.25);put("head",0,-.08)}
  }else if(n==="Bird Dog"){
   put("lw",-.42,.34);put("rw",.42,.34);put("lk",-.25,-.4);put("rk",.25,-.4);put("rw",.55,.5+.08*s);put("la",-.55,-.3-.08*s);
  }else if(["Superman Hold","Reverse Snow Angel","Prone Y Raise","Cobra Lift","Swimmers"].includes(n)){
   horizontal();
   if(n==="Superman Hold"||n==="Swimmers"){put("lw",-.7,.75+(n==="Swimmers"?.1*s:0));put("rw",.7,.75-(n==="Swimmers"?.1*s:0));put("la",-.7,-.72+.08*s);put("ra",.7,-.72-.08*s)}
   if(n==="Reverse Snow Angel"||n==="Prone Y Raise"){let a=n==="Prone Y Raise"?.9:(.5+.5*s);put("lw",-.75*a,.65);put("rw",.75*a,.65)}
   if(n==="Cobra Lift"){put("chest",.2,.55);put("head",.2,.98)}
  }else if(["Crunch","Reverse Crunch","Dead Bug","Bicycle Crunch","Glute Bridge"].includes(n)){
   g.position.set(0,.42,0);
   if(n==="Crunch"){put("chest",0,.48+.15*(.5+.5*s));put("head",0,.9+.15*(.5+.5*s))}
   if(n==="Reverse Crunch"){put("hip",0,.12+.16*(.5+.5*s));put("lk",-.18,-.35-.18*(.5+.5*s));put("rk",.18,-.35-.18*(.5+.5*s))}
   if(n==="Dead Bug"){put("lw",-.6,.55+.15*s);put("rw",.6,.55-.15*s);put("la",-.45,-.55-.2*s);put("ra",.45,-.55+.2*s)}
   if(n==="Bicycle Crunch"){put("lk",-.22,-.3-.2*Math.max(0,s));put("rk",.22,-.3-.2*Math.max(0,-s));put("le",-.5,.4+.12*s);put("re",.5,.4-.12*s)}
   if(n==="Glute Bridge"){put("hip",0,.2+.18*(.5+.5*s));put("lk",-.25,-.1);put("rk",.25,-.1);put("la",-.25,-.42);put("ra",.25,-.42)}
  }else if(["Burpee","Squat Thrust","Inchworm"].includes(n)){
   let phase=(t%3)/3;
   if(phase<.3){put("hip",0,-.2-.3*phase/.3);put("lw",-.4,-.1);put("rw",.4,-.1)}
   else if(phase<.72){horizontal();put("lw",-.42,.43);put("rw",.42,.43);if(n==="Inchworm"){put("la",.65,-.2);put("ra",.65,-.35)}}
   else{put("hip",0,-.25*(1-(phase-.72)/.28));put("lk",-.25,-.7);put("rk",.25,-.7)}
  }
  Object.entries(p).forEach(([k,v])=>joints[k].position.set(...v));
  torso.position.copy(joints.chest.position).lerp(joints.hip.position,.48);pelvis.position.copy(joints.hip.position);
  bones.forEach(b=>{let a=joints[b.a].position,c=joints[b.b].position,d=new T.Vector3().subVectors(c,a);b.m.position.copy(a).add(c).multiplyScalar(.5);b.m.scale.set(1,d.length(),1);b.m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize())});
 }
 return {g,pose,dispose(){g.traverse(o=>{if(o.geometry)o.geometry.dispose()})},mats:Object.values(mats)};
}
function unmount(el){let x=active.get(el);if(x)x.stop();if(el)el.innerHTML=""}
function mount(el,exercise){
 if(!el)return;unmount(el);
 el.innerHTML='<div class="asta-3d-stage"><div class="asta-3d-label">3D EXERCISE DEMONSTRATION</div><div class="asta-3d-loading">LOADING 3D ATHLETE...</div></div>';
 let stage=el.querySelector(".asta-3d-stage"),name=names.find(x=>norm(x)===norm(exercise))||String(exercise||"Exercise"),dead=false,raf=0,renderer,observer,rig;
 const item={stop(){if(dead)return;dead=true;cancelAnimationFrame(raf);if(observer)observer.disconnect();if(renderer){renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove()}if(rig){rig.dispose();rig.mats.forEach(m=>m.dispose())}active.delete(el)}};
 active.set(el,item);
 getThree().then(T=>{
  if(dead||!stage.isConnected)return;
  let w=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight),scene=new T.Scene();scene.background=new T.Color(0x09090d);
  let camera=new T.PerspectiveCamera(36,w/h,.1,40);camera.position.set(3.3,2.1,5.8);camera.lookAt(0,.55,0);
  renderer=new T.WebGLRenderer({antialias:false,powerPreference:"low-power"});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));renderer.setSize(w,h);renderer.outputEncoding=T.sRGBEncoding;stage.appendChild(renderer.domElement);
  scene.add(new T.HemisphereLight(0xffffff,0x29202a,1.8));let light=new T.DirectionalLight(0xffffff,1.7);light.position.set(3,5,4);scene.add(light);
  let floor=new T.Mesh(new T.CircleGeometry(2.3,28),new T.MeshStandardMaterial({color:0x17141a}));floor.rotation.x=-Math.PI/2;floor.position.y=-.02;scene.add(floor);
  rig=makeRig(T,scene);stage.querySelector(".asta-3d-loading")?.remove();let cap=document.createElement("div");cap.className="asta-3d-caption";cap.textContent=name.toUpperCase();stage.append(cap);
  let start=performance.now();function draw(now){if(dead||!stage.isConnected){item.stop();return}let t=(now-start)/1000;rig.pose(staticNames.has(name)?0:t,name);renderer.render(scene,camera);raf=requestAnimationFrame(draw)}draw(start);
  observer=new ResizeObserver(()=>{if(dead)return;let nw=Math.max(1,stage.clientWidth),nh=Math.max(1,stage.clientHeight);camera.aspect=nw/nh;camera.updateProjectionMatrix();renderer.setSize(nw,nh)});observer.observe(stage);
 }).catch(err=>{if(!dead){let x=stage.querySelector(".asta-3d-loading");if(x)x.textContent="3D unavailable. Check your connection and reopen.";console.error(err)}});
}
window.ASTAWorkout3D={mount,unmount,exerciseNames:names.slice()};
})();
0.25, 0);
          set("shoulderL", -0.3, 0.4, -0.12);
          set("shoulderR", -0.3, 0.4, 0.12);
          set("elbowL", -0.55, 0.75 + cycle * 0.2, -0.12);
          set("elbowR", -0.55, 0.75 + cycle * 0.2, 0.12);
          set("handL", -0.8, 0.9 + cycle * 0.2, -0.12);
          set("handR", -0.8, 0.9 + cycle * 0.2, 0.12);
          set("kneeL", 0.75, 0.35, 0);
          set("kneeR", 0.75, 0.35, 0);
          set("footL", 1.0, 0.5 + cycle * 0.2, 0);
          set("footR", 1.0, 0.5 + cycle * 0.2, 0);
        }

        else if (n.includes("wrist") || n.includes("fist") ||
                 n.includes("finger") || n.includes("palm")) {
          set("elbowL", -0.4, 1.2, 0);
          set("handL", -0.5, 1.45 + wave * 0.12, 0);
          set("elbowR", 0.4, 1.2, 0);
          set("handR", 0.5, 1.45 - wave * 0.12, 0);
        }

        else {
          const curl = cycle * 0.5;
          set("elbowL", -0.45, 1.35 + curl, 0);
          set("handL", -0.4, 1.05 + curl, 0);
          set("elbowR", 0.45, 1.35 + curl, 0);
          set("handR", 0.4, 1.05 + curl, 0);
        }

        return p;
      }

      function update(t) {
        const p = pose(t);

        Object.entries(p).forEach(([name, position]) => {
          if (parts[name]) placeSphere(name, position);
        });

        placeBone("torso", p.hips, p.chest);

        placeBone("upperArmL", p.shoulderL, p.elbowL);
        placeBone("lowerArmL", p.elbowL, p.handL);
        placeBone("upperArmR", p.shoulderR, p.elbowR);
        placeBone("lowerArmR", p.elbowR, p.handR);

        placeBone("upperLegL", p.hipL, p.kneeL);
        placeBone("lowerLegL", p.kneeL, p.footL);
        placeBone("upperLegR", p.hipR, p.kneeR);
        placeBone("lowerLegR", p.kneeR, p.footR);
      }

      let frame;
      const start = performance.now();

      function animate(now) {
        if (!stage.isConnected) {
          cancelAnimationFrame(frame);
          renderer.dispose();
          return;
        }

        update((now - start) / 1000);
        renderer.render(scene, camera);
        frame = requestAnimationFrame(animate);
      }

      function resize() {
        if (!stage.isConnected) return;
        const w = stage.clientWidth;
        const h = stage.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }

      const observer = new ResizeObserver(resize);
      observer.observe(stage);

      animate(performance.now());
    }).catch(error => {
      stage.innerHTML = `<p class="asta-3d-error">3D model unavailable. Check your internet connection and reload.</p>`;
      console.error(error);
    });
  }

  window.ASTAWorkout3D = { mount };
})();
                     
