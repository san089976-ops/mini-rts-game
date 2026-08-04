import * as THREE from 'three';
import { MAP_HALF } from '../aircraft/defs';
import { MAPS, type MapDef, type MapStyle } from './maps';

export interface BridgeSpot {
  x: number;
  z: number;
  y: number;
  heading: number;
  span: number;
}

interface RiverPath {
  points: THREE.Vector2[];
  widths: number[];
}

function hash2(x: number, z: number) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0);
  const b = hash2(x0 + 1, z0);
  const c = hash2(x0, z0 + 1);
  const d = hash2(x0 + 1, z0 + 1);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, u), THREE.MathUtils.lerp(c, d, u), v);
}

function fbm(x: number, z: number) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < 5; i++) {
    sum += smoothNoise(x * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const abx = bx - ax;
  const abz = bz - az;
  const lenSq = abx * abx + abz * abz || 1;
  let t = ((px - ax) * abx + (pz - az) * abz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz);
}

export class World {
  readonly group = new THREE.Group();
  readonly style: MapStyle;
  readonly waterLevel: number;
  readonly runwayGround: number;
  readonly bridges: BridgeSpot[] = [];
  readonly runway = {
    center: new THREE.Vector3(0, 0, 180),
    heading: 0,
    length: 520,
    width: 36
  };

  private terrain!: THREE.Mesh;
  private heightData: Float32Array;
  private segments = 192;
  private size = MAP_HALF * 2;
  private rivers: RiverPath[] = [];
  private sceneLights: THREE.Object3D[] = [];
  private fogState!: THREE.FogExp2;
  private bgState!: THREE.Color;

  constructor(scene: THREE.Scene, style: MapStyle = 'canyon') {
    this.style = style;
    const def = MAPS[style];
    this.waterLevel = def.waterLevel;
    this.runwayGround = def.runwayGround;
    this.heightData = new Float32Array((this.segments + 1) * (this.segments + 1));
    this.buildSky(scene, def);
    this.buildRivers();
    this.buildTerrain(def);
    this.buildRunway(def);
    this.buildWater(def);
    this.buildDecor(def);
    this.generateBridges();
    this.sceneLights.push(this.group);
    this.fogState = new THREE.FogExp2(def.fogColor, def.fogDensity);
    this.bgState = new THREE.Color(def.skyColor);
    this.attach(scene);
  }

  private buildSky(scene: THREE.Scene, def: MapDef) {
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4a2e, 0.85);
    scene.add(hemi);
    this.sceneLights.push(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.05);
    sun.position.set(400, 800, 200);
    sun.castShadow = false;
    scene.add(sun);
    this.sceneLights.push(sun);
    const amb = new THREE.AmbientLight(0x8899aa, 0.25);
    scene.add(amb);
    this.sceneLights.push(amb);
  }

  attach(scene: THREE.Scene) {
    for (const o of this.sceneLights) scene.add(o);
    scene.fog = this.fogState;
    scene.background = this.bgState;
  }

  private buildRivers() {
    const count = this.style === 'canyon' ? 3 : this.style === 'riverplain' ? 4 : 0;
    for (let i = 0; i < count; i++) {
      this.rivers.push(this.generateRiverPath());
    }
  }

  private generateRiverPath(): RiverPath {
    const limit = MAP_HALF - 300;
    const points: THREE.Vector2[] = [];
    const widths: number[] = [];
    const startEdge = Math.floor(Math.random() * 4);
    let x = 0;
    let z = 0;
    let heading = 0;
    const edgePos = (Math.random() - 0.5) * limit * 1.8;
    const inwardJitter = Math.abs(Math.random() - 0.5) * 0.8;
    if (startEdge === 0) {
      x = -limit * 0.9;
      z = edgePos;
      heading = inwardJitter;
    } else if (startEdge === 1) {
      x = limit * 0.9;
      z = edgePos;
      heading = Math.PI + inwardJitter;
    } else if (startEdge === 2) {
      z = -limit * 0.9;
      x = edgePos;
      heading = Math.PI / 2 - inwardJitter;
    } else {
      z = limit * 0.9;
      x = edgePos;
      heading = -Math.PI / 2 + inwardJitter;
    }
    points.push(new THREE.Vector2(x, z));
    widths.push(34 + Math.random() * 24);
    let guard = 0;
    while (guard++ < 140) {
      heading += (Math.random() - 0.5) * 0.85;
      const step = 110 + Math.random() * 80;
      x += Math.sin(heading) * step;
      z += Math.cos(heading) * step;
      points.push(new THREE.Vector2(x, z));
      widths.push(34 + Math.random() * 24);
      if (Math.abs(x) > limit || Math.abs(z) > limit) break;
    }
    return { points, widths };
  }

  private riverProbe(river: RiverPath, x: number, z: number) {
    let best = Infinity;
    let seg = 0;
    for (let i = 0; i < river.points.length - 1; i++) {
      const a = river.points[i];
      const b = river.points[i + 1];
      const d = distToSegment(x, z, a.x, a.y, b.x, b.y);
      if (d < best) {
        best = d;
        seg = i;
      }
    }
    const a = river.points[seg];
    const b = river.points[Math.min(seg + 1, river.points.length - 1)];
    const abx = b.x - a.x;
    const abz = b.y - a.y;
    const lenSq = abx * abx + abz * abz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.y) * abz) / lenSq));
    const w0 = river.widths[seg] ?? 18;
    const w1 = river.widths[Math.min(seg + 1, river.widths.length - 1)] ?? 18;
    return { dist: best, width: THREE.MathUtils.lerp(w0, w1, t) };
  }

  private baseHeight(x: number, z: number) {
    const nx = (x / this.size) * 8;
    const nz = (z / this.size) * 8;
    if (this.style === 'canyon') {
      let h = fbm(nx + 20, nz - 11) * 240 - 32;
      const r = fbm(nx * 2.3 + 40, nz * 2.3 - 30);
      const ridge = Math.pow(Math.abs(r * 2 - 1), 1.7);
      h += ridge * 294 - 62;
      const detail = fbm(nx * 4.5 + 3, nz * 4.5 - 9);
      h += (detail - 0.5) * 48;
      return h;
    }
    if (this.style === 'archipelago') {
      let h = fbm(nx * 1.7 + 7, nz * 1.7 - 5) * 50 - 140;
      const island = Math.max(0, fbm(nx * 0.55 + 90, nz * 0.55 - 44) - 0.34);
      h += island * island * 1200;
      const isle2 = Math.max(0, fbm(nx * 0.9 + 140, nz * 0.9 + 70) - 0.45);
      h += isle2 * isle2 * 260;
      const detail = fbm(nx * 3.1 + 33, nz * 3.1 - 17);
      h += (detail - 0.5) * 20;
      const dx = x - this.runway.center.x;
      const dz = z - this.runway.center.z;
      const d = Math.hypot(dx, dz * 1.85);
      if (d < 460) {
        const t = 1 - d / 460;
        h += t * t * 68;
      }
      return h;
    }
    let h = fbm(nx * 1.25 + 20, nz * 1.25 - 11) * 96 - 45;
    const hills = Math.max(0, fbm(nx * 0.8 + 5, nz * 0.8 + 60) - 0.36);
    h += hills * hills * 200;
    const detail = fbm(nx * 3.6 + 60, nz * 3.6 + 22);
    h += (detail - 0.5) * 29;
    return h;
  }

  private buildTerrain(def: MapDef) {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const color = new THREE.Color();
    const step = this.size / this.segments;

    for (let i = 0; i < pos.count; i++) {
      this.heightData[i] = this.baseHeight(pos.getX(i), pos.getZ(i));
    }

    for (const river of this.rivers) this.carveRiver(river);
    if (this.style !== 'archipelago') this.carveLakes();
    this.flattenRunway();

    const s = this.segments;
    const at = (ix: number, iz: number) => {
      ix = THREE.MathUtils.clamp(ix, 0, s);
      iz = THREE.MathUtils.clamp(iz, 0, s);
      return this.heightData[iz * (s + 1) + ix];
    };

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.heightData[i];
      pos.setY(i, h);
      const gx = Math.round((x + this.size / 2) / step);
      const gz = Math.round((z + this.size / 2) / step);
      const slope =
        (Math.abs(at(gx + 1, gz) - at(gx - 1, gz)) + Math.abs(at(gx, gz + 1) - at(gx, gz - 1))) /
        (2 * step);
      color.setHex(this.colorFor(h, slope));
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
  }

  private colorFor(h: number, slope: number) {
    if (this.style === 'archipelago') {
      if (h < 0.4) return 0x3a5d6e;
      if (h < 4) return 0xc2b280;
      if (h < 26) return 0x5f8a4a;
      return slope > 0.3 ? 0x7d7a62 : 0x6d7f4a;
    }
    if (this.style === 'canyon') {
      if (h < 0.8) return 0x4a6b6f;
      if (slope > 0.32) return 0x7a6a55;
      if (h < 26) return 0x5f7a45;
      return 0x6d7f4a;
    }
    if (h < 0.8) return 0x4a7a6a;
    if (slope > 0.3) return 0x6d7a55;
    if (h < 18) return 0x5f8a4a;
    return 0x6d8a4a;
  }

  private carveRiver(river: RiverPath) {
    const half = this.size / 2;
    const step = this.size / this.segments;
    for (let iz = 0; iz <= this.segments; iz++) {
      const z = -half + iz * step;
      for (let ix = 0; ix <= this.segments; ix++) {
        const x = -half + ix * step;
        const { dist, width } = this.riverProbe(river, x, z);
        const edge = width / 2 + 12;
        if (dist >= edge) continue;
        const t = dist / edge;
        const smooth = t * t * (3 - 2 * t);
        const target = this.waterLevel - 6 * (1 - smooth) - 0.6;
        const idx = iz * (this.segments + 1) + ix;
        this.heightData[idx] = Math.min(this.heightData[idx], target);
      }
    }
  }

  private carveLakes() {
    const count = this.style === 'riverplain' ? 5 : 1;
    const half = this.size / 2;
    const step = this.size / this.segments;
    const lakes: Array<{ x: number; z: number; r: number }> = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * this.size * 0.7;
      const z = (Math.random() - 0.5) * this.size * 0.7;
      if (Math.hypot(x - this.runway.center.x, z - this.runway.center.z) < 500) continue;
      lakes.push({ x, z, r: 220 + Math.random() * 200 });
    }
    for (const lake of lakes) {
      const edge = lake.r + 60;
      for (let iz = 0; iz <= this.segments; iz++) {
        const z = -half + iz * step;
        for (let ix = 0; ix <= this.segments; ix++) {
          const x = -half + ix * step;
          const d = Math.hypot(x - lake.x, z - lake.z);
          if (d >= edge) continue;
          const t = d / edge;
          const smooth = t * t * (3 - 2 * t);
          const target = this.waterLevel - 9 * (1 - smooth) - 0.5;
          const idx = iz * (this.segments + 1) + ix;
          this.heightData[idx] = Math.min(this.heightData[idx], target);
        }
      }
    }
  }

  private flattenRunway() {
    const { length, center } = this.runway;
    const target = this.runwayGround;
    const half = this.size / 2;
    const step = this.size / this.segments;
    const zLimit = length * 0.7;
    for (let iz = 0; iz <= this.segments; iz++) {
      const z = -half + iz * step;
      for (let ix = 0; ix <= this.segments; ix++) {
        const x = -half + ix * step;
        const localX = x - center.x;
        const localZ = z - center.z;
        const tx = Math.min(1, Math.abs(localX) / 240);
        const tz = Math.abs(localZ) > zLimit ? Math.min(1, (Math.abs(localZ) - zLimit) / 260) : 0;
        const t = Math.max(tx * tx, tz);
        const idx = iz * (this.segments + 1) + ix;
        this.heightData[idx] = THREE.MathUtils.lerp(target, this.heightData[idx], t);
      }
    }
  }

  private buildRunway(def: MapDef) {
    const { length, width, center } = this.runway;
    const g = this.runwayGround;
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.6, length),
      new THREE.MeshLambertMaterial({ color: 0x2c3036 })
    );
    deck.position.set(center.x, g + 0.8, center.z);
    this.group.add(deck);

    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xe8e4d4 });
    for (let i = -8; i <= 8; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 10), stripeMat);
      s.position.set(center.x, g + 1.15, center.z + i * 28);
      this.group.add(s);
    }

    const thr = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.9, 0.25, 4),
      new THREE.MeshLambertMaterial({ color: 0xd9c27a })
    );
    thr.position.set(center.x, g + 1.15, center.z + length * 0.45);
    this.group.add(thr);

    const hangar = new THREE.Mesh(
      new THREE.BoxGeometry(48, 16, 32),
      new THREE.MeshLambertMaterial({ color: 0x5a6670 })
    );
    hangar.position.set(center.x + 70, g + 8.5, center.z + 40);
    this.group.add(hangar);
  }

  private buildWater(def: MapDef) {
    const geo = new THREE.PlaneGeometry(this.size, this.size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({
        color: def.waterColor,
        transparent: true,
        opacity: 0.72,
        depthWrite: false
      })
    );
    water.position.y = this.waterLevel + 0.15;
    this.group.add(water);
  }

  private buildDecor(def: MapDef) {
    const treeCount =
      this.style === 'archipelago' ? 40 : this.style === 'canyon' ? 80 : 100;
    const trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.5, 0.8, 4, 5),
      new THREE.MeshLambertMaterial({ color: 0x5a4030 }),
      treeCount
    );
    const crownMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(3.2, 7, 6),
      new THREE.MeshLambertMaterial({ color: 0x2f5a32 }),
      treeCount
    );
    const m4 = new THREE.Matrix4();
    let placed = 0;
    for (let i = 0; i < treeCount * 3 && placed < treeCount; i++) {
      const x = (Math.random() - 0.5) * this.size * 0.9;
      const z = (Math.random() - 0.5) * this.size * 0.9;
      if (this.isWater(x, z) || this.slope(x, z) > 0.45) continue;
      if (Math.hypot(x - this.runway.center.x, z - this.runway.center.z) < 250) continue;
      const y = this.getHeight(x, z);
      const scale = 0.8 + Math.random() * 0.7;
      m4.makeScale(scale, scale, scale).setPosition(x, y + 2, z);
      trunkMesh.setMatrixAt(placed, m4);
      m4.makeScale(scale, scale, scale).setPosition(x, y + 7, z);
      crownMesh.setMatrixAt(placed, m4);
      placed++;
    }
    trunkMesh.count = placed;
    crownMesh.count = placed;
    trunkMesh.instanceMatrix.needsUpdate = true;
    crownMesh.instanceMatrix.needsUpdate = true;
    this.group.add(trunkMesh, crownMesh);

    const rockCount = this.style === 'canyon' ? 40 : this.style === 'archipelago' ? 20 : 0;
    if (rockCount > 0) {
      const rockMesh = new THREE.InstancedMesh(
        new THREE.DodecahedronGeometry(1, 0),
        new THREE.MeshLambertMaterial({ color: 0x6f6a5f }),
        rockCount
      );
      const q = new THREE.Quaternion();
      let rockPlaced = 0;
      for (let i = 0; i < rockCount * 3 && rockPlaced < rockCount; i++) {
      const x = (Math.random() - 0.5) * this.size * 0.86;
      const z = (Math.random() - 0.5) * this.size * 0.86;
      if (this.isWater(x, z) || this.slope(x, z) > 0.5) continue;
      if (Math.hypot(x - this.runway.center.x, z - this.runway.center.z) < 280) continue;
      const s = 2 + Math.random() * 3.2;
        q.setFromEuler(
          new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3)
        );
        m4.compose(
          new THREE.Vector3(x, this.getHeight(x, z) + s * 0.35, z),
          q,
          new THREE.Vector3(s, s, s)
        );
        rockMesh.setMatrixAt(rockPlaced, m4);
        rockPlaced++;
      }
      rockMesh.count = rockPlaced;
      rockMesh.instanceMatrix.needsUpdate = true;
      this.group.add(rockMesh);
    }
  }

  private generateBridges() {
    if (this.style === 'archipelago') return;
    const maxBridges = this.style === 'canyon' ? 5 : 6;
    for (const river of this.rivers) {
      if (this.bridges.length >= maxBridges) break;
      const candidates: Array<{ i: number; score: number }> = [];
      for (let i = 3; i < river.points.length - 3; i++) {
        const p = river.points[i];
        const prev = river.points[i - 1];
        const next = river.points[i + 1];
        const a = new THREE.Vector2(p.x - prev.x, p.y - prev.y);
        const b = new THREE.Vector2(next.x - p.x, next.y - p.y);
        const cosA = a.dot(b) / (a.length() * b.length() || 1);
        if (cosA < 0.86) continue;
        const { width } = this.riverProbe(river, p.x, p.y);
        const tx = next.x - prev.x;
        const tz = next.y - prev.y;
        const tl = Math.hypot(tx, tz) || 1;
        const px = -tz / tl;
        const pz = tx / tl;
        const shore = width / 2 + 24;
        const lx = p.x + px * shore;
        const lz = p.y + pz * shore;
        const rx = p.x - px * shore;
        const rz = p.y - pz * shore;
        if (Math.abs(lx) > MAP_HALF - 80 || Math.abs(lz) > MAP_HALF - 80) continue;
        if (Math.abs(rx) > MAP_HALF - 80 || Math.abs(rz) > MAP_HALF - 80) continue;
        const hL = this.getHeight(lx, lz);
        const hR = this.getHeight(rx, rz);
        if (hL < this.waterLevel + 0.5 || hR < this.waterLevel + 0.5) continue;
        if (Math.max(this.slope(lx, lz), this.slope(rx, rz)) > 0.48) continue;
        if (Math.hypot(p.x - this.runway.center.x, p.y - this.runway.center.z) < 180) continue;
        let tooClose = false;
        for (const c of this.bridges) {
          if (Math.hypot(c.x - p.x, c.z - p.y) < 600) tooClose = true;
        }
        if (tooClose) continue;
        candidates.push({ i, score: cosA - Math.min(1, this.slope(lx, lz) + this.slope(rx, rz)) });
      }
      candidates.sort((p, q) => q.score - p.score);
      let placed = false;
      for (const cand of candidates) {
        if (this.bridges.length >= maxBridges) break;
        this.placeBridge(river, cand.i);
        placed = true;
      }
      if (!placed) {
        // Fallback: force the straightest banked section so rivers always get bridges.
        let bestI = -1;
        let bestScore = -Infinity;
        let bestAnyI = -1;
        let bestAnyScore = -Infinity;
        for (let i = 3; i < river.points.length - 3; i++) {
          const p = river.points[i];
          const prev = river.points[i - 1];
          const next = river.points[i + 1];
          const a = new THREE.Vector2(p.x - prev.x, p.y - prev.y);
          const b = new THREE.Vector2(next.x - p.x, next.y - p.y);
          const cosA = a.dot(b) / (a.length() * b.length() || 1);
          if (Math.hypot(p.x - this.runway.center.x, p.y - this.runway.center.z) < 180) continue;
          if (Math.abs(p.x) > MAP_HALF - 120 || Math.abs(p.y) > MAP_HALF - 120) continue;
          if (cosA > bestAnyScore) {
            bestAnyScore = cosA;
            bestAnyI = i;
          }
          const { width } = this.riverProbe(river, p.x, p.y);
          const tx = next.x - prev.x;
          const tz = next.y - prev.y;
          const tl = Math.hypot(tx, tz) || 1;
          const px = -tz / tl;
          const pz = tx / tl;
          const shore = width / 2 + 18;
          const lx = p.x + px * shore;
          const lz = p.y + pz * shore;
          const rx = p.x - px * shore;
          const rz = p.y - pz * shore;
          if (this.getHeight(lx, lz) < this.waterLevel + 0.3) continue;
          if (this.getHeight(rx, rz) < this.waterLevel + 0.3) continue;
          if (cosA > bestScore) {
            bestScore = cosA;
            bestI = i;
          }
        }
        if (bestI >= 0 && this.bridges.length < maxBridges) this.placeBridge(river, bestI);
        else if (bestAnyI >= 0 && this.bridges.length < maxBridges) this.placeBridge(river, bestAnyI);
      }
    }
  }

  private placeBridge(river: RiverPath, i: number) {
    const p = river.points[i];
    const prev = river.points[Math.max(0, i - 1)];
    const next = river.points[Math.min(river.points.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const tz = next.y - prev.y;
    const heading = Math.atan2(-tx, -tz);
    const { width } = this.riverProbe(river, p.x, p.y);
    const y = Math.max(this.getHeight(p.x, p.y), this.waterLevel);
    this.bridges.push({ x: p.x, z: p.y, y, heading, span: width + 74 });
  }

  getHeight(x: number, z: number) {
    const half = this.size / 2;
    const u = THREE.MathUtils.clamp((x + half) / this.size, 0, 1);
    const v = THREE.MathUtils.clamp((z + half) / this.size, 0, 1);
    const gx = u * this.segments;
    const gz = v * this.segments;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(this.segments, x0 + 1);
    const z1 = Math.min(this.segments, z0 + 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const i = (ix: number, iz: number) => this.heightData[iz * (this.segments + 1) + ix];
    const h00 = i(x0, z0);
    const h10 = i(x1, z0);
    const h01 = i(x0, z1);
    const h11 = i(x1, z1);
    const hx0 = THREE.MathUtils.lerp(h00, h10, tx);
    const hx1 = THREE.MathUtils.lerp(h01, h11, tx);
    return THREE.MathUtils.lerp(hx0, hx1, tz);
  }

  getSurfaceHeight(x: number, z: number) {
    return Math.max(this.getHeight(x, z), this.waterLevel);
  }

  isWater(x: number, z: number) {
    return this.getHeight(x, z) < this.waterLevel - 0.01;
  }

  slope(x: number, z: number) {
    const s = 18;
    const hx = Math.abs(this.getHeight(x + s, z) - this.getHeight(x - s, z)) / (2 * s);
    const hz = Math.abs(this.getHeight(x, z + s) - this.getHeight(x, z - s)) / (2 * s);
    return Math.max(hx, hz);
  }

  isOnRunway(pos: THREE.Vector3, radius = 8) {
    const dx = Math.abs(pos.x - this.runway.center.x);
    const dz = Math.abs(pos.z - this.runway.center.z);
    return (
      dx < this.runway.width * 0.5 + radius &&
      dz < this.runway.length * 0.5 + radius &&
      pos.y < this.runwayGround + 9
    );
  }

  clampToMap(pos: THREE.Vector3) {
    const limit = MAP_HALF - 40;
    let pulled = false;
    if (Math.abs(pos.x) > limit) {
      pos.x = Math.sign(pos.x) * limit;
      pulled = true;
    }
    if (Math.abs(pos.z) > limit) {
      pos.z = Math.sign(pos.z) * limit;
      pulled = true;
    }
    return pulled;
  }
}
