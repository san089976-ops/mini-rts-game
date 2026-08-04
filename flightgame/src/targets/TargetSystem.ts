import * as THREE from 'three';
import { RESPAWN_STATIC_SEC, MAP_HALF, MOBILE_CAP } from '../aircraft/defs';
import type { MapStyle } from '../world/maps';
import type { World } from '../world/World';

export type TargetKind =
  | 'camp'
  | 'bridge'
  | 'facility'
  | 'fortress'
  | 'infantry'
  | 'lightVehicle'
  | 'tank'
  | 'aaVehicle'
  | 'apc'
  | 'aircraft'
  | 'warship';

export interface TargetDef {
  kind: TargetKind;
  name: string;
  hp: number;
  score: number;
  mobile: boolean;
  aerial?: boolean;
  speed?: number;
  radius: number;
}

/** Ground mobile scores already ?2; aircraft score is higher than ground infantry. */
export const TARGET_DEFS: Record<TargetKind, TargetDef> = {
  camp: { kind: 'camp', name: '营地', hp: 188, score: 100, mobile: false, radius: 14 },
  bridge: { kind: 'bridge', name: '桥梁', hp: 375, score: 220, mobile: false, radius: 22 },
  facility: { kind: 'facility', name: '设施', hp: 562, score: 320, mobile: false, radius: 18 },
  fortress: { kind: 'fortress', name: '堡垒', hp: 938, score: 520, mobile: false, radius: 24 },
  infantry: { kind: 'infantry', name: '人员小队', hp: 75, score: 80, mobile: true, speed: 7, radius: 5 },
  lightVehicle: { kind: 'lightVehicle', name: '轻型车辆', hp: 131, score: 140, mobile: true, speed: 14, radius: 6 },
  tank: { kind: 'tank', name: '坦克', hp: 300, score: 360, mobile: true, speed: 9, radius: 8 },
  aaVehicle: { kind: 'aaVehicle', name: '防空车', hp: 225, score: 300, mobile: true, speed: 11, radius: 7 },
  apc: { kind: 'apc', name: '装甲运兵车', hp: 206, score: 240, mobile: true, speed: 12, radius: 7 },
  aircraft: {
    kind: 'aircraft',
    name: '敌机',
    hp: 131,
    score: 280,
    mobile: true,
    aerial: true,
    speed: 42,
    radius: 7
  },
  warship: {
    kind: 'warship',
    name: '敌方战舰',
    hp: 720,
    score: 500,
    mobile: true,
    speed: 12,
    radius: 18
  }
};

export class Target {
  readonly mesh: THREE.Group;
  hp: number;
  maxHp: number;
  alive = true;
  respawnAt = 0;
  readonly velocity = new THREE.Vector3();
  readonly home = new THREE.Vector3();
  /** AA lock progress on player 0..1 */
  aaLock = 0;
  aaFireCooldown = 0;
  /** enemy aircraft evasion timer */
  evadeTimer = 0;
  underThreat = false;
  cruiseAlt = 0;
  baseHeading = 0;
  maneuverTimer = 0;
  maneuverYawRate = 0;
  maneuverClimbRate = 0;

  constructor(
    readonly def: TargetDef,
    position: THREE.Vector3,
    public id: number
  ) {
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.mesh = buildTargetMesh(def);
    this.mesh.position.copy(position);
    this.home.copy(position);
    this.cruiseAlt = position.y;
  }

  get position() {
    return this.mesh.position;
  }

  get isAerial() {
    return !!this.def.aerial;
  }

  notifyThreat(seconds = 6) {
    this.underThreat = true;
    this.evadeTimer = Math.max(this.evadeTimer, seconds);
  }

  applyDamage(amount: number) {
    if (!this.alive) return 0;
    this.hp -= amount;
    flashDamage(this.mesh);
    if (this.isAerial) this.notifyThreat(7);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.mesh.visible = false;
      restoreMeshColors(this.mesh);
      return this.def.score;
    }
    return 0;
  }

  revive() {
    this.alive = true;
    this.hp = this.maxHp;
    this.mesh.visible = true;
    this.mesh.position.copy(this.home);
    this.respawnAt = 0;
    this.aaLock = 0;
    this.aaFireCooldown = 0;
    this.evadeTimer = 0;
    this.underThreat = false;
    restoreMeshColors(this.mesh);
  }
}

type MatWithBase = THREE.MeshLambertMaterial & { userData: { baseColor?: number; flashToken?: number } };

function restoreMeshColors(mesh: THREE.Object3D) {
  mesh.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as MatWithBase;
    if (!mat?.color) return;
    mat.userData.flashToken = (mat.userData.flashToken ?? 0) + 1;
    const base = mat.userData.baseColor;
    if (typeof base === 'number') mat.color.setHex(base);
  });
}

function flashDamage(mesh: THREE.Object3D) {
  mesh.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as MatWithBase;
    if (!mat?.color) return;
    if (typeof mat.userData.baseColor !== 'number') {
      mat.userData.baseColor = mat.color.getHex();
    }
    const token = (mat.userData.flashToken ?? 0) + 1;
    mat.userData.flashToken = token;
    mat.color.setHex(0xff6655);
    window.setTimeout(() => {
      if (mat.userData.flashToken !== token) return;
      mat.color.setHex(mat.userData.baseColor ?? 0xffffff);
    }, 90);
  });
}

function buildTargetMesh(def: TargetDef) {
  const g = new THREE.Group();
  const mat = (c: number) => {
    const material = new THREE.MeshLambertMaterial({ color: c });
    material.userData.baseColor = c;
    return material;
  };
  if (def.kind === 'aircraft') {
    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 8), mat(0x6a7480));
    fuselage.position.y = 0.4;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 2.2), mat(0x55606c));
    wing.position.set(0, 0.5, 0.2);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 1.2), mat(0x4a5560));
    tail.position.set(0, 1.1, -3.2);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 6), mat(0x88909a));
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.4, 4.2);
    g.add(fuselage, wing, tail, nose);
    return g;
  }
  if (!def.mobile) {
    if (def.kind === 'bridge') {
      const deck = new THREE.Mesh(new THREE.BoxGeometry(48, 2, 12), mat(0x6a6e72));
      deck.position.y = 6;
      const p1 = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 3), mat(0x55585c));
      p1.position.set(-18, 5, 0);
      const p2 = p1.clone();
      p2.position.x = 18;
      g.add(deck, p1, p2);
    } else if (def.kind === 'facility') {
      const a = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 14), mat(0x7a6a55));
      a.position.y = 5;
      const b = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 10), mat(0x6a5a4a));
      b.position.set(8, 8, 4);
      g.add(a, b);
    } else if (def.kind === 'fortress') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(28, 10, 28), mat(0x5c5f55));
      base.position.y = 5;
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 18, 8), mat(0x6a6d62));
      tower.position.set(0, 14, 0);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(32, 4, 32), mat(0x4e5248));
      wall.position.y = 2;
      g.add(base, tower, wall);
    } else {
      // camp
      const tent = new THREE.Mesh(new THREE.ConeGeometry(6, 8, 4), mat(0x6b7a4a));
      tent.position.y = 4;
      const crate = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), mat(0x8a7a55));
      crate.position.set(7, 1.5, 2);
      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 8, 0.3), mat(0x555));
      flag.position.set(-5, 4, -3);
      g.add(tent, crate, flag);
    }
  } else if (def.kind === 'infantry') {
    for (let i = 0; i < 4; i++) {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.2, 3, 6), mat(0x4a5538));
      body.position.set((i % 2) * 2.2 - 1.1, 1.2, Math.floor(i / 2) * 2.2 - 1.1);
      g.add(body);
    }
  } else if (def.kind === 'lightVehicle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1.6, 7), mat(0x6b6e48));
    body.position.y = 1.2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.4, 2.5), mat(0x55583c));
    cab.position.set(0, 2.2, 1.2);
    g.add(body, cab);
  } else if (def.kind === 'tank') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.8, 9), mat(0x4f5a3e));
    hull.position.y = 1.3;
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 1.2, 8), mat(0x5a6548));
    turret.position.y = 2.6;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 5, 6), mat(0x3a3f30));
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0, 2.6, 3.5);
    g.add(hull, turret, barrel);
  } else if (def.kind === 'aaVehicle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 6.5), mat(0x5a6048));
    body.position.y = 1.1;
    const radar = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.4, 10), mat(0x8890a0));
    radar.position.y = 2.4;
    const launcher = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 2.8), mat(0x6a7080));
    launcher.position.set(0, 2.8, -0.5);
    g.add(body, radar, launcher);
  } else if (def.kind === 'apc') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.2, 8), mat(0x556048));
    body.position.y = 1.4;
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.8, 3), mat(0x4a553c));
    top.position.set(0, 2.8, 0.5);
    g.add(body, top);
  } else if (def.kind === 'warship') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(11, 4, 30), mat(0x4a5358));
    hull.position.y = 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 24), mat(0x5a6468));
    deck.position.y = 4.4;
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 9), mat(0x6a7480));
    bridge.position.set(0, 7, -4);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 2.4, 8), mat(0x5c6670));
    turret.position.set(0, 6.4, 8);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 8, 6), mat(0x3d4448));
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 6.6, 12);
    g.add(hull, deck, bridge, turret, barrel);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 6), mat(0x666));
    body.position.y = 1;
    g.add(body);
  }
  return g;
}

export class TargetSystem {
  readonly targets: Target[] = [];
  private nextId = 1;
  private spawnTimer = 0;
  private airSpawnTimer = 0;
  private staticKinds: TargetKind[] = ['camp', 'bridge', 'facility', 'fortress'];
  private mobileKinds: TargetKind[] = ['infantry', 'lightVehicle', 'tank', 'aaVehicle', 'apc'];
  private staticLayout: Record<MapStyle, Array<{ kind: TargetKind; count: number }>> = {
    canyon: [
      { kind: 'camp', count: 3 },
      { kind: 'facility', count: 2 },
      { kind: 'fortress', count: 2 }
    ],
    archipelago: [
      { kind: 'camp', count: 2 },
      { kind: 'facility', count: 2 },
      { kind: 'fortress', count: 1 }
    ],
    riverplain: [
      { kind: 'camp', count: 3 },
      { kind: 'facility', count: 2 },
      { kind: 'fortress', count: 2 }
    ]
  };
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private world: World,
    private mobileCap = MOBILE_CAP
  ) {
    this.seedStatic();
    this.seedInitialGroundMobiles();
    this.seedInitialAircraft();
  }


  /** First wave: random interior ground positions. Later respawns use map edges. */
  private seedInitialGroundMobiles() {
    for (let i = 0; i < this.mobileCap; i++) {
      const kind = this.pickMobileKind();
      const def = TARGET_DEFS[kind];
      let x = 0;
      let z = 0;
      for (let tries = 0; tries < 40; tries++) {
        const limit = MAP_HALF - 140;
        x = (Math.random() - 0.5) * 2 * limit;
        z = (Math.random() - 0.5) * 2 * limit;
        if (this.world.isWater(x, z)) continue;
        if (this.world.slope(x, z) > 0.45) continue;
        break;
      }
      const ang = Math.random() * Math.PI * 2;
      const speed = def.speed ?? 10;
      const y = this.world.getSurfaceHeight(x, z);
      const vel = new THREE.Vector3(Math.sin(ang) * speed, 0, Math.cos(ang) * speed);
      this.addTarget(kind, new THREE.Vector3(x, y, z), vel);
    }
  }

  private seedStatic() {
    for (const b of this.world.bridges) {
      this.addTarget('bridge', new THREE.Vector3(b.x, b.y, b.z), undefined, {
        yaw: b.heading,
        scaleX: Math.max(0.6, b.span / 48)
      });
    }
    for (const item of this.staticLayout[this.world.style]) {
      for (let n = 0; n < item.count; n++) this.placeRandomStatic(item.kind);
    }
  }

  private placeRandomStatic(kind: TargetKind) {
    const limit = MAP_HALF - 520;
    for (let tries = 0; tries < 90; tries++) {
      const x = (Math.random() - 0.5) * 2 * limit;
      const z = (Math.random() - 0.5) * 2 * limit;
      if (this.world.isWater(x, z)) continue;
      if (this.world.slope(x, z) > 0.3) continue;
      if (Math.hypot(x - this.world.runway.center.x, z - this.world.runway.center.z) < 430) continue;
      let close = false;
      for (const t of this.targets) {
        if (t.def.mobile) continue;
        if (Math.hypot(t.position.x - x, t.position.z - z) < 340) {
          close = true;
          break;
        }
      }
      if (close) continue;
      const y = this.world.getSurfaceHeight(x, z);
      this.addTarget(kind, new THREE.Vector3(x, y, z));
      return;
    }
  }

  private addTarget(
    kind: TargetKind,
    pos: THREE.Vector3,
    velocity?: THREE.Vector3,
    opts?: { yaw?: number; scaleX?: number }
  ) {
    const def = TARGET_DEFS[kind];
    const t = new Target(def, pos, this.nextId++);
    if (opts?.yaw !== undefined) t.mesh.rotation.y = opts.yaw;
    if (opts?.scaleX !== undefined) t.mesh.scale.x = opts.scaleX;
    if (velocity) t.velocity.copy(velocity);
    if (velocity && velocity.lengthSq() > 0.01) {
      t.mesh.lookAt(pos.clone().add(velocity));
      t.baseHeading = Math.atan2(velocity.x, velocity.z);
    }
    if (def.aerial) t.cruiseAlt = pos.y;
    this.targets.push(t);
    this.scene.add(t.mesh);
    return t;
  }

  /** Notify aerial targets that player missile is locking them */
  notifyPlayerLock(target: Target | null) {
    if (target?.alive && target.isAerial) target.notifyThreat(5);
  }

  update(dt: number, now: number) {
    for (const t of this.targets) {
      if (!t.def.mobile && !t.alive && t.respawnAt > 0 && now >= t.respawnAt) {
        t.revive();
        const y = this.world.getSurfaceHeight(t.home.x, t.home.z);
        t.position.y = y;
        t.home.y = y;
      }
    }

    for (const t of this.targets) {
      if (!t.alive || !t.def.mobile) continue;
      if (t.isAerial) {
        this.updateAerial(t, dt);
      } else if (t.def.kind === 'warship') {
        const nx = t.position.x + t.velocity.x * dt;
        const nz = t.position.z + t.velocity.z * dt;
        if (this.world.isWater(nx, nz)) {
          t.position.x = nx;
          t.position.z = nz;
        } else {
          t.velocity.multiplyScalar(-1);
          t.baseHeading = Math.atan2(t.velocity.x, t.velocity.z);
          t.mesh.rotation.y = t.baseHeading;
        }
        t.position.y = this.world.waterLevel + 2;
      } else {
        const nx = t.position.x + t.velocity.x * dt;
        const nz = t.position.z + t.velocity.z * dt;
        if (this.world.isWater(nx, nz)) {
          t.velocity.multiplyScalar(-1);
          t.baseHeading = Math.atan2(t.velocity.x, t.velocity.z);
          t.mesh.rotation.y = t.baseHeading;
        } else {
          t.position.x = nx;
          t.position.z = nz;
        }
        t.position.y = this.world.getSurfaceHeight(t.position.x, t.position.z);
      }
      if (Math.abs(t.position.x) > MAP_HALF + 40 || Math.abs(t.position.z) > MAP_HALF + 40) {
        t.alive = false;
        t.mesh.visible = false;
      }
    }

    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      if (t.def.mobile && !t.alive && t.respawnAt === 0) {
        this.scene.remove(t.mesh);
        this.targets.splice(i, 1);
      }
    }

    this.spawnTimer -= dt;
    let groundAlive = 0;
    let airAlive = 0;
    for (const t of this.targets) {
      if (!t.alive) continue;
      if (t.isAerial) airAlive++;
      else if (t.def.mobile) groundAlive++;
    }
    if (this.spawnTimer <= 0 && groundAlive < this.mobileCap) {
      this.spawnMobile();
      this.spawnTimer = 2.5 + Math.random() * 2.5;
    }

    this.airSpawnTimer -= dt;
    const airCap = 4;
    // Keep air population topped up (spawn up to 2 per tick when due)
    if (this.airSpawnTimer <= 0 && airAlive < airCap) {
      let n = 0;
      while (airAlive < airCap && n < 2) {
        this.spawnAircraft();
        airAlive++;
        n++;
      }
      this.airSpawnTimer = 2.5 + Math.random() * 2.5;
    }
  }

  private updateAerial(t: Target, dt: number) {
    if (t.evadeTimer > 0) {
      t.evadeTimer -= dt;
      t.underThreat = t.evadeTimer > 0;
    } else {
      t.underThreat = false;
    }

    // Random maneuver segments (turns, climb/dive, spirals — not only left-right)
    t.maneuverTimer -= dt;
    if (t.maneuverTimer <= 0) {
      const hot = t.evadeTimer > 0;
      const intensity = hot ? 1.55 : 0.65;
      t.maneuverTimer = (hot ? 0.35 : 0.7) + Math.random() * (hot ? 1.1 : 2.0);
      const mode = Math.random();
      if (mode < 0.28) {
        t.maneuverYawRate = (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random() * 1.8) * intensity;
        t.maneuverClimbRate = (Math.random() - 0.5) * 18 * intensity;
      } else if (mode < 0.5) {
        t.maneuverYawRate = (Math.random() - 0.5) * 1.2 * intensity;
        t.maneuverClimbRate = (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 22) * intensity;
      } else if (mode < 0.72) {
        t.maneuverYawRate = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.4) * intensity;
        t.maneuverClimbRate = Math.sin(performance.now() * 0.002 + t.id) * 20 * intensity;
      } else {
        t.maneuverYawRate = (Math.random() - 0.5) * 1.0 * intensity;
        t.maneuverClimbRate = (Math.random() - 0.5) * 10 * intensity;
      }
    }

    const jitter = t.evadeTimer > 0 ? 0.55 : 0.12;
    t.baseHeading += (t.maneuverYawRate + (Math.random() - 0.5) * jitter) * dt;

    const speed = (t.def.speed ?? 40) * (t.evadeTimer > 0 ? 1.22 : 1);
    const vx = Math.sin(t.baseHeading) * speed;
    const vz = Math.cos(t.baseHeading) * speed;
    const vy = t.maneuverClimbRate * 0.42;
    t.velocity.set(vx, vy, vz);
    t.cruiseAlt = THREE.MathUtils.clamp(t.cruiseAlt + t.maneuverClimbRate * dt * 0.38, 70, 240);

    t.position.addScaledVector(t.velocity, dt);
    const err = t.cruiseAlt - t.position.y;
    t.position.y += err * Math.min(1, 1.8 * dt);

    const ground = this.world.getSurfaceHeight(t.position.x, t.position.z);
    if (t.position.y < ground + 35) {
      t.position.y = ground + 35;
      t.velocity.y = Math.max(0, t.velocity.y);
      t.maneuverClimbRate = Math.abs(t.maneuverClimbRate);
    }
    if (t.position.y > 260) {
      t.position.y = 260;
      t.maneuverClimbRate = -Math.abs(t.maneuverClimbRate);
    }
    if (t.velocity.lengthSq() > 0.01) {
      this.tmp.copy(t.position).add(t.velocity);
      t.mesh.lookAt(this.tmp);
    }
  }

  markDestroyed(t: Target, now: number) {
    if (t.def.mobile) {
      t.respawnAt = 0;
    } else {
      t.respawnAt = now + RESPAWN_STATIC_SEC;
    }
  }


  private pickMobileKind(): TargetKind {
    // equal base weight 1 for each ground type; aaVehicle = 1.5
    const weights: Array<{ kind: TargetKind; w: number }> = [
      { kind: 'infantry', w: 1 },
      { kind: 'lightVehicle', w: 1 },
      { kind: 'tank', w: 1 },
      { kind: 'apc', w: 1 },
      { kind: 'aaVehicle', w: 1.5 }
    ];
    let total = 0;
    for (const e of weights) total += e.w;
    let r = Math.random() * total;
    for (const e of weights) {
      r -= e.w;
      if (r <= 0) return e.kind;
    }
    return 'infantry';
  }

  /** Edge spawn to replenish after kills / leave map (keeps ground count). */
  private spawnMobile() {
    // AA vehicles spawn at 1.5x weight vs each other ground mobile type
    const kind = this.pickMobileKind();
    const def = TARGET_DEFS[kind];
    const limit = MAP_HALF - 30;
    let x = 0;
    let z = 0;
    let found = false;
    for (let tries = 0; tries < 60 && !found; tries++) {
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) {
        x = -limit;
        z = (Math.random() - 0.5) * limit * 2;
      } else if (edge === 1) {
        x = limit;
        z = (Math.random() - 0.5) * limit * 2;
      } else if (edge === 2) {
        z = -limit;
        x = (Math.random() - 0.5) * limit * 2;
      } else {
        z = limit;
        x = (Math.random() - 0.5) * limit * 2;
      }
      if (this.world.isWater(x, z)) continue;
      if (this.world.slope(x, z) > 0.5) continue;
      found = true;
    }
    if (!found) {
      x = (Math.random() - 0.5) * MAP_HALF * 1.1;
      z = (Math.random() - 0.5) * MAP_HALF * 1.1;
    }
    const tx = (Math.random() - 0.5) * limit * 1.2;
    const tz = (Math.random() - 0.5) * limit * 1.2;
    const dir = new THREE.Vector3(tx - x, 0, tz - z).normalize();
    if (Math.random() < 0.5) {
      dir.set(-Math.sign(x) || 1, 0, (Math.random() - 0.5) * 0.6).normalize();
    }
    const speed = def.speed ?? 10;
    const y = this.world.getSurfaceHeight(x, z);
    this.addTarget(kind, new THREE.Vector3(x, y, z), dir.multiplyScalar(speed));
  }

  /** Escort missions: spawn hostile ground units near a convoy position. */
  spawnEscortEnemies(center: THREE.Vector3, count = 2) {
    for (let i = 0; i < count; i++) {
      const kind = this.pickMobileKind();
      const def = TARGET_DEFS[kind];
      for (let tries = 0; tries < 20; tries++) {
        const x = center.x + (Math.random() - 0.5) * 380;
        const z = center.z + (Math.random() - 0.5) * 380;
        if (Math.abs(x) > MAP_HALF - 60 || Math.abs(z) > MAP_HALF - 60) continue;
        if (this.world.isWater(x, z)) continue;
        const y = this.world.getSurfaceHeight(x, z);
        const dir = new THREE.Vector3(center.x - x, 0, center.z - z).normalize();
        this.addTarget(kind, new THREE.Vector3(x, y, z), dir.multiplyScalar(def.speed ?? 10));
        break;
      }
    }
  }

  /** Naval missions: spawn enemy warships in open water near a center. */
  spawnWarships(center: THREE.Vector3, count = 3) {
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 30; tries++) {
        const x = center.x + (Math.random() - 0.5) * 700;
        const z = center.z + (Math.random() - 0.5) * 700;
        if (Math.abs(x) > MAP_HALF - 120 || Math.abs(z) > MAP_HALF - 120) continue;
        if (!this.world.isWater(x, z)) continue;
        const ang = Math.random() * Math.PI * 2;
        const vel = new THREE.Vector3(Math.sin(ang) * 12, 0, Math.cos(ang) * 12);
        this.addTarget('warship', new THREE.Vector3(x, this.world.waterLevel + 2, z), vel);
        break;
      }
    }
  }

  /** Boss missions: spawn an armored ground group on land near a center. */
  spawnBossArmor(center: THREE.Vector3, tanks = 5, aa = 2) {
    const spawn = (kind: TargetKind) => {
      const def = TARGET_DEFS[kind];
      for (let tries = 0; tries < 30; tries++) {
        const x = center.x + (Math.random() - 0.5) * 500;
        const z = center.z + (Math.random() - 0.5) * 500;
        if (Math.abs(x) > MAP_HALF - 80 || Math.abs(z) > MAP_HALF - 80) continue;
        if (this.world.isWater(x, z) || this.world.slope(x, z) > 0.4) continue;
        const ang = Math.random() * Math.PI * 2;
        const vel = new THREE.Vector3(Math.sin(ang) * (def.speed ?? 8), 0, Math.cos(ang) * (def.speed ?? 8));
        this.addTarget(kind, new THREE.Vector3(x, this.world.getSurfaceHeight(x, z), z), vel);
        return;
      }
    };
    for (let i = 0; i < tanks; i++) spawn('tank');
    for (let i = 0; i < aa; i++) spawn('aaVehicle');
  }

  private seedInitialAircraft() {
    const airCap = 4;
    for (let i = 0; i < airCap; i++) {
      this.spawnAircraftAtInterior();
    }
  }

  /** Replenish aircraft: mix of edge and interior so they appear near the fight. */
  private spawnAircraft() {
    if (Math.random() < 0.45) this.spawnAircraftAtInterior();
    else this.spawnAircraftAtEdge();
  }

  private spawnAircraftAtInterior() {
    const limit = MAP_HALF - 280;
    const x = (Math.random() - 0.5) * 2 * limit;
    const z = (Math.random() - 0.5) * 2 * limit;
    const ground = this.world.getSurfaceHeight(x, z);
    const y = Math.max(ground + 55, 95 + Math.random() * 90);
    const ang = Math.random() * Math.PI * 2;
    const speed = TARGET_DEFS.aircraft.speed ?? 42;
    const vel = new THREE.Vector3(Math.sin(ang) * speed, 0, Math.cos(ang) * speed);
    const ac = this.addTarget('aircraft', new THREE.Vector3(x, y, z), vel);
    ac.cruiseAlt = y;
    ac.baseHeading = ang;
    // start a mild wander immediately
    ac.maneuverTimer = 0.2 + Math.random();
  }

  private spawnAircraftAtEdge() {
    const edge = Math.floor(Math.random() * 4);
    // keep well inside kill wall (MAP_HALF + 40)
    const limit = MAP_HALF - 180;
    let x = 0;
    let z = 0;
    if (edge === 0) {
      x = -limit;
      z = (Math.random() - 0.5) * limit * 1.4;
    } else if (edge === 1) {
      x = limit;
      z = (Math.random() - 0.5) * limit * 1.4;
    } else if (edge === 2) {
      z = -limit;
      x = (Math.random() - 0.5) * limit * 1.4;
    } else {
      z = limit;
      x = (Math.random() - 0.5) * limit * 1.4;
    }
    const ground = this.world.getSurfaceHeight(x, z);
    const y = Math.max(ground + 55, 100 + Math.random() * 80);
    // always head roughly toward map center / interior
    const tx = (Math.random() - 0.5) * limit * 0.6;
    const tz = (Math.random() - 0.5) * limit * 0.6;
    const dir = new THREE.Vector3(tx - x, 0, tz - z);
    if (dir.lengthSq() < 1e-4) dir.set(-x, 0, -z);
    dir.normalize();
    const speed = TARGET_DEFS.aircraft.speed ?? 42;
    const heading = Math.atan2(dir.x, dir.z);
    const vel = dir.multiplyScalar(speed);
    const ac = this.addTarget('aircraft', new THREE.Vector3(x, y, z), vel);
    ac.cruiseAlt = y;
    ac.baseHeading = heading;
    ac.maneuverTimer = 0.2 + Math.random();
  }

  findLockTarget(origin: THREE.Vector3, forward: THREE.Vector3, maxDist: number, coneDeg: number) {
    const cos = Math.cos(THREE.MathUtils.degToRad(coneDeg));
    let best: Target | null = null;
    let bestScore = -Infinity;
    const to = new THREE.Vector3();
    for (const t of this.targets) {
      if (!t.alive) continue;
      to.subVectors(t.position, origin);
      const dist = to.length();
      if (dist > maxDist || dist < 8) continue;
      to.multiplyScalar(1 / dist);
      const dot = to.dot(forward);
      if (dot < cos) continue;
      const score = dot * 2 - dist / maxDist;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  querySplash(center: THREE.Vector3, radius: number, damage: number, now: number) {
    let score = 0;
    let kills = 0;
    const hitNames: string[] = [];
    for (const t of this.targets) {
      if (!t.alive) continue;
      const d = t.position.distanceTo(center);
      if (d > radius + t.def.radius) continue;
      const falloff = 1 - d / (radius + t.def.radius);
      const dmg = damage * Math.max(0.35, falloff);
      const gained = t.applyDamage(dmg);
      if (gained > 0) {
        score += gained;
        kills += 1;
        hitNames.push(t.def.name);
        this.markDestroyed(t, now);
      }
    }
    return { score, kills, hitNames };
  }

  /** ray/segment hit for non-splash (e.g. MG) */
  queryRayHit(a: THREE.Vector3, b: THREE.Vector3, damage: number, now: number, pad = 1.2) {
    let score = 0;
    let kills = 0;
    const hitNames: string[] = [];
    let hit: Target | null = null;
    let bestD = Infinity;
    for (const t of this.targets) {
      if (!t.alive) continue;
      const dist = distancePointSegment(t.position, a, b);
      if (dist < t.def.radius + pad) {
        const mid = a.distanceTo(t.position);
        if (mid < bestD) {
          bestD = mid;
          hit = t;
        }
      }
    }
    if (hit) {
      const gained = hit.applyDamage(damage);
      if (gained > 0) {
        score += gained;
        kills += 1;
        hitNames.push(hit.def.name);
        this.markDestroyed(hit, now);
      } else {
        hitNames.push(hit.def.name);
      }
    }
    return { score, kills, hitNames, hit };
  }

  static leadPoint(from: THREE.Vector3, target: Target, projectileSpeed: number, out: THREE.Vector3) {
    const to = out.subVectors(target.position, from);
    const tv = target.velocity;
    const a = tv.dot(tv) - projectileSpeed * projectileSpeed;
    const b = 2 * to.dot(tv);
    const c = to.dot(to);
    let t = 0;
    if (Math.abs(a) < 1e-4) {
      t = Math.max(0, -c / (b || 1));
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const s = Math.sqrt(disc);
        const t1 = (-b - s) / (2 * a);
        const t2 = (-b + s) / (2 * a);
        t = Infinity;
        if (t1 > 0) t = Math.min(t, t1);
        if (t2 > 0) t = Math.min(t, t2);
        if (!Number.isFinite(t)) t = 0;
      }
    }
    t = Math.min(t, 3.5);
    return out.copy(target.position).addScaledVector(tv, t);
  }
}

function distancePointSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / (ab.lengthSq() || 1), 0, 1);
  const closest = a.clone().addScaledVector(ab, t);
  return closest.distanceTo(p);
}
