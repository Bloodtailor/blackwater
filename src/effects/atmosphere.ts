// Atmosphere (DESIGN §15, M4): per-zone fog/darkness grades, ambient light
// falloff with depth, god-ray billboards at the cenote shaft, and the always-on
// ambient particulate. Also owns the headlamp cone: it narrows and shortens
// during a silt-out (backscatter, DESIGN §7.2). Murk is the art style — fog
// does the heavy lifting; everything here just shapes it.

import * as THREE from 'three';
import { TUNING } from '../tuning';
import { SKY_SHAFT, type Zone } from '../cave/data';

interface ZoneEnv {
  fog: number; // underwater fog/background color
  ambient: number; // ambient light color underwater
  mote: number; // particulate tint (cyan hints in the deep — palette §15)
}

// Palette by depth: sun-dappled teal → grey-green → near-black → black with
// cyan accents. Colors are art direction, not gameplay numbers (like ZONE_ROCK).
const ZONE_ENV: Record<Zone, ZoneEnv> = {
  sinkhole: { fog: 0x0d3640, ambient: 0x3a4a50, mote: 0xc8d8d2 },
  galleries: { fog: 0x08211e, ambient: 0x33443f, mote: 0xb8c8bc },
  maze: { fog: 0x070b0a, ambient: 0x2e3430, mote: 0xcfcabb },
  throat: { fog: 0x03070c, ambient: 0x232c38, mote: 0x86ccd8 },
  abyss: { fog: 0x020609, ambient: 0x1e2a38, mote: 0x74d8e4 },
};

const ABOVE = { bg: 0x8fb6c4, fog: 0x9fc3cf, density: 0.012, ambient: 0.65 };
// Head above water but underground (air bells, dry passages, the slide):
// lightless cave air — your lamp is the only reason you see anything.
const CAVE_AIR = { bg: 0x04080a, fog: 0x04080a, density: 0.006, ambient: 0.3 };

export class Atmosphere {
  /** Current effective visibility in metres (smoothed; harness/debug). */
  visM: number = TUNING.visibility.clearVisM.sinkhole;
  /** Debug: disable fog entirely for screenshots. */
  fogOff = false;

  private fogColor = new THREE.Color(ZONE_ENV.sinkhole.fog);
  private ambientColor = new THREE.Color(ZONE_ENV.sinkhole.ambient);
  private moteColor = new THREE.Color(ZONE_ENV.sinkhole.mote);
  private targetFog = new THREE.Color();
  private targetAmbient = new THREE.Color();
  private targetMote = new THREE.Color();
  private beamHalf: number;
  private beamThrow = 65;
  private motes: THREE.Points;
  private motePos: Float32Array;
  private moteVel: Float32Array;
  private moteMat: THREE.ShaderMaterial;
  private rays: THREE.Group;

  constructor(
    private scene: THREE.Scene,
    private fog: THREE.FogExp2,
    private ambient: THREE.AmbientLight,
    private headlamp: THREE.SpotLight,
  ) {
    this.beamHalf = THREE.MathUtils.degToRad(TUNING.light.beamAngleDeg / 2);
    this.rays = buildGodRays();
    scene.add(this.rays);

    // ambient particulate: motes riding the CURRENT (user 2026-07-18 — the
    // current is visible now) in a box that follows the camera; per-mote
    // velocity is only a small individual jitter on top
    const A = TUNING.atmosphere;
    const n = A.particulateCount;
    this.motePos = new Float32Array(n * 3);
    this.moteVel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.motePos[i * 3] = (Math.random() - 0.5) * A.particulateBoxM;
      this.motePos[i * 3 + 1] = (Math.random() - 0.5) * A.particulateBoxM;
      this.motePos[i * 3 + 2] = (Math.random() - 0.5) * A.particulateBoxM;
      this.moteVel[i * 3] = (Math.random() - 0.5) * 0.07;
      this.moteVel[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      this.moteVel[i * 3 + 2] = (Math.random() - 0.5) * 0.07;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    // custom shader: motes are BRIGHT close to the lens and fade with camera
    // distance (user 2026-07-18) — the water reads as full of matter around
    // you without walling off the view
    this.moteMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: softDotTexture() },
        uColor: { value: new THREE.Color(ZONE_ENV.sinkhole.mote) },
        uOpacity: { value: 0.55 },
        uNear: { value: A.particulateFadeNearM },
        uFar: { value: A.particulateFadeFarM },
        uSize: { value: 0.1 },
      },
      vertexShader: /* glsl */ `
        uniform float uSize;
        uniform float uNear;
        uniform float uFar;
        varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float d = length(mv.xyz);
          gl_PointSize = uSize * (240.0 / max(d, 0.4));
          vFade = 1.0 - smoothstep(uNear, uFar, d);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vFade;
        void main() {
          vec4 tex = texture2D(uMap, gl_PointCoord);
          gl_FragColor = vec4(uColor, uOpacity * vFade) * tex;
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    this.motes = new THREE.Points(geo, this.moteMat);
    this.motes.frustumCulled = false;
    scene.add(this.motes);
  }

  /**
   * @param visTargetM effective visibility at the camera (zone clear vis,
   *   possibly reduced by the silt system)
   * @param siltout true while the camera is inside an active silt-out
   * @param current ambient current at the camera — the motes ride it
   * @param daylight head above water AND under the open cenote sky (false in
   *   underground air: bells, dry passages, the slide)
   * @param reveal noclip map-survey mode: no fog, bright flat light (debug)
   */
  update(
    dt: number,
    cam: THREE.Vector3,
    headAbove: boolean,
    zone: Zone,
    visTargetM: number,
    siltout: boolean,
    current: THREE.Vector3,
    daylight: boolean,
    reveal = false,
  ): void {
    const V = TUNING.visibility;
    const A = TUNING.atmosphere;
    const k = Math.min(1, dt * V.lerpPerSec);

    if (reveal) {
      // debug survey: see the WHOLE map (user 2026-07-18)
      if (!(this.scene.background instanceof THREE.Color)) this.scene.background = new THREE.Color();
      (this.scene.background as THREE.Color).setHex(0x1c2429);
      this.fog.density = 0;
      this.ambient.color.setHex(0xffffff);
      this.ambient.intensity = 1.5;
      this.motes.visible = false;
      this.rays.visible = false;
      return;
    }

    if (headAbove) {
      const env = daylight ? ABOVE : CAVE_AIR;
      if (!(this.scene.background instanceof THREE.Color)) this.scene.background = new THREE.Color();
      (this.scene.background as THREE.Color).setHex(env.bg);
      this.fog.color.setHex(env.fog);
      this.fog.density = this.fogOff ? 0 : env.density;
      this.ambient.color.setHex(0x3a4a50);
      this.ambient.intensity = env.ambient;
    } else {
      const env = ZONE_ENV[zone];
      this.targetFog.setHex(env.fog);
      this.targetAmbient.setHex(env.ambient);
      this.fogColor.lerp(this.targetFog, k);
      this.ambientColor.lerp(this.targetAmbient, k);
      this.visM += (visTargetM - this.visM) * k;
      this.fog.color.copy(this.fogColor);
      this.fog.density = this.fogOff ? 0 : V.fogK / this.visM;
      if (!(this.scene.background instanceof THREE.Color)) this.scene.background = new THREE.Color();
      (this.scene.background as THREE.Color).copy(this.fogColor);
      // light falls off with depth: full near the surface, a remnant at depth
      const depth = -cam.y;
      const t = THREE.MathUtils.clamp((depth - A.depthDarkStart) / (A.depthDarkEnd - A.depthDarkStart), 0, 1);
      this.ambient.color.copy(this.ambientColor);
      this.ambient.intensity = 0.55 * THREE.MathUtils.lerp(1, A.depthDarkFloor, t);
    }

    // headlamp cone: narrow + short during a silt-out (backscatter)
    const L = TUNING.light;
    const targetHalf = THREE.MathUtils.degToRad((siltout ? L.siltBeamAngleDeg : L.beamAngleDeg) / 2);
    const targetThrow = siltout ? L.siltThrowM : 65;
    this.beamHalf += (targetHalf - this.beamHalf) * Math.min(1, dt * 3);
    this.beamThrow += (targetThrow - this.beamThrow) * Math.min(1, dt * 3);
    this.headlamp.angle = this.beamHalf;
    this.headlamp.distance = this.beamThrow;
    this.headlamp.penumbra = siltout ? 0.95 : 0.65;

    // particulate: ride the current + tiny jitter, wrap into the camera box;
    // more motes the deeper you go (user 2026-07-18)
    this.motes.visible = !headAbove;
    if (this.motes.visible) {
      const env = ZONE_ENV[zone];
      this.targetMote.setHex(env.mote);
      this.moteColor.lerp(this.targetMote, k);
      (this.moteMat.uniforms.uColor.value as THREE.Color).copy(this.moteColor);
      const depthFrac = THREE.MathUtils.clamp(-cam.y / A.particulateFullDepthM, 0, 1);
      const density = THREE.MathUtils.lerp(A.particulateDepthMinFrac, 1, depthFrac);
      const half = A.particulateBoxM / 2;
      const size = A.particulateBoxM;
      const n = A.particulateCount;
      for (let i = 0; i < n; i++) {
        let x = this.motePos[i * 3] + (current.x + this.moteVel[i * 3]) * dt;
        let y = this.motePos[i * 3 + 1] + (current.y + this.moteVel[i * 3 + 1]) * dt;
        let z = this.motePos[i * 3 + 2] + (current.z + this.moteVel[i * 3 + 2]) * dt;
        // wrap relative to the camera so the cloud follows without popping
        x = wrap(x, cam.x, half, size);
        y = wrap(y, cam.y, half, size);
        z = wrap(z, cam.z, half, size);
        this.motePos[i * 3] = x;
        this.motePos[i * 3 + 1] = y;
        this.motePos[i * 3 + 2] = z;
      }
      this.motes.geometry.setDrawRange(0, Math.floor(n * density));
      (this.motes.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // god rays only matter near the cenote; hide them at depth (cheap cull)
    this.rays.visible = cam.y > -35;
  }
}

function wrap(v: number, center: number, half: number, size: number): number {
  if (v < center - half) return v + size;
  if (v > center + half) return v - size;
  return v;
}

// Billboard shafts of daylight under the cenote mouth (§15: god rays only at
// the sinkhole shaft). Additive gradient planes, slightly slanted like sun
// through water.
function buildGodRays(): THREE.Group {
  const g = new THREE.Group();
  const tex = rayTexture();
  const [sx, , sz] = SKY_SHAFT.a;
  for (let i = 0; i < 6; i++) {
    const w = 2.5 + (i % 3) * 1.6;
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.09 + (i % 2) * 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, 24), mat);
    const ang = (i / 6) * Math.PI * 2 + 0.4;
    const r = SKY_SHAFT.r * (0.15 + 0.55 * ((i * 0.37) % 1));
    plane.position.set(sx + Math.cos(ang) * r, -9, sz + Math.sin(ang) * r);
    plane.rotation.y = ang + Math.PI / 2 + (i - 3) * 0.12;
    plane.rotation.z = 0.1 + (i % 3) * 0.05; // slant: sun is never dead-vertical
    g.add(plane);
  }
  return g;
}

function rayTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    const v = ctx.createLinearGradient(0, 0, 0, 256);
    v.addColorStop(0, 'rgba(235,250,240,0.85)');
    v.addColorStop(0.55, 'rgba(190,230,220,0.30)');
    v.addColorStop(1, 'rgba(160,210,200,0)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, 64, 256);
    // soften the vertical edges
    const h = ctx.createLinearGradient(0, 0, 64, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)');
    h.addColorStop(0.25, 'rgba(0,0,0,0)');
    h.addColorStop(0.75, 'rgba(0,0,0,0)');
    h.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = h;
    ctx.fillRect(0, 0, 64, 256);
  }
  return new THREE.CanvasTexture(c);
}

// Shared soft radial sprite (untextured Points render as squares — M3 lesson).
export function softDotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 15);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
  }
  return new THREE.CanvasTexture(c);
}
