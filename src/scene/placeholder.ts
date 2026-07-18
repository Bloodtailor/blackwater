import * as THREE from 'three';

// M0 placeholder only — real cave geometry comes from the SDF pipeline in M2.

function n3(x: number, y: number, z: number): number {
  return (
    (Math.sin(x * 1.7 + Math.sin(y * 2.1)) +
      Math.sin(y * 1.3 + Math.sin(z * 1.9)) +
      Math.sin(z * 1.5 + Math.sin(x * 2.3))) /
    3
  );
}

function fbm(x: number, y: number, z: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < 4; o++) {
    sum += n3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

// Radial displacement + per-vertex albedo variation, both keyed on position
// only, so seam-duplicated vertices stay identical and the mesh never cracks.
// Flat-color rock turns to mush under fog; vertex color is the cheap fix.
function rockify(geo: THREE.BufferGeometry, scaleFreq: number, amount: number, base: THREE.Color): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const broad = fbm(v.x * scaleFreq, v.y * scaleFreq, v.z * scaleFreq);
    const fine = fbm(v.x * scaleFreq * 4.7 + 13.1, v.y * scaleFreq * 4.7, v.z * scaleFreq * 4.7);
    v.multiplyScalar(1 + broad * amount + fine * amount * 0.25);
    pos.setXYZ(i, v.x, v.y, v.z);
    const shade = 1 + broad * 0.25 + fine * 0.45; // ±~0.7 spread of light/dark patches
    c.copy(base).multiplyScalar(THREE.MathUtils.clamp(shade, 0.4, 1.6));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export function createPlaceholderChamber(): THREE.Group {
  const group = new THREE.Group();
  // flatShading: faceted normals make displaced blobs read as rock instead of blur.
  const rockMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.95,
    metalness: 0.02,
    flatShading: true,
  });

  const shell = new THREE.SphereGeometry(18, 160, 120);
  rockify(shell, 0.16, 0.2, new THREE.Color(0x707768));
  // Negative-x scale flips winding so faces (and recomputed normals) point inward.
  shell.scale(-1.35, 0.85, 1.1);
  shell.computeVertexNormals();
  group.add(new THREE.Mesh(shell, rockMat));

  for (let i = 0; i < 7; i++) {
    const g = new THREE.IcosahedronGeometry(0.8 + (i % 3) * 0.7, 4);
    rockify(g, 0.9 + i * 0.13, 0.28, new THREE.Color(0x494f42));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rockMat);
    const a = (i / 7) * Math.PI * 2;
    m.position.set(Math.cos(a) * (5 + (i % 4) * 2.5), -11 + Math.sin(i * 3.1) * 1.5, Math.sin(a) * (4 + (i % 3) * 3));
    group.add(m);
  }

  group.add(new THREE.AmbientLight(0x2c3e42, 0.8));
  const cold = new THREE.PointLight(0x6fc4e8, 350, 90, 2);
  cold.position.set(8, 10, -5);
  group.add(cold);
  const warm = new THREE.PointLight(0xffb37a, 160, 60, 2);
  warm.position.set(-9, -6, 7);
  group.add(warm);

  return group;
}
