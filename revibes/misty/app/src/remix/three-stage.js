// Only imported when builders are visible and motion is allowed.
import * as THREE from 'three';

export function createBuilderStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(375, 240, false);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-5.3, 5.3, 3.4, -3.4, 0.1, 60);
  camera.position.set(0, 7, 10); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x74768d, 2.6));
  const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(-3, 6, 5); scene.add(light);
  const colors = [0x76539f, 0x367891], materials = colors.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  const paper = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe9e4ee, roughness: 1 });
  const box = new THREE.BoxGeometry(1, 1, 1), sphere = new THREE.SphereGeometry(0.24, 10, 8);
  function mesh(parent, geometry, material, scale, position) { const m = new THREE.Mesh(geometry, material); m.scale.set(...scale); m.position.set(...position); parent.add(m); return m; }
  mesh(scene, box, floorMaterial, [3.2, 0.12, 4.3], [0, -0.12, 0]);
  [-4, 4].forEach((x, i) => { mesh(scene, box, materials[i], [1.5, 0.12, 1.7], [x, -0.12, 0]); });
  const robots = materials.map((material, i) => {
    const group = new THREE.Group(); scene.add(group);
    mesh(group, i ? box : sphere, material, i ? [0.44, 0.44, 0.44] : [1, 1, 1], [0, 1.1, 0]);
    mesh(group, box, material, [0.43, 0.48, 0.3], [0, 0.67, 0]);
    [-0.11, 0.11].forEach(x => mesh(group, box, paper, [0.055, 0.06, 0.03], [x, 1.12, 0.24]));
    const legs = [-0.13, 0.13].map(x => mesh(group, box, material, [0.12, 0.3, 0.13], [x, 0.25, 0]));
    [-0.3, 0.3].forEach(x => mesh(group, box, material, [0.11, 0.27, 0.12], [x, 0.74, 0.15]));
    const block = new THREE.Group(); block.position.set(0, 0.77, 0.5); group.add(block);
    const variants = ['BUTTON', 'CARD', 'NAV', 'IMAGE'].map((kind, index) => {
      const piece = new THREE.Group(); block.add(piece);
      const widths = [0.64, 0.92, 1.05, 0.78], depths = [0.3, 0.65, 0.27, 0.65];
      mesh(piece, box, material, [widths[index], 0.16, depths[index]], [0, 0, 0]);
      if (kind === 'NAV') [-0.3, 0, 0.3].forEach(x => mesh(piece, sphere, paper, [0.2,0.2,0.2], [x,0.1,0]));
      else if (kind === 'IMAGE') { mesh(piece, new THREE.ConeGeometry(0.19,0.22,3), paper, [1,1,1], [0,0.15,0]); }
      else [0, ...(kind === 'CARD' ? [0.17] : [])].forEach(z => mesh(piece, box, paper, [kind === 'CARD' ? 0.58 : 0.36,0.035,0.06], [0,0.1,z]));
      const label = document.createElement('canvas'); label.width = 256; label.height = 64;
      const ctx = label.getContext('2d'); ctx.fillStyle = i ? '#367891' : '#76539f'; ctx.fillRect(0,0,256,64); ctx.font = 'bold 30px Arial'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${i ? 'B' : 'A'} · ${kind}`,128,32);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(label), depthTest: false })); sprite.position.set(0,0.35,0); sprite.scale.set(1.25,.31,1); piece.add(sprite);
      return piece;
    });
    return { group, legs, block, variants, side: i ? 1 : -1 };
  });
  const blocks = Array.from({ length: 6 }, (_, index) => materials.map((material, source) => {
    const shape = mesh(scene, box, material, [1.15, 0.14, 0.47], [(source ? 0.65 : -0.65), 0.04, -1.45 + index * 0.56]);
    shape.visible = false; return shape;
  }));
  let state = { phase: 'waiting', parts: [] }, running = true, visible = true, raf, start = performance.now(), sampleStart = start, sampleFrames = 0;
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }); observer.observe(canvas);
  function draw(now) {
    if (!running) return;
    if (visible && !document.hidden) {
      const time = (now - start) / 1000;
      robots.forEach((robot, index) => {
        const cycle = ((time * 0.25 + index * 0.36) % 1), travel = (1 - Math.cos(cycle * Math.PI * 2)) / 2;
        const home = robot.side * 4, destination = robot.side * 0.65;
        robot.group.position.set(home + (destination - home) * travel, Math.abs(Math.sin(time * 5 + index)) * 0.06, 0.2);
        robot.group.rotation.y = travel < 0.5 ? -robot.side * 0.35 : robot.side * 0.35;
        robot.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(time * 7 + i * Math.PI) * 0.28; });
        robot.block.visible = cycle < 0.55;
        robot.variants.forEach((piece, variant) => { piece.visible = variant === Math.floor(time * 0.25 + index * 0.36) % 4; });
      });
      blocks.forEach((pair, index) => pair.forEach((block, source) => {
        const part = state.parts[index]; block.visible = !!part;
        if (part?.rect) { const rect = part.rect; block.position.set((rect.x + rect.w / 2 - .5) * 2.5 + (source ? .35 : -.35), .04, (rect.y + rect.h / 2 - .5) * 3.8); block.scale.set(Math.max(.3,rect.w * 1.2),.14,Math.max(.18,Math.min(.7,rect.h * 3))); }
      }));
      renderer.render(scene, camera);
      sampleFrames++;
      if (now - sampleStart >= 1000) { canvas.dataset.fps = String(Math.round(sampleFrames * 1000 / (now - sampleStart))); sampleFrames = 0; sampleStart = now; }
    }
    raf = requestAnimationFrame(draw);
  }
  raf = requestAnimationFrame(draw);
  return {
    update(next) { state = next; },
    dispose() {
      running = false; cancelAnimationFrame(raf); observer.disconnect();
      const geometries = new Set(), mats = new Set();
      scene.traverse(obj => { if (obj.geometry) geometries.add(obj.geometry); if (obj.material) mats.add(obj.material); });
      geometries.forEach(g => g.dispose()); mats.forEach(m => { m.map?.dispose(); m.dispose(); }); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
