// Cave mesh extraction: naive surface nets over the SDF (sdf.ts). Watertight,
// organic, handles overhangs/junctions for free because it meshes one
// continuous field. Vertex colors carry zone palette + noise shading; flat
// shading makes it read as rock (M0 lesson).

import * as THREE from 'three';
import { bounds, regionAt, sdf } from './sdf';
import { fbm } from '../util/noise';
import { TUNING } from '../tuning';
import type { Zone } from './data';

const ZONE_ROCK: Record<Zone, [number, number, number]> = {
  sinkhole: [0.47, 0.58, 0.53],
  galleries: [0.43, 0.46, 0.4],
  maze: [0.55, 0.52, 0.44],
  throat: [0.34, 0.36, 0.4],
  abyss: [0.3, 0.35, 0.45],
};

export interface CaveMeshResult {
  mesh: THREE.Mesh;
  tris: number;
  genMs: number;
}

export function buildCaveMesh(): CaveMeshResult {
  const t0 = performance.now();
  const cs = TUNING.geometry.cellSize;
  const pad = 1.5;
  const min: [number, number, number] = [bounds.min[0] - pad, bounds.min[1] - pad, bounds.min[2] - pad];
  const nx = Math.ceil((bounds.max[0] + pad - min[0]) / cs);
  const ny = Math.ceil((bounds.max[1] + pad - min[1]) / cs);
  const nz = Math.ceil((bounds.max[2] + pad - min[2]) / cs);

  // corner field (doors excluded: door plugs are separate visual meshes)
  const fw = nx + 1;
  const fh = ny + 1;
  const field = new Float32Array(fw * fh * (nz + 1));
  const fi = (i: number, j: number, k: number) => (k * fh + j) * fw + i;
  for (let k = 0; k <= nz; k++) {
    const z = min[2] + k * cs;
    for (let j = 0; j <= ny; j++) {
      const y = min[1] + j * cs;
      for (let i = 0; i <= nx; i++) {
        field[fi(i, j, k)] = sdf(min[0] + i * cs, y, z, false);
      }
    }
  }

  // one vertex per sign-change cell (centroid of edge crossings)
  const CELL_EDGES: [number[], number[]][] = [];
  for (const axis of [0, 1, 2]) {
    for (const u of [0, 1]) {
      for (const v of [0, 1]) {
        const a = [0, 0, 0];
        a[(axis + 1) % 3] = u;
        a[(axis + 2) % 3] = v;
        const b = [...a];
        b[axis] = 1;
        CELL_EDGES.push([a, b]);
      }
    }
  }
  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const ci = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const vertPos: number[] = [];
  const vertCol: number[] = [];
  let vertCount = 0;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        let neg = false;
        let pos = false;
        for (let c = 0; c < 8; c++) {
          const v = field[fi(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          if (v < 0) neg = true;
          else pos = true;
        }
        if (!neg || !pos) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let cnt = 0;
        for (const [a, b] of CELL_EDGES) {
          const va = field[fi(i + a[0], j + a[1], k + a[2])];
          const vb = field[fi(i + b[0], j + b[1], k + b[2])];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += i + a[0] + (b[0] - a[0]) * t;
          sy += j + a[1] + (b[1] - a[1]) * t;
          sz += k + a[2] + (b[2] - a[2]) * t;
          cnt++;
        }
        if (!cnt) continue;
        const wx = min[0] + (sx / cnt) * cs;
        const wy = min[1] + (sy / cnt) * cs;
        const wz = min[2] + (sz / cnt) * cs;
        cellVert[ci(i, j, k)] = vertCount++;
        vertPos.push(wx, wy, wz);
        const zone = regionAt(wx, wy, wz)?.zone ?? 'galleries';
        const base = ZONE_ROCK[zone];
        const broad = fbm(wx * 0.16, wy * 0.16, wz * 0.16);
        const fine = fbm(wx * 0.75 + 11.3, wy * 0.75, wz * 0.75);
        const shade = Math.min(1.6, Math.max(0.4, 1 + broad * 0.25 + fine * 0.45));
        vertCol.push(base[0] * shade, base[1] * shade, base[2] * shade);
      }
    }
  }

  // faces: one quad per crossing lattice edge, joining the 4 surrounding cells
  const triIdx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) triIdx.push(a, c, b, a, d, c);
    else triIdx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz; k++) {
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const f0 = field[fi(i, j, k)];
        // x-edge
        const fx = field[fi(i + 1, j, k)];
        if (f0 < 0 !== fx < 0 && i < nx - 1) {
          quad(cellVert[ci(i, j - 1, k - 1)], cellVert[ci(i, j, k - 1)], cellVert[ci(i, j, k)], cellVert[ci(i, j - 1, k)], f0 < 0);
        }
        // y-edge
        const fy = field[fi(i, j + 1, k)];
        if (f0 < 0 !== fy < 0 && j < ny - 1) {
          quad(cellVert[ci(i - 1, j, k - 1)], cellVert[ci(i - 1, j, k)], cellVert[ci(i, j, k)], cellVert[ci(i, j, k - 1)], f0 < 0);
        }
        // z-edge
        const fz = field[fi(i, j, k + 1)];
        if (f0 < 0 !== fz < 0 && k < nz - 1) {
          quad(cellVert[ci(i - 1, j - 1, k)], cellVert[ci(i, j - 1, k)], cellVert[ci(i, j, k)], cellVert[ci(i - 1, j, k)], f0 < 0);
        }
      }
    }
  }

  // expand to non-indexed (flat shading needs per-face normals)
  const triCount = triIdx.length / 3;
  const positions = new Float32Array(triIdx.length * 3);
  const colors = new Float32Array(triIdx.length * 3);
  for (let t = 0; t < triIdx.length; t++) {
    const v = triIdx[t];
    positions[t * 3] = vertPos[v * 3];
    positions[t * 3 + 1] = vertPos[v * 3 + 1];
    positions[t * 3 + 2] = vertPos[v * 3 + 2];
    colors[t * 3] = vertCol[v * 3];
    colors[t * 3 + 1] = vertCol[v * 3 + 1];
    colors[t * 3 + 2] = vertCol[v * 3 + 2];
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0.02,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; // single world mesh, always visible
  return { mesh, tris: triCount, genMs: performance.now() - t0 };
}
