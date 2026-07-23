import * as THREE from 'three';
import { MAP_HALF } from '../aircraft/defs';

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

export class World {
  readonly group = new THREE.Group();
  readonly runway = {
    center: new THREE.Vector3(0, 0, 180),
    heading: 0, // +Z takeoff direction towards -Z visually we'll face -Z
    length: 520,
    width: 36
  };

  private terrain!: THREE.Mesh;
  private heightData: Float32Array;
  private segments = 160;
  private size = MAP_HALF * 2;

  constructor(scene: THREE.Scene) {
    this.heightData = new Float32Array((this.segments + 1) * (this.segments + 1));
    this.buildSky(scene);
    this.buildTerrain();
    this.buildRunway();
    this.buildDecor();
    scene.add(this.group);
    scene.fog = new THREE.FogExp2(0x87a0b4, 0.00022);
    scene.background = new THREE.Color(0x7ea8c8);
  }

  private buildSky(scene: THREE.Scene) {
    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x3a4a2e, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 1.05);
    sun.position.set(400, 800, 200);
    sun.castShadow = false;
    scene.add(sun);
    const amb = new THREE.AmbientLight(0x8899aa, 0.25);
    scene.add(amb);
  }

  private buildTerrain() {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segments, this.segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];
    const color = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const nx = (x / this.size) * 8;
      const nz = (z / this.size) * 8;
      let h = fbm(nx + 20, nz - 11) * 55 - 8;
      // flatten runway corridor
      const localZ = z - this.runway.center.z;
      const localX = x - this.runway.center.x;
      if (Math.abs(localX) < 80 && Math.abs(localZ) < this.runway.length * 0.65) {
        const t = Math.min(1, Math.abs(localX) / 80);
        h = THREE.MathUtils.lerp(0.4, h, t * t);
      }
      // gentle river depression
      const river = Math.exp(-((z + 400) ** 2) / (2 * 90 ** 2));
      h -= river * 18;
      pos.setY(i, h);
      this.heightData[i] = h;

      if (h < -4) color.setHex(0x3d6b7a);
      else if (h < 6) color.setHex(0x5f7a45);
      else if (h < 22) color.setHex(0x6d7f4a);
      else color.setHex(0x7d7a62);
      colors.push(color.r, color.g, color.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.terrain = new THREE.Mesh(geo, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
  }

  private buildRunway() {
    const { length, width, center } = this.runway;
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.6, length),
      new THREE.MeshLambertMaterial({ color: 0x2c3036 })
    );
    deck.position.set(center.x, 0.8, center.z);
    this.group.add(deck);

    const stripeMat = new THREE.MeshLambertMaterial({ color: 0xe8e4d4 });
    for (let i = -8; i <= 8; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.2, 10), stripeMat);
      s.position.set(center.x, 1.15, center.z + i * 28);
      this.group.add(s);
    }

    const thr = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.9, 0.25, 4),
      new THREE.MeshLambertMaterial({ color: 0xd9c27a })
    );
    thr.position.set(center.x, 1.15, center.z + length * 0.45);
    this.group.add(thr);

    // hangar near runway
    const hangar = new THREE.Mesh(
      new THREE.BoxGeometry(48, 16, 32),
      new THREE.MeshLambertMaterial({ color: 0x5a6670 })
    );
    hangar.position.set(center.x + 70, 8.5, center.z + 40);
    this.group.add(hangar);
  }

  private buildDecor() {
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x2f5a32 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
    for (let i = 0; i < 120; i++) {
      const x = (Math.random() - 0.5) * this.size * 0.9;
      const z = (Math.random() - 0.5) * this.size * 0.9;
      if (Math.hypot(x - this.runway.center.x, z - this.runway.center.z) < 220) continue;
      const y = this.getHeight(x, z);
      if (y < -2) continue;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 4, 5), trunkMat);
      trunk.position.y = 2;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7, 6), treeMat);
      crown.position.y = 7;
      g.add(trunk, crown);
      g.position.set(x, y, z);
      this.group.add(g);
    }
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

  isOnRunway(pos: THREE.Vector3, radius = 8) {
    const dx = Math.abs(pos.x - this.runway.center.x);
    const dz = Math.abs(pos.z - this.runway.center.z);
    return dx < this.runway.width * 0.5 + radius && dz < this.runway.length * 0.5 + radius && pos.y < 8;
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
