/* 3-D MRI room for the patient set-up step (three.js, procedural — no external models).
   window.SCG_ROOM3D(THREE, host) -> { play(onStep, onDone), reset(), start(), stop(), setPose() }
   World axes: +x along the table toward the magnet, +y up, +z toward the camera.
   Tibia + fibula set-up: patient SUPINE, FEET FIRST (feet toward +x), two flexible arrays wrapped round the right
   lower leg from just above the knee to the ankle. setPose() switches the right leg between "straight" (foot neutral,
   sandbags), "rotated" (unsupported, foot rolled out) and "flexed" (knee bent over a foam wedge). */
window.SCG_ROOM3D = function(THREE, host){
  "use strict";
  var V3 = THREE.Vector3;

  /* ---------------- renderer / scene ---------------- */
  var renderer = new THREE.WebGLRenderer({ antialias:true, powerPreference:"high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd9dedb);
  scene.fog = new THREE.Fog(0xd9dedb, 8, 16);

  /* image-based lighting from a simple bright clinical room */
  (function(){
    var env = new THREE.Scene();
    var room = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 12), new THREE.MeshBasicMaterial({ color:0x8c918e, side:THREE.BackSide }));
    room.position.y = 2.5; env.add(room);
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ color:0x6f736f }));
    floor.rotation.x = -Math.PI/2; floor.position.y = 0.01; env.add(floor);
    var pm = new THREE.MeshBasicMaterial({ color:new THREE.Color(5, 5, 4.8) });
    [[-2,-1.2],[0,-1.2],[2,-1.2],[-2,1.4],[0,1.4],[2,1.4]].forEach(function(p){
      var m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), pm);
      m.rotation.x = Math.PI/2; m.position.set(p[0], 4.95, p[1]); env.add(m);
    });
    var side = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.6), new THREE.MeshBasicMaterial({ color:new THREE.Color(1.6, 1.7, 1.75) }));
    side.position.set(0, 2.2, 5.9); side.rotation.y = Math.PI; env.add(side);
    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    pmrem.dispose();
  })();

  var camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);

  var hemi = new THREE.HemisphereLight(0xffffff, 0x8f938f, 0.35);
  scene.add(hemi);
  var key = new THREE.DirectionalLight(0xfffaf2, 2.9);
  key.position.set(-1.2, 5.0, 2.6);
  key.target.position.set(0.2, 0.8, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  var sc = key.shadow.camera; sc.left = -3.2; sc.right = 3.2; sc.top = 2.6; sc.bottom = -2.6; sc.near = 1; sc.far = 12;
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.015; key.shadow.radius = 3.5;
  scene.add(key, key.target);
  var fill = new THREE.DirectionalLight(0xe8f0ff, 0.55);
  fill.position.set(3.5, 2.2, 3.5); scene.add(fill);

  /* ---------------- helpers ---------------- */
  function canvasTex(w, h, draw, repeat){
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    var t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if(repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  }
  function noise(g, w, h, n, a, col){
    for(var i=0;i<n;i++){ g.fillStyle = col.replace("A", (Math.random()*a).toFixed(3)); g.fillRect(Math.random()*w, Math.random()*h, 1+Math.random()*1.5, 1+Math.random()*1.5); }
  }
  function rrShape(w, h, r){
    var s = new THREE.Shape(), x = -w/2, y = -h/2;
    s.moveTo(x+r, y); s.lineTo(x+w-r, y); s.quadraticCurveTo(x+w, y, x+w, y+r);
    s.lineTo(x+w, y+h-r); s.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    s.lineTo(x+r, y+h); s.quadraticCurveTo(x, y+h, x, y+h-r);
    s.lineTo(x, y+r); s.quadraticCurveTo(x, y, x+r, y);
    return s;
  }
  /* rounded box: w along x, h along y, d along z */
  function rbox(w, h, d, r, mat, seg){
    r = Math.min(r, w/2-1e-3, h/2-1e-3, d/2-1e-3);
    var g = new THREE.ExtrudeGeometry(rrShape(w-2*r, h-2*r, Math.max(0.0008, r*0.6)),
      { depth:Math.max(0.0005, d-2*r), bevelEnabled:true, bevelThickness:r, bevelSize:r, bevelSegments:seg||4, curveSegments:6 });
    g.center();
    var m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  function limb(a, b, r, mat){
    var dir = new V3().subVectors(b, a), len = dir.length();
    var m = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len), 8, 20), mat);
    m.position.copy(a).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new V3(0,1,0), dir.normalize());
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  function taper(a, b, r0, r1, mat){             // tapered limb segment with rounded ends
    var g = new THREE.Group(), dir = new V3().subVectors(b, a), len = dir.length();
    var cyl = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, len, 28, 4), mat);
    cyl.position.copy(a).addScaledVector(dir, 0.5);
    cyl.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir.clone().normalize());
    var ea = new THREE.Mesh(new THREE.SphereGeometry(r0, 24, 16), mat); ea.position.copy(a);
    var eb = new THREE.Mesh(new THREE.SphereGeometry(r1, 24, 16), mat); eb.position.copy(b);
    [cyl, ea, eb].forEach(function(m){ m.castShadow = m.receiveShadow = true; g.add(m); });
    return g;
  }
  function ellipsoid(rx, ry, rz, mat, seg){
    var m = new THREE.Mesh(new THREE.SphereGeometry(1, seg||40, (seg||40)*3/4|0), mat);
    m.scale.set(rx, ry, rz); m.castShadow = m.receiveShadow = true;
    return m;
  }
  function gridGeo(nu, nv, fn){
    var pos = [], uv = [], idx = [], i, j;
    for(i=0;i<=nu;i++) for(j=0;j<=nv;j++){ var p = fn(i/nu, j/nv); pos.push(p[0], p[1], p[2]); uv.push(i/nu, j/nv); }
    for(i=0;i<nu;i++) for(j=0;j<nv;j++){ var a = i*(nv+1)+j, b = a+nv+1; idx.push(a, b, a+1, b, b+1, a+1); }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  function prof(pts, u){                   // smooth piecewise interpolation of [u, value] pairs
    if(u <= pts[0][0]) return pts[0][1];
    for(var i=1;i<pts.length;i++) if(u <= pts[i][0]){
      var t = (u-pts[i-1][0])/(pts[i][0]-pts[i-1][0]); t = t*t*(3-2*t);
      return pts[i-1][1] + (pts[i][1]-pts[i-1][1])*t;
    }
    return pts[pts.length-1][1];
  }

  /* ---------------- materials ---------------- */
  var M = {
    shell:  new THREE.MeshPhysicalMaterial({ color:0xf3f4f2, roughness:0.3, clearcoat:0.7, clearcoatRoughness:0.22 }),
    trim:   new THREE.MeshStandardMaterial({ color:0xb4bbc0, roughness:0.35, metalness:0.25 }),
    dark:   new THREE.MeshStandardMaterial({ color:0x3a3f44, roughness:0.55 }),
    bore:   new THREE.MeshStandardMaterial({ color:0xe9ebec, roughness:0.45, side:THREE.BackSide }),
    boreBand: new THREE.MeshStandardMaterial({ color:0xc7ccd0, roughness:0.5, side:THREE.BackSide }),
    pedestal: new THREE.MeshPhysicalMaterial({ color:0xe2dfd8, roughness:0.38, clearcoat:0.4 }),
    carbon: new THREE.MeshPhysicalMaterial({ color:0x24272b, roughness:0.32, clearcoat:0.8, clearcoatRoughness:0.15 }),
    mattress: new THREE.MeshStandardMaterial({ color:0x2f3d4a, roughness:0.62 }),
    foam:   new THREE.MeshStandardMaterial({ color:0xd9dcd6, roughness:0.85 }),
    skin:   new THREE.MeshPhysicalMaterial({ color:0xcf9a7c, roughness:0.58, sheen:0.4, sheenColor:new THREE.Color(0xffd6bf), sheenRoughness:0.6 }),
    hair:   new THREE.MeshStandardMaterial({ color:0x2a2018, roughness:0.88 }),
    brow:   new THREE.MeshStandardMaterial({ color:0x3b2c22, roughness:0.9 }),
    wall:   new THREE.MeshStandardMaterial({ color:0xe6e9e6, roughness:0.92 }),
    glass:  new THREE.MeshPhysicalMaterial({ color:0x1b2329, roughness:0.08, metalness:0.2, clearcoat:1 }),
    screen: new THREE.MeshBasicMaterial({ color:0xffffff }),
    tape:   new THREE.MeshStandardMaterial({ color:0xf5f5f0, roughness:0.6, transparent:true, opacity:0.85 }),
    tube:   new THREE.MeshPhysicalMaterial({ color:0xf2f5f7, roughness:0.15, transmission:0.6, thickness:0.002, transparent:true, opacity:0.9 }),
    syringe:new THREE.MeshPhysicalMaterial({ color:0xffffff, roughness:0.05, transmission:0.9, thickness:0.01, transparent:true, opacity:0.55 }),
    laser:  new THREE.MeshBasicMaterial({ color:new THREE.Color(1.0, 0.08, 0.05), toneMapped:false }),
    laserGlow: new THREE.MeshBasicMaterial({ color:new THREE.Color(1.0, 0.15, 0.1), toneMapped:false, transparent:true, opacity:0.25, depthWrite:false, blending:THREE.AdditiveBlending })
  };
  M.gown = new THREE.MeshStandardMaterial({ roughness:0.92, side:THREE.DoubleSide, map:canvasTex(256, 256, function(g, w, h){
    g.fillStyle = "#a9c8d8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#7ea5bb";
    for(var y=8; y<h; y+=32) for(var x=8 + ((y/32)%2)*16; x<w; x+=32){
      g.beginPath(); g.moveTo(x, y-5); g.lineTo(x+5, y); g.lineTo(x, y+5); g.lineTo(x-5, y); g.closePath(); g.fill();
    }
    noise(g, w, h, 5000, 0.08, "rgba(40,60,80,A)");
  }, [5, 3]) });
  M.blanket = new THREE.MeshStandardMaterial({ roughness:0.97, side:THREE.DoubleSide, map:canvasTex(1024, 512, function(g, w, h){
    g.fillStyle = "#c9d7e1"; g.fillRect(0, 0, w, h);
    for(var y=0; y<h; y+=8) for(var x=(y/8%2)*4; x<w; x+=8){          // cellular weave
      g.fillStyle = "rgba(150,170,185,.45)"; g.beginPath(); g.arc(x+2, y+2, 1.6, 0, 7); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,.18)"; for(var i=0;i<w;i+=4) g.fillRect(i, 0, 1, h);
    g.fillStyle = "#e9eef1"; g.fillRect(0, 0, w*0.03, h);                // hem band at the waist
    noise(g, w, h, 16000, 0.07, "rgba(60,70,80,A)");
  }) });
  M.floor = new THREE.MeshStandardMaterial({ roughness:0.5, map:canvasTex(512, 512, function(g, w, h){
    g.fillStyle = "#cfd4d1"; g.fillRect(0, 0, w, h);
    noise(g, w, h, 26000, 0.12, "rgba(70,80,75,A)");
    g.strokeStyle = "rgba(120,130,125,.35)"; g.lineWidth = 2;
    for(var i=0;i<=4;i++){ g.beginPath(); g.moveTo(i*w/4, 0); g.lineTo(i*w/4, h); g.stroke(); g.beginPath(); g.moveTo(0, i*h/4); g.lineTo(w, i*h/4); g.stroke(); }
  }, [5, 5]) });

  /* ---------------- room ---------------- */
  var floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), M.floor);
  floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
  var wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 4.5), M.wall);
  wall.position.set(0, 2.25, -2.4); wall.receiveShadow = true; scene.add(wall);
  var skirting = new THREE.Mesh(new THREE.BoxGeometry(16, 0.1, 0.02), M.dark);
  skirting.position.set(0, 0.05, -2.39); scene.add(skirting);
  // control-room window
  var winFrame = rbox(1.7, 0.85, 0.08, 0.02, M.trim); winFrame.position.set(-1.2, 1.75, -2.36); scene.add(winFrame);
  var winGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.73), new THREE.MeshPhysicalMaterial({ roughness:0.06, clearcoat:1, map:canvasTex(512, 236, function(g, w, h){
    var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#56656f"); gr.addColorStop(1, "#2b343a"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1a2025"; g.fillRect(0, h*0.72, w, h*0.28);           // desk
    [[60, 150], [180, 150], [300, 150], [400, 150]].forEach(function(p, i){
      g.fillStyle = "#0e1215"; g.fillRect(p[0], p[1]-74, 96, 66);
      g.fillStyle = i === 1 ? "#3d6a8a" : "#2f4d63"; g.fillRect(p[0]+5, p[1]-70, 86, 56);
      g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(p[0]+12, p[1]-60, 40, 3); g.fillRect(p[0]+12, p[1]-52, 60, 3);
      g.fillStyle = "#0e1215"; g.fillRect(p[0]+44, p[1]-8, 8, 12);
    });
    g.fillStyle = "rgba(255,255,255,.07)"; g.beginPath(); g.moveTo(0, 0); g.lineTo(w*0.35, 0); g.lineTo(w*0.15, h); g.lineTo(0, h); g.fill();
  }) })); winGlass.position.set(-1.2, 1.75, -2.31); scene.add(winGlass);
  function mirrorText(g, w){}                                         // (unmirrored canvas: kept for the texture code)
  // MR safety sign
  var sign = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.2), new THREE.MeshBasicMaterial({ map:canvasTex(280, 100, function(g, w, h){
    mirrorText(g, w);
    g.fillStyle = "#ffd21f"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#111"; g.fillRect(4, 4, w-8, 26);
    g.fillStyle = "#ffd21f"; g.font = "bold 18px Segoe UI, Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("CAUTION · MR", w/2, 18);
    g.fillStyle = "#111"; g.font = "bold 20px Segoe UI, Arial"; g.fillText("MAGNET IS ALWAYS ON", w/2, 62);
  }), toneMapped:false }));
  sign.position.set(-0.1, 2.45, -2.38); scene.add(sign);

  /* ---------------- magnet (1.5 T, 70 cm bore) ---------------- */
  var G = 1.85, BY = 1.04, BR = 0.35, GD = 1.55, HC = 1.1;    // isocentre x, bore centre y, bore radius, magnet length, housing centre y
  var gantry = new THREE.Group(); scene.add(gantry);
  var SHELL_MATS = [];                                         // faded at the end so the coil at isocentre can be seen
  (function(){
    M.shellX = M.shell.clone(); M.shellX.transparent = true; SHELL_MATS.push(M.shellX);
    M.boreX = M.bore.clone(); M.boreX.transparent = true; SHELL_MATS.push(M.boreX);
    var shape = rrShape(2.15, 2.1, 0.62);
    var hole = new THREE.Path(); hole.absarc(0, BY-HC, BR+0.06, 0, Math.PI*2, true); shape.holes.push(hole);
    var g = new THREE.ExtrudeGeometry(shape, { depth:GD-0.2, bevelEnabled:true, bevelThickness:0.1, bevelSize:0.08, bevelSegments:12, curveSegments:128 });
    g.center(); g.rotateY(Math.PI/2);
    var shell = new THREE.Mesh(g, M.shellX); shell.castShadow = true; shell.receiveShadow = true;
    shell.position.set(G, HC, 0); gantry.add(shell);
    var liner = new THREE.Mesh(new THREE.CylinderGeometry(BR+0.002, BR+0.002, GD+0.02, 128, 1, true), M.boreX);
    liner.rotation.z = Math.PI/2; liner.position.set(G, BY, 0); liner.receiveShadow = true; gantry.add(liner);
    // flared front opening
    var flare = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(BR+0.003, 0), new THREE.Vector2(BR+0.05, 0.05), new THREE.Vector2(BR+0.17, 0.085)], 128), M.shellX);
    flare.rotation.z = Math.PI/2; flare.position.set(G-GD/2+0.03, BY, 0); gantry.add(flare);
    // bore light strip along the ceiling of the bore
    M.boreLight = new THREE.MeshBasicMaterial({ color:new THREE.Color(1.6, 1.6, 1.5), toneMapped:false, transparent:true });
    SHELL_MATS.push(M.boreLight);
    var strip = new THREE.Mesh(new THREE.BoxGeometry(GD-0.2, 0.004, 0.09), M.boreLight); strip.position.set(G, BY+BR-0.004, 0); gantry.add(strip);
    var accent = new THREE.Mesh(new THREE.TorusGeometry(BR+0.13, 0.008, 12, 160), new THREE.MeshBasicMaterial({ color:new THREE.Color(0.35, 0.8, 1.4), toneMapped:false }));
    accent.rotation.y = Math.PI/2; accent.position.set(G-GD/2-0.02, BY, 0); gantry.add(accent);
    var plinth = rbox(GD-0.1, 0.1, 1.6, 0.04, M.pedestal); plinth.position.set(G, 0.05, 0); gantry.add(plinth);
    // front-face control panels + display
    [0.7, -0.7].forEach(function(z, i){
      var p = rbox(0.03, 0.16, 0.24, 0.012, M.dark); p.position.set(G-GD/2-0.11, BY+0.06, z); gantry.add(p);
      if(i === 0){
        var scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), new THREE.MeshBasicMaterial({ toneMapped:false, map:canvasTex(200, 120, function(g, w, h){
          mirrorText(g, w);
          g.fillStyle = "#06120c"; g.fillRect(0, 0, w, h);
          g.fillStyle = "#5fe08a"; g.font = "bold 22px Segoe UI, Arial"; g.fillText("COIL OK", 12, 34);
          g.font = "16px Segoe UI, Arial"; g.fillStyle = "#9fe7b8"; g.fillText("Flex 18 x2", 12, 66); g.fillText("Table  000", 12, 92);
        }) }));
        scr.rotation.y = -Math.PI/2; scr.position.set(G-GD/2-0.127, BY+0.06, z); gantry.add(scr);
      }
    });
    // landmark laser aperture
    var ap = rbox(0.02, 0.025, 0.12, 0.008, M.dark); ap.position.set(G-GD/2-0.105, BY+BR+0.14, 0); gantry.add(ap);
  })();
  var LASER_X = G - GD/2 - 0.125;
  function setShellOpacity(o){ SHELL_MATS.forEach(function(m){ m.opacity = o; m.depthWrite = o > 0.95; }); }

  /* ---------------- couch (fixed base + moving table) ---------------- */
  var T = 0.90;                          // top of the mattress
  var base = rbox(1.35, 0.07, 0.66, 0.03, M.dark); base.position.set(-0.55, 0.035, 0); scene.add(base);
  var ped = rbox(0.95, 0.62, 0.44, 0.08, M.pedestal); ped.position.set(-0.55, 0.38, 0); scene.add(ped);
  var cradleRail = rbox(1.7, 0.09, 0.36, 0.035, M.pedestal); cradleRail.position.set(-0.35, 0.74, 0); scene.add(cradleRail);

  var couch = new THREE.Group(); scene.add(couch);
  var top = rbox(2.4, 0.05, 0.5, 0.02, M.carbon); top.position.set(0, 0.81, 0); couch.add(top);
  var mat = rbox(2.05, 0.055, 0.48, 0.022, M.mattress); mat.position.set(-0.1, 0.8625, 0); couch.add(mat);

  /* ---------------- patient (local to couch) ---------------- */
  /* Built head first in local coordinates (head toward local +x), then turned end-for-end so the patient goes in
     FEET FIRST. Three arm set-ups, rebuilt by setPose(): "side" (on pads), "up" (above the head), "belly" (on the coil). */
  var hx = 0.55;                         // head centre (local x)
  function g2(x, y, sx, sy){ return Math.exp(-(x*x)/(sx*sx) - (y*y)/(sy*sy)); }
  function sstep(e0, e1, x){ var t = Math.max(0, Math.min(1, (x - e0)/(e1 - e0))); return t*t*(3 - 2*t); }
  /* sculpted head: displaced sphere. Canonical frame: +Y = crown, +Z = face, +X = patient's left. */
  function headShape(p){                          // p on the unit sphere -> displaced point
    var x = p.x, y = p.y, z = p.z, f = Math.max(0, z), d = 0;
    d += 0.055*f*g2(x, y - 0.3, 0.55, 0.1);                                    // brow ridge
    d -= 0.07*f*(g2(x - 0.32, y - 0.1, 0.15, 0.09) + g2(x + 0.32, y - 0.1, 0.15, 0.09));  // eye sockets
    d += 0.11*f*g2(x, y + 0.06, 0.065, 0.2);                                   // nasal bridge
    d += 0.13*f*g2(x, y + 0.27, 0.085, 0.07);                                  // nose tip
    d += 0.045*f*(g2(x - 0.11, y + 0.3, 0.06, 0.05) + g2(x + 0.11, y + 0.3, 0.06, 0.05)); // alae
    d += 0.035*f*(g2(x - 0.45, y + 0.1, 0.18, 0.14) + g2(x + 0.45, y + 0.1, 0.18, 0.14)); // cheekbones
    d += 0.03*f*g2(x, y + 0.47, 0.2, 0.045) - 0.02*f*g2(x, y + 0.53, 0.2, 0.018) + 0.022*f*g2(x, y + 0.58, 0.17, 0.04); // lips
    d += 0.06*f*g2(x, y + 0.82, 0.24, 0.1);                                    // chin
    d += 0.05*Math.max(0, -z)*g2(x, y - 0.1, 0.7, 0.5);                       // occiput
    var q = new V3(x, y, z).multiplyScalar(1 + d);
    if(y < -0.2){ var t = Math.min(1, (-y - 0.2)/0.8); q.x *= 1 - 0.2*t; q.z += 0.1*t*Math.max(0, z); }   // jaw taper
    if(y > 0.2 && z > 0) q.z *= 1 - 0.07*(y - 0.2);                            // sloping forehead
    return q;
  }
  function headGeo(){
    var g = new THREE.SphereGeometry(1, 128, 96), p = g.attributes.position, v = new V3(), col = [];
    var skin = new THREE.Color(0xcf9a7c), hairC = new THREE.Color(0x1e1610), browC = new THREE.Color(0x3a2a20),
        lipC = new THREE.Color(0xb46e62), c = new THREE.Color();
    for(var i=0;i<p.count;i++){
      v.fromBufferAttribute(p, i).normalize();
      var x = v.x, y = v.y, z = v.z, f = Math.max(0, z);
      var line = -0.55*y + 0.835*z;
      var w = sstep(0.24, 0.17, line);
      w *= 1 - sstep(-0.35, -0.6, y)*sstep(-0.2, 0.2, z);
      var q = headShape(v);
      var lift = 1 + 0.028*w;
      p.setXYZ(i, q.x*0.074*lift, q.y*0.108*lift, q.z*0.094*lift);
      c.copy(skin);
      c.lerp(lipC, 0.65*f*g2(x, y + 0.53, 0.2, 0.06));
      c.lerp(browC, 0.85*f*(g2(x - 0.3, y - 0.25, 0.17, 0.035) + g2(x + 0.3, y - 0.25, 0.17, 0.035)));
      c.lerp(browC, 0.6*f*(g2(x - 0.32, y - 0.07, 0.11, 0.012) + g2(x + 0.32, y - 0.07, 0.11, 0.012)));  // closed lids
      c.lerp(hairC, w);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }
  var HEAD_GEO = headGeo();                       // built once, shared by every pose
  M.head = M.skin.clone(); M.head.color.set(0xffffff); M.head.vertexColors = true;
  M.bag = new THREE.MeshStandardMaterial({ color:0x4b5a66, roughness:0.85 });

  M.coil = new THREE.MeshStandardMaterial({ color:0x3d4a5c, roughness:0.75 });
  M.coilEdge = new THREE.MeshStandardMaterial({ color:0x26303c, roughness:0.6 });
  M.strap = new THREE.MeshStandardMaterial({ color:0x8a96a6, roughness:0.9 });
  M.cable = new THREE.MeshStandardMaterial({ color:0x2a2d31, roughness:0.45 });
  M.coilLabel = new THREE.MeshStandardMaterial({ roughness:0.7, map:canvasTex(128, 64, function(g, w, h){
    g.fillStyle = "#3d4a5c"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffd21f"; g.fillRect(8, 22, 20, 20);
    g.fillStyle = "#e9eef3"; g.font = "bold 15px Segoe UI, Arial"; g.fillText("FLEX", 34, 30); g.font = "12px Segoe UI, Arial"; g.fillText("18 ch", 36, 48);
  }) });
  M.short = new THREE.MeshStandardMaterial({ color:0x4f6f86, roughness:0.85 });
  var patient = null, pillow = null, armPad = null, EL = null, ELc = null, POSE = "straight";
  var PX = -0.3;                                  // feet first: the patient group is turned end-for-end and slid along the table
  function buildPatient(pose){
    if(patient){
      couch.remove(patient);
      patient.traverse(function(c){ if(c.isMesh && c.geometry !== HEAD_GEO) c.geometry.dispose(); });
    }
    POSE = pose;
    patient = new THREE.Group(); couch.add(patient);
    patient.rotation.y = Math.PI; patient.position.set(PX, 0, 0);     // local +x (head) now points away from the magnet

    // head + pillow
    var headG = new THREE.Group();
    pillow = rbox(0.3, 0.05, 0.32, 0.022, M.foam);
    pillow.position.set(hx - 0.01, T+0.024, 0); patient.add(pillow);
    headG.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3(0, 0, 1), new V3(1, 0, 0), new V3(0, 1, 0)));
    headG.position.set(hx, T + 0.048 + 0.092, 0);
    patient.add(headG);
    var head = new THREE.Mesh(HEAD_GEO, M.head); head.castShadow = head.receiveShadow = true; headG.add(head);
    [-1, 1].forEach(function(sd){
      var ear = ellipsoid(0.009, 0.024, 0.014, M.skin, 24); ear.position.set(sd*0.072, -0.02, -0.012); ear.rotation.x = -0.15; headG.add(ear);
    });
    patient.add(limb(new V3(hx-0.18, T+0.098, 0), new V3(hx-0.06, T+0.1, 0), 0.05, M.skin));   // neck

    // torso in a gown, shoulders to hips (local +z = the patient's left)
    var tx0 = hx - 0.13, tLen = 0.66;
    var RZ = [[0, 0.2], [0.12, 0.205], [0.4, 0.175], [0.7, 0.16], [1, 0.185]];
    var RY = [[0, 0.085], [0.12, 0.1], [0.4, 0.112], [0.7, 0.098], [1, 0.09]];
    function capOf(u){ return u < 0.09 ? Math.pow(Math.sin(u/0.09*Math.PI/2), 0.42) : (u > 0.93 ? 0.8 + 0.2*Math.cos((u-0.93)/0.07*Math.PI/2) : 1); }
    var torso = new THREE.Mesh(gridGeo(60, 48, function(u, v){
      var cap = capOf(u);
      var rz = prof(RZ, u)*cap, ry = prof(RY, u)*cap, a = -Math.PI/2 + v*Math.PI*2, s = Math.sin(a);
      var y = T + ry*0.55 + (s >= 0 ? ry*s : ry*0.55*s);
      var fold = 0.003*Math.sin(u*40 + v*18) + 0.002*Math.sin(u*90 - v*30);
      return [tx0 - u*tLen, y + (s > 0 ? fold : 0), rz*Math.cos(a)*(1 + (s > 0 ? fold*2 : 0))];
    }), M.gown);
    torso.castShadow = torso.receiveShadow = true; patient.add(torso);

    function makeHand(wr, dir, curl, thumb){
      var hand = new THREE.Group(); hand.position.copy(wr); hand.position.y -= 0.006;
      hand.quaternion.setFromUnitVectors(new V3(1, 0, 0), dir); patient.add(hand);
      var palm = ellipsoid(0.05, 0.015, 0.038, M.skin, 28); palm.position.x = 0.05; hand.add(palm);
      var fing = ellipsoid(0.05, 0.011, 0.035, M.skin, 28); fing.position.set(0.118, -0.004, -0.002*thumb); fing.rotation.z = -curl; hand.add(fing);
      hand.add(taper(new V3(0.015, -0.002, 0.03*thumb), new V3(0.075, -0.006, 0.052*thumb), 0.012, 0.009, M.skin));
    }
    // arms by the side on foam pads
    [1, -1].forEach(function(s){
      var sh = new V3(hx-0.16, T+0.1, s*0.2), el = new V3(hx-0.44, T+0.075, s*0.255), wr = new V3(hx-0.7, T+0.06, s*0.265);
      patient.add(taper(sh, el, 0.047, 0.037, M.skin));
      patient.add(taper(sh, sh.clone().lerp(el, 0.3), 0.056, 0.05, M.gown));
      patient.add(taper(el, wr, 0.037, 0.026, M.skin));
      var j = ellipsoid(0.037, 0.034, 0.037, M.skin, 24); j.position.copy(el); patient.add(j);
      makeHand(wr, new V3(-1, -0.05, s*0.02).normalize(), 0.3, 1);
      var ap = rbox(0.5, 0.025, 0.1, 0.01, M.foam); ap.position.set(hx-0.55, T+0.012, s*0.262); patient.add(ap);
    });

    // legs: hips at the end of the torso; local -z = the patient's RIGHT (the leg being scanned, nearest the camera)
    var hipX = tx0 - tLen + 0.07, HY = T + 0.085;
    function leg(side, knee, ankle, footDir, rollDeg){
      var hip = new V3(hipX, HY, side*0.095);
      patient.add(taper(hip, knee, 0.082, 0.056, M.skin));
      patient.add(taper(hip, hip.clone().lerp(knee, 0.35), 0.094, 0.083, M.short));     // gown shorts
      var kn = ellipsoid(0.058, 0.052, 0.056, M.skin, 28); kn.position.copy(knee); patient.add(kn);
      var pat = ellipsoid(0.026, 0.012, 0.028, M.skin, 16); pat.position.copy(knee).add(new V3(0, 0.048, 0)); patient.add(pat);
      patient.add(taper(knee, ankle, 0.05, 0.032, M.skin));
      var calf = ellipsoid(0.12, 0.05, 0.05, M.skin, 28);                               // calf bulge
      var cdir = new V3().subVectors(ankle, knee); calf.position.copy(knee).addScaledVector(cdir, 0.3).add(new V3(0, -0.008, 0));
      calf.quaternion.setFromUnitVectors(new V3(1, 0, 0), cdir.clone().normalize()); patient.add(calf);
      var foot = new THREE.Group(); foot.position.copy(ankle); patient.add(foot);
      foot.quaternion.setFromUnitVectors(new V3(0, 1, 0), footDir.clone().normalize());
      foot.rotateY(rollDeg*Math.PI/180);
      var f1m = ellipsoid(0.036, 0.11, 0.042, M.skin, 28); f1m.position.set(-0.012, 0.075, 0); foot.add(f1m);
      var heel = ellipsoid(0.034, 0.03, 0.032, M.skin, 20); heel.position.set(0.02, -0.005, 0); foot.add(heel);
      var toes = ellipsoid(0.02, 0.03, 0.045, M.skin, 20); toes.position.set(-0.02, 0.17, 0); foot.add(toes);
      return { knee:knee, ankle:ankle };
    }
    var xK = hipX - 0.44, xA = xK - 0.41;
    leg(1, new V3(xK, T+0.056, 0.105), new V3(xA, T+0.04, 0.125), new V3(0, 1, 0.12), 0);       // left leg, straight, a little apart
    var R;
    if(pose === "flexed"){
      R = leg(-1, new V3(xK + 0.06, T+0.2, -0.1), new V3(xA + 0.12, T+0.04, -0.1), new V3(-0.25, 1, -0.05), 0);
      var wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 3, 1), M.foam);  // triangular foam wedge under the knee
      wedge.rotation.x = -Math.PI/2; wedge.position.set(xK + 0.06, T + 0.065, -0.1); wedge.castShadow = wedge.receiveShadow = true; patient.add(wedge);
    } else if(pose === "rotated"){
      R = leg(-1, new V3(xK, T+0.056, -0.105), new V3(xA, T+0.04, -0.13), new V3(0, 0.6, -0.8), -40);
    } else {
      R = leg(-1, new V3(xK, T+0.056, -0.105), new V3(xA, T+0.04, -0.12), new V3(0, 1, -0.04), 0);
      [-0.21, -0.03].forEach(function(z){                                               // sandbags either side of the foot
        var bag = rbox(0.24, 0.06, 0.07, 0.03, M.bag); bag.position.set(xA - 0.02, T + 0.03, z); patient.add(bag);
      });
      var pad = rbox(0.3, 0.02, 0.12, 0.01, M.foam); pad.position.set(xA + 0.18, T + 0.01, -0.12); patient.add(pad);
    }

    // two flexible arrays wrapped round the right lower leg, overlapping, from just above the knee to the ankle
    var dir = new V3().subVectors(R.ankle, R.knee), len = dir.length(); dir.normalize();
    var q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir);
    var qr = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), Math.PI/2));
    function wrap(t0, t1, extra){
      var a = R.knee.clone().addScaledVector(dir, t0*len), b = R.knee.clone().addScaledVector(dir, t1*len);
      var r0 = 0.05 + (0.032 - 0.05)*Math.max(0, t0) + extra, r1 = 0.05 + (0.032 - 0.05)*Math.min(1, t1) + extra;
      var m = new THREE.Mesh(new THREE.CylinderGeometry(r1 + 0.014, r0 + 0.014, b.distanceTo(a), 40, 1, true), M.coilShell);
      m.position.copy(a).lerp(b, 0.5); m.quaternion.copy(q); m.castShadow = m.receiveShadow = true; patient.add(m);
      [[a, r0], [b, r1]].forEach(function(e){
        var rim = new THREE.Mesh(new THREE.TorusGeometry(e[1] + 0.014, 0.006, 8, 40), M.coilEdge);
        rim.position.copy(e[0]); rim.quaternion.copy(qr); patient.add(rim);
      });
      var mid = (t0 + t1)/2, rm = 0.05 + (0.032 - 0.05)*mid + extra;
      var strap = new THREE.Mesh(new THREE.TorusGeometry(rm + 0.019, 0.007, 8, 40), M.strap);
      strap.position.copy(R.knee).addScaledVector(dir, mid*len); strap.quaternion.copy(qr); patient.add(strap);
    }
    wrap(-0.12, 0.5, 0.004);
    wrap(0.42, 1.04, 0.012);
    var midP = R.knee.clone().addScaledVector(dir, 0.45*len);
    var lab = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.055), M.coilLabel);
    lab.position.copy(midP).add(new V3(0, 0.064, 0)); lab.rotation.x = -Math.PI/2; lab.rotation.z = Math.PI/2; patient.add(lab);
    var cs = R.knee.clone().addScaledVector(dir, 0.2*len).add(new V3(0, 0, -0.06)), sock = new V3(cs.x + 0.1, T + 0.02, -0.25);
    patient.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([cs, new V3(cs.x + 0.03, cs.y - 0.02, cs.z - 0.06), new V3(sock.x - 0.03, T + 0.04, sock.z + 0.02), sock]), 40, 0.007, 8, false), M.cable));
    var plug = rbox(0.06, 0.03, 0.04, 0.008, M.dark); plug.position.copy(sock); patient.add(plug);
    EL = midP.clone().add(new V3(0, 0.055, 0));        // coil centre = landmark (mid-shin)

    patient.updateMatrix();
    ELc = EL.clone().applyMatrix4(patient.matrix);
  }
  M.coilShell = M.coil.clone(); M.coilShell.side = THREE.DoubleSide;
  M.bellows = new THREE.MeshStandardMaterial({ color:0x5a6470, roughness:0.6 });
  M.tubeDark = new THREE.MeshStandardMaterial({ color:0x9aa3ab, roughness:0.4 });
  buildPatient("straight");

  function updateTube(){}                     // (no injector line in this scene)

  /* ---------------- lasers (traced onto the patient's surface) ---------------- */
  var laserGroup = new THREE.Group(); laserGroup.visible = false; scene.add(laserGroup);
  var ray = new THREE.Raycaster();
  function laserLine(points){
    if(points.length < 2) return;
    var c = new THREE.CatmullRomCurve3(points);
    laserGroup.add(new THREE.Mesh(new THREE.TubeGeometry(c, points.length*2, 0.0016, 6, false), M.laser));
    laserGroup.add(new THREE.Mesh(new THREE.TubeGeometry(c, points.length*2, 0.006, 6, false), M.laserGlow));
  }
  function buildLasers(){
    while(laserGroup.children.length){ var m = laserGroup.children.pop(); m.geometry.dispose(); }
    scene.updateMatrixWorld(true);
    var hitTargets = [];
    patient.traverse(function(c){ if(c.isMesh && c !== pillow && c !== armPad) hitTargets.push(c); });
    var pts = [], z, hit;
    for(z=-0.36; z<=0.36; z+=0.008){                       // transverse line in the gantry laser plane
      ray.set(new V3(LASER_X, 2, z), new V3(0, -1, 0));
      hit = ray.intersectObjects(hitTargets.concat([mat]), false)[0];
      if(hit) pts.push(hit.point.clone().addScaledVector(hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new V3(0,1,0), 0.002));
    }
    laserLine(pts);
    pts = [];
    for(var x=LASER_X-0.3; x<=LASER_X+0.22; x+=0.01){       // longitudinal line at shoulder height
      ray.set(new V3(x, EL.y, 1.0), new V3(0, 0, -1));
      hit = ray.intersectObjects(hitTargets, false)[0];
      if(hit) pts.push(hit.point.clone().add(new V3(0, 0, 0.002)));
    }
    laserLine(pts);
    // the beam from the gantry aperture down to the patient
    var beam = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.5), M.laserGlow);
    beam.position.set(LASER_X, BY+BR+0.02, 0); beam.rotation.y = Math.PI/2; laserGroup.add(beam);
  }

  /* ---------------- camera / animation ---------------- */
  var COUCH0 = 0.0;
  var X1, X2;
  function calcX(){ X1 = LASER_X - ELc.x; X2 = G - ELc.x; }   // coil centre to the lasers, then to isocentre
  calcX();
  var CAM_A = { p:new V3(-0.9, 2.6, 4.1), t:new V3(0.2, 0.88, 0) };
  var CAM_B = { p:new V3(0.5, 2.2, 2.9), t:new V3(1.65, 1.0, 0) };
  function setCam(k){
    camera.position.lerpVectors(CAM_A.p, CAM_B.p, k);
    camera.lookAt(new V3().lerpVectors(CAM_A.t, CAM_B.t, k));
  }
  function ease(t){ return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3)/2; }

  var running = false, raf = 0, anim = null;
  function resize(){
    var w = host.clientWidth || 600, h = host.clientHeight || 600;
    renderer.setSize(w, h, false); camera.aspect = w/h;
    camera.fov = w/h < 0.9 ? 42 : 30;              // narrow phone viewports: widen the view
    camera.updateProjectionMatrix();
  }
  function frame(now){
    raf = 0;
    if(anim){
      var t = (now - anim.t0)/1000, step = anim.step;
      if(t < 2.6){ couch.position.x = COUCH0 + (X1 - COUCH0)*ease(t/2.6); if(step < 1){ anim.step = 1; anim.onStep(1); } }
      else if(t < 4.1){ couch.position.x = X1; if(step < 2){ anim.step = 2; buildLasers(); laserGroup.visible = true; anim.onStep(2); } }
      else if(t < 6.6){ if(step < 3){ anim.step = 3; laserGroup.visible = false; anim.onStep(3); } couch.position.x = X1 + (X2 - X1)*ease((t - 4.1)/2.5); }
      else if(t < 7.6){ couch.position.x = X2; setShellOpacity(1 - 0.72*ease(Math.min(1, (t - 6.6)/0.9))); if(step < 4){ anim.step = 4; anim.onStep(4); } }
      else { couch.position.x = X2; setShellOpacity(0.28); var done = anim.onDone; anim = null; if(done) done(); }
      setCam(Math.min(1, t/7.2));
      updateTube();
    }
    renderer.render(scene, camera);
    if(running && anim) raf = requestAnimationFrame(frame);
  }
  function kick(){ if(!raf) raf = requestAnimationFrame(frame); }

  var ro = (typeof ResizeObserver !== "undefined") ? new ResizeObserver(function(){ resize(); kick(); }) : null;
  if(ro) ro.observe(host);
  resize();

  function reset(){
    anim = null; couch.position.x = COUCH0; laserGroup.visible = false; setShellOpacity(1); setCam(0); updateTube(); kick();
  }
  reset();

  return {
    play:function(onStep, onDone){ running = true; anim = { t0:performance.now(), step:0, onStep:onStep || function(){}, onDone:onDone }; kick(); },
    reset:reset,
    start:function(){ running = true; resize(); kick(); },
    stop:function(){ running = false; if(raf){ cancelAnimationFrame(raf); raf = 0; } },
    pose:function(k){ anim = null; couch.position.x = k===2 ? X1 : (k===3 ? X2 : COUCH0); if(k===2){ buildLasers(); laserGroup.visible = true; } else laserGroup.visible = false; setShellOpacity(k===3 ? 0.28 : 1); setCam(k===2 ? 0.55 : k===3 ? 1 : 0); updateTube(); kick(); },
    cam:function(p, t){ CAM_A = CAM_B = { p:new V3(p[0],p[1],p[2]), t:new V3(t[0],t[1],t[2]) }; setCam(0); kick(); },
    setPose:function(name){
      if(name !== POSE){ buildPatient(name); calcX(); }
            // finish beside the magnet; its covers fade so the coil at isocentre can be seen
      CAM_B = { p:new V3(0.55, 2.15, 2.85), t:new V3(1.7, 1.0, 0) };
      reset();
    },
    finish:function(){ if(anim){ anim.t0 = performance.now() - 7600; kick(); } },
    snap:function(w, h){                         // debug: render one frame at w x h and return it as a PNG data URL
      renderer.setSize(w, h, false); camera.aspect = w/h; camera.fov = 30; camera.updateProjectionMatrix();
      renderer.render(scene, camera); var u = renderer.domElement.toDataURL("image/png"); resize(); kick(); return u;
    },
    renderer:renderer
  };
};
