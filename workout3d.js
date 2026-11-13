
(function () {
  const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";

  function loadThree() {
    return new Promise((resolve, reject) => {
      if (window.THREE) return resolve(window.THREE);

      const script = document.createElement("script");
      script.src = THREE_CDN;
      script.onload = () => resolve(window.THREE);
      script.onerror = () => reject(new Error("3D engine failed to load"));
      document.head.appendChild(script);
    });
  }

  function mount(container, exerciseName) {
    if (!container) return;

    container.innerHTML = `
      <div class="asta-3d-stage">
        <div class="asta-3d-label">3D TRAINING MODEL</div>
        <div class="asta-3d-loading">LOADING 3D ATHLETE...</div>
      </div>
    `;

    const stage = container.querySelector(".asta-3d-stage");

    loadThree().then(THREE => {
      if (!stage.isConnected) return;

      stage.querySelector(".asta-3d-loading")?.remove();

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x09090d);

      const camera = new THREE.PerspectiveCamera(
        38,
        stage.clientWidth / stage.clientHeight,
        0.1,
        100
      );

      camera.position.set(3.8, 2.5, 7);
      camera.lookAt(0, 1.1, 0);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
      });

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(stage.clientWidth, stage.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;

      stage.appendChild(renderer.domElement);

      scene.add(new THREE.HemisphereLight(0xffffff, 0x28202b, 2));

      const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
      keyLight.position.set(3, 6, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);

      const redLight = new THREE.PointLight(0xed1639, 2.5, 8);
      redLight.position.set(-3, 2, 2);
      scene.add(redLight);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(3, 48),
        new THREE.MeshStandardMaterial({
          color: 0x171116,
          roughness: 0.8
        })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0;
      floor.receiveShadow = true;
      scene.add(floor);

      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.15, 0.012, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0x8d1631 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.025;
      scene.add(ring);

      const skin = new THREE.MeshStandardMaterial({
        color: 0x9299a5,
        metalness: 0.45,
        roughness: 0.35
      });

      const dark = new THREE.MeshStandardMaterial({
        color: 0x222630,
        metalness: 0.65,
        roughness: 0.3
      });

      const red = new THREE.MeshStandardMaterial({
        color: 0xed1639,
        emissive: 0x690018,
        metalness: 0.4,
        roughness: 0.3
      });

      const joints = [];
      const parts = {};

      function sphere(name, radius, material) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(radius, 16, 12),
          material
        );
        mesh.castShadow = true;
        scene.add(mesh);
        parts[name] = mesh;
        return mesh;
      }

      function bone(name, radius, material) {
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 1, 12),
          material
        );
        mesh.castShadow = true;
        scene.add(mesh);
        parts[name] = mesh;
        return mesh;
      }

      sphere("head", 0.17, skin);
      sphere("chest", 0.24, dark);
      sphere("hips", 0.19, dark);

      sphere("core", 0.17, red);

      const boneNames = [
        "torso",
        "upperArmL", "lowerArmL",
        "upperArmR", "lowerArmR",
        "upperLegL", "lowerLegL",
        "upperLegR", "lowerLegR"
      ];

      boneNames.forEach(name => {
        const radius = name === "torso" ? 0.17 :
          name.includes("Leg") ? 0.09 : 0.065;
        bone(name, radius, name === "torso" ? dark : skin);
      });

      [
        "shoulderL", "elbowL", "handL",
        "shoulderR", "elbowR", "handR",
        "hipL", "kneeL", "footL",
        "hipR", "kneeR", "footR"
      ].forEach(name => sphere(name, 0.075, dark));

      function placeSphere(name, p) {
        parts[name].position.set(p.x, p.y, p.z);
      }

      function placeBone(name, a, b) {
        const start = new THREE.Vector3(a.x, a.y, a.z);
        const end = new THREE.Vector3(b.x, b.y, b.z);
        const direction = new THREE.Vector3().subVectors(end, start);

        const mesh = parts[name];
        mesh.position.copy(start).add(end).multiplyScalar(0.5);
        mesh.scale.y = direction.length();
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize()
        );
      }

      function point(x, y, z) {
        return { x, y, z };
      }

      function pose(t) {
        const n = exerciseName.toLowerCase();
        const wave = Math.sin(t * 2.5);
        const cycle = (Math.sin(t * 2.5) + 1) / 2;

        let p = {
          head: point(0, 2.1, 0),
          chest: point(0, 1.55, 0),
          hips: point(0, 1.05, 0),
          shoulderL: point(-0.25, 1.72, 0),
          shoulderR: point(0.25, 1.72, 0),
          elbowL: point(-0.45, 1.35, 0),
          elbowR: point(0.45, 1.35, 0),
          handL: point(-0.4, 1.05, 0),
          handR: point(0.4, 1.05, 0),
          hipL: point(-0.13, 1.0, 0),
          hipR: point(0.13, 1.0, 0),
          kneeL: point(-0.15, 0.55, 0),
          kneeR: point(0.15, 0.55, 0),
          footL: point(-0.15, 0.08, 0),
          footR: point(0.15, 0.08, 0)
        };

        function set(name, x, y, z = 0) {
          p[name] = point(x, y, z);
        }

        if (n.includes("push") || n.includes("plank") ||
            n.includes("mountain") || n.includes("bear crawl")) {
          const down = n.includes("push") ? cycle * 0.22 : 0;

          set("head", -0.75, 1.05 - down, 0);
          set("chest", -0.25, 0.83 - down, 0);
          set("hips", 0.35, 0.78, 0);

          set("shoulderL", -0.45, 0.88 - down, -0.12);
          set("shoulderR", -0.45, 0.88 - down, 0.12);
          set("elbowL", -0.38, 0.45, -0.12);
          set("elbowR", -0.38, 0.45, 0.12);
          set("handL", -0.38, 0.08, -0.12);
          set("handR", -0.38, 0.08, 0.12);

          set("hipL", 0.35, 0.78, -0.12);
          set("hipR", 0.35, 0.78, 0.12);
          set("kneeL", 0.75, 0.42, -0.12);
          set("kneeR", 0.75, 0.42, 0.12);
          set("footL", 1.0, 0.08, -0.12);
          set("footR", 1.0, 0.08, 0.12);
        }

        else if (n.includes("squat") || n.includes("wall sit")) {
          const bend = cycle * 0.42;
          set("head", 0, 2.1 - bend, 0);
          set("chest", 0, 1.55 - bend, 0);
          set("hips", 0, 1.05 - bend, 0);

          set("kneeL", -0.25, 0.55 + bend * 0.5, 0);
          set("kneeR", 0.25, 0.55 + bend * 0.5, 0);
          set("footL", -0.25, 0.08, 0);
          set("footR", 0.25, 0.08, 0);
        }

        else if (n.includes("jumping jack")) {
          const spread = cycle * 0.55;
          set("shoulderL", -0.25, 1.72, 0);
          set("shoulderR", 0.25, 1.72, 0);
          set("elbowL", -0.5 - spread, 2.0 + spread, 0);
          set("elbowR", 0.5 + spread, 2.0 + spread, 0);
          set("handL", -0.65 - spread, 2.3 + spread, 0);
          set("handR", 0.65 + spread, 2.3 + spread, 0);
          set("kneeL", -0.35 - spread, 0.55, 0);
          set("kneeR", 0.35 + spread, 0.55, 0);
          set("footL", -0.5 - spread, 0.08, 0);
          set("footR", 0.5 + spread, 0.08, 0);
        }

        else if (n.includes("lunge")) {
          const step = cycle * 0.35;
          set("kneeL", -0.2, 0.45, 0);
          set("footL", -0.2, 0.08, 0);
          set("kneeR", 0.35 + step, 0.8 - step, 0);
          set("footR", 0.65 + step, 0.08, 0);
          set("hips", 0, 1.0 - step * 0.5, 0);
        }

        else if (n.includes("crunch") || n.includes("dead bug") ||
                 n.includes("bicycle")) {
          const curl = cycle * 0.3;
          set("head", -0.35, 0.55 + curl, 0);
          set("chest", -0.1, 0.5 + curl, 0);
          set("hips", 0.3, 0.3, 0);
          set("kneeL", 0.5, 0.65 + curl, 0);
          set("kneeR", 0.65, 0.4, 0);
          set("footL", 0.85, 0.65 + curl, 0);
          set("footR", 1.0, 0.3, 0);
        }

        else if (n.includes("bridge")) {
          set("head", -0.8, 0.3, 0);
          set("chest", -0.3, 0.45 + cycle * 0.3, 0);
          set("hips", 0.25, 0.35 + cycle * 0.4, 0);
          set("kneeL", 0.5, 0.55, 0);
          set("kneeR", 0.5, 0.55, 0);
          set("footL", 0.75, 0.08, 0);
          set("footR", 0.75, 0.08, 0);
        }

        else if (n.includes("high knees")) {
          const lift = Math.max(0, wave);
          set("kneeL", -0.2, 0.55 + lift * 0.65, 0);
          set("footL", -0.2, 0.08 + lift * 0.3, 0);
          set("kneeR", 0.2, 0.55 + Math.max(0, -wave) * 0.65, 0);
          set("footR", 0.2, 0.08 + Math.max(0, -wave) * 0.3, 0);
          set("elbowL", -0.45, 1.4 + lift * 0.3, 0);
          set("elbowR", 0.45, 1.4 + Math.max(0, -wave) * 0.3, 0);
        }

        else if (n.includes("calf raise")) {
          const lift = cycle * 0.18;
          set("head", 0, 2.1 + lift, 0);
          set("chest", 0, 1.55 + lift, 0);
          set("hips", 0, 1.05 + lift, 0);
          set("footL", -0.15, 0.08 + lift, 0);
          set("footR", 0.15, 0.08 + lift, 0);
        }

        else if (n.includes("superman") || n.includes("swimmer") ||
                 n.includes("snow angel") || n.includes("y raise")) {
          set("head", -0.65, 0.55 + cycle * 0.15, 0);
          set("chest", -0.1, 0.35 + cycle * 0.15, 0);
          set("hips", 0.4, 0.25, 0);
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
                     
