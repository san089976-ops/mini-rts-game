import * as THREE from 'three';
import type { Aircraft } from '../flight/Aircraft';
import type { Target, TargetSystem } from '../targets/TargetSystem';
import type { World } from '../world/World';
import type { CampaignMission, MissionKind } from './campaign';

export type ObjectiveState = 'active' | 'done' | 'failed';

export interface MissionObjective {
  text: string;
  state: ObjectiveState;
}

export interface MissionResult {
  success: boolean;
  reason: string;
  rating: string;
  missionName: string;
  objectives: MissionObjective[];
}

interface ConvoyUnit {
  mesh: THREE.Group;
  position: THREE.Vector3;
  hp: number;
  maxHp: number;
  wpIndex: number;
  arrived: boolean;
  alive: boolean;
}

interface EnemyTracer {
  mesh: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  unit: ConvoyUnit;
}

interface BurstFx {
  mesh: THREE.Mesh;
  life: number;
}

interface ReconTarget {
  target: Target;
  progress: number;
  required: number;
  done: boolean;
}

const CONVOY_ROUTE: THREE.Vector2[] = [
  new THREE.Vector2(-1500, 900),
  new THREE.Vector2(-900, 1450),
  new THREE.Vector2(200, 1050),
  new THREE.Vector2(1050, 350),
  new THREE.Vector2(1650, -500)
];
const CONVOY_SPEED = 22;
const CONVOY_COUNT = 4;
const CONVOY_REQUIRED = 3;
const CONVOY_MAX_HP = 384;
const THREAT_RADIUS = 210;
const TRACER_DAMAGE = 10;
const RECON_SECONDS = 5;

export class MissionSystem {
  readonly kind: MissionKind;
  readonly name: string;
  objectives: MissionObjective[] = [];
  convoyHp = 0;
  convoyMaxHp = 0;
  precisionHits = 0;
  precisionDrops = 0;

  private convoy: ConvoyUnit[] = [];
  private tracers: EnemyTracer[] = [];
  private bursts: BurstFx[] = [];
  private attackCooldowns = new Map<number, number>();
  private designated: Target[] = [];
  private reconTargets: ReconTarget[] = [];
  private escortSpawnTimer = 12;
  private threatToastCooldown = 0;
  private elapsed = 0;
  private result: MissionResult | null = null;

  constructor(
    private scene: THREE.Scene,
    private world: World,
    private targets: TargetSystem,
    def: CampaignMission
  ) {
    this.kind = def.kind;
    this.name = def.name;
    if (this.kind === 'escort') this.setupEscort();
    else if (this.kind === 'precision') this.setupPrecision();
    else if (this.kind === 'recon') this.setupRecon();
    else if (this.kind === 'naval') this.setupNaval();
    else this.setupBoss(def);
  }

  onBombExplode(impact: THREE.Vector3) {
    if (this.kind !== 'precision' || !this.designated.length) return;
    this.precisionDrops += 1;
    for (const t of this.designated) {
      const d = Math.hypot(impact.x - t.position.x, impact.z - t.position.z);
      if (d <= t.def.radius + 8) {
        this.precisionHits += 1;
        break;
      }
    }
  }

  getRadarBlips(): Array<{ x: number; z: number; kind: 'convoy' | 'destination' | 'objective' }> {
    const blips: Array<{ x: number; z: number; kind: 'convoy' | 'destination' | 'objective' }> = [];
    if (this.kind === 'escort') {
      for (const u of this.convoy) {
        if (u.alive) blips.push({ x: u.position.x, z: u.position.z, kind: 'convoy' });
      }
      const end = CONVOY_ROUTE[CONVOY_ROUTE.length - 1];
      blips.push({ x: end.x, z: end.y, kind: 'destination' });
    } else {
      for (const t of this.designated) {
        if (t.alive) blips.push({ x: t.position.x, z: t.position.z, kind: 'objective' });
      }
    }
    return blips;
  }

  get convoyUnitStates() {
    return this.convoy.map((u) => ({ hp: u.hp, maxHp: u.maxHp, alive: u.alive }));
  }

  update(dt: number, now: number, aircraft: Aircraft): MissionResult | null {
    if (this.result) return this.result;
    this.elapsed += dt;
    if (this.kind === 'escort') this.updateEscort(dt);
    else if (this.kind === 'precision') this.updatePrecision();
    else if (this.kind === 'recon') this.updateRecon(dt, aircraft);
    else if (this.kind === 'naval') this.updateDestroyCount('击沉敌舰', '全部敌舰已击沉');
    else this.updateDestroyCount('摧毁目标', '全部目标已摧毁');
    return this.result;
  }

  private setupEscort() {
    const start = CONVOY_ROUTE[0];
    const next = CONVOY_ROUTE[1];
    const dir = new THREE.Vector2(next.x - start.x, next.y - start.y).normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x);
    for (let i = 0; i < CONVOY_COUNT; i++) {
      const back = i * 45;
      const lat = (Math.random() - 0.5) * 14;
      const sx = start.x - dir.x * back + perp.x * lat;
      const sy = start.y - dir.y * back + perp.y * lat;
      const unit = this.buildConvoyUnit();
      unit.position.set(sx, this.world.getSurfaceHeight(sx, sy), sy);
      unit.mesh.position.copy(unit.position);
      this.convoy.push(unit);
      this.scene.add(unit.mesh);
    }
    this.convoyMaxHp = CONVOY_COUNT * CONVOY_MAX_HP;
    this.convoyHp = this.convoyMaxHp;
    this.objectives = [
      { text: `护送车队抵达终点（${CONVOY_REQUIRED}/${CONVOY_COUNT}）`, state: 'active' },
      { text: '清剿靠近车队的敌军，保持车队血量', state: 'active' }
    ];
  }

  private setupPrecision() {
    this.designated = this.targets.targets.filter((t) => t.alive && t.def.kind === 'fortress').slice(0, 2);
    if (!this.designated.length) {
      this.designated = this.targets.targets.filter((t) => t.alive && !t.def.mobile).slice(0, 2);
    }
    if (!this.designated.length) {
      this.failSetup('未找到指定堡垒目标');
      return;
    }
    this.objectives = [
      { text: `摧毁指定堡垒（0/${this.designated.length}）`, state: 'active' },
      { text: '炸弹命中精度 60% 以上', state: 'active' }
    ];
  }

  private setupRecon() {
    const candidates = this.targets.targets.filter(
      (t) => t.alive && !t.def.mobile && t.def.kind !== 'bridge'
    );
    if (candidates.length < 2) {
      this.designated = this.targets.targets.filter((t) => t.alive && t.def.mobile && !t.isAerial).slice(0, 2);
    } else {
      this.designated = candidates.slice(0, 2);
    }
    if (!this.designated.length) {
      this.failSetup('未找到侦察目标');
      return;
    }
    this.reconTargets = this.designated.map((t) => ({
      target: t,
      progress: 0,
      required: RECON_SECONDS,
      done: false
    }));
    this.objectives = this.reconTargets.map((r) => ({
      text: `侦察 ${r.target.def.name}（0%）`,
      state: 'active'
    }));
  }

  private setupNaval() {
    this.targets.spawnWarships(new THREE.Vector3(0, -500), 3);
    this.designated = this.targets.targets.filter((t) => t.alive && t.def.kind === 'warship');
    if (!this.designated.length) {
      this.failSetup('未找到水面目标');
      return;
    }
    this.objectives = [{ text: `击沉敌舰（0/${this.designated.length}）`, state: 'active' }];
  }

  private setupBoss(def: CampaignMission) {
    if (def.map === 'archipelago') {
      this.targets.spawnWarships(new THREE.Vector3(0, -500), 3);
      this.designated = this.targets.targets.filter((t) => t.alive && t.def.kind === 'warship');
    } else if (def.map === 'riverplain') {
      const before = this.targets.targets.length;
      this.targets.spawnBossArmor(new THREE.Vector3(0, -700), 5, 2);
      this.designated = this.targets.targets.slice(before);
    } else {
      this.designated = this.targets.targets.filter((t) => t.alive && t.def.kind === 'fortress').slice(0, 3);
      if (this.designated.length < 2) {
        const extra = this.targets.targets.filter(
          (t) => t.alive && !t.def.mobile && !this.designated.includes(t)
        );
        this.designated.push(...extra.slice(0, 3 - this.designated.length));
      }
    }
    if (!this.designated.length) {
      this.failSetup('未找到 Boss 目标');
      return;
    }
    this.objectives = [{ text: `摧毁目标（0/${this.designated.length}）`, state: 'active' }];
  }

  private failSetup(reason: string) {
    this.objectives = [{ text: reason, state: 'failed' }];
    this.result = {
      success: false,
      reason,
      rating: 'C',
      missionName: this.name,
      objectives: this.objectives
    };
  }

  private buildConvoyUnit(): ConvoyUnit {
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 2, 8.5),
      new THREE.MeshLambertMaterial({ color: 0x3d6b46 })
    );
    body.position.y = 1.4;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.6, 2.6),
      new THREE.MeshLambertMaterial({ color: 0x2f5a3a })
    );
    cab.position.set(0, 2, 2.6);
    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 3, 0.15),
      new THREE.MeshLambertMaterial({ color: 0xd8e4d0 })
    );
    flag.position.set(-1.7, 3.5, -1);
    mesh.add(body, cab, flag);
    return {
      mesh,
      position: new THREE.Vector3(),
      hp: CONVOY_MAX_HP,
      maxHp: CONVOY_MAX_HP,
      wpIndex: 0,
      arrived: false,
      alive: true
    };
  }

  private updateEscort(dt: number) {
    this.updateTracers(dt);
    this.updateBursts(dt);
    const center = new THREE.Vector3();
    let movingUnits = 0;
    for (const u of this.convoy) {
      if (!u.alive || u.arrived) continue;
      movingUnits++;
      center.add(u.position);
      const wp = CONVOY_ROUTE[Math.min(u.wpIndex, CONVOY_ROUTE.length - 1)];
      const dx = wp.x - u.position.x;
      const dz = wp.y - u.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 60) {
        u.wpIndex++;
        if (u.wpIndex >= CONVOY_ROUTE.length) {
          u.arrived = true;
          continue;
        }
      }
      if (dist > 0.01) {
        const base = Math.atan2(dx, dz);
        let moveX = Math.sin(base);
        let moveZ = Math.cos(base);
        const lookStep = CONVOY_SPEED * dt * 2;
        if (this.world.isWater(u.position.x + moveX * lookStep, u.position.z + moveZ * lookStep)) {
          let found = false;
          for (const off of [-1.2, -0.9, -0.6, -0.3, 0.3, 0.6, 0.9, 1.2]) {
            const a = base + off;
            const tx = u.position.x + Math.sin(a) * lookStep;
            const tz = u.position.z + Math.cos(a) * lookStep;
            if (!this.world.isWater(tx, tz)) {
              moveX = Math.sin(a);
              moveZ = Math.cos(a);
              found = true;
              break;
            }
          }
          if (!found) {
            moveX = -moveX;
            moveZ = -moveZ;
          }
        }
        u.position.x += moveX * CONVOY_SPEED * dt;
        u.position.z += moveZ * CONVOY_SPEED * dt;
        u.mesh.lookAt(u.position.clone().add(new THREE.Vector3(moveX, 0, moveZ)));
      }
      u.position.y = this.world.getSurfaceHeight(u.position.x, u.position.z);
      u.mesh.position.copy(u.position);
    }

    if (movingUnits > 0) center.divideScalar(movingUnits);
    let threat = 0;
    if (movingUnits > 0) {
      for (const t of this.targets.targets) {
        if (!t.alive || !t.def.mobile) continue;
        if (t.position.distanceTo(center) <= THREAT_RADIUS) threat++;
      }
    }

    if (threat > 0) {
      for (const t of this.targets.targets) {
        if (!t.alive || !t.def.mobile) continue;
        if (t.position.distanceTo(center) > THREAT_RADIUS) continue;
        const key = t.id;
        const cd = this.attackCooldowns.get(key) ?? 0;
        if (cd > 0) {
          this.attackCooldowns.set(key, cd - dt);
          continue;
        }
        const unit = this.convoy.find((u) => u.alive && u.position.distanceTo(t.position) < 340);
        if (unit) {
          const from = t.position.clone().add(new THREE.Vector3(0, 3, 0));
          const to = unit.position.clone().add(new THREE.Vector3(0, 1.5, 0));
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 6, 6),
            new THREE.MeshLambertMaterial({ color: 0xffaa44, emissive: 0xff5500, emissiveIntensity: 1.4 })
          );
          mesh.position.copy(from);
          this.scene.add(mesh);
          this.tracers.push({ mesh, from, to, t: 0, dur: 0.5, unit });
          this.attackCooldowns.set(key, 1.1 + Math.random() * 1.2);
        }
      }
      for (const key of [...this.attackCooldowns.keys()]) {
        const t = this.targets.targets.find((x) => x.id === key);
        if (!t || !t.alive || !t.def.mobile) this.attackCooldowns.delete(key);
      }
      this.threatToastCooldown -= dt;
      if (this.threatToastCooldown <= 0) {
        this.threatToastCooldown = 3.5;
        this.objectives[1] = { text: `车队受威胁！附近敌军 ${threat} 个`, state: 'active' };
      }
    }

    this.escortSpawnTimer -= dt;
    if (this.escortSpawnTimer <= 0 && movingUnits > 0) {
      let nearby = 0;
      for (const t of this.targets.targets) {
        if (t.alive && t.def.mobile && t.position.distanceTo(center) <= THREAT_RADIUS * 1.6) nearby++;
      }
      if (nearby < 4) {
        this.targets.spawnEscortEnemies(center, Math.random() < 0.5 ? 1 : 2);
      }
      this.escortSpawnTimer = 18 + Math.random() * 10;
    }

    this.convoyHp = this.convoy.reduce((sum, u) => sum + (u.alive ? u.hp : 0), 0);
    const arrived = this.convoy.filter((u) => u.alive && u.arrived).length;
    const aliveTotal = this.convoy.filter((u) => u.alive).length;

    if (arrived >= CONVOY_REQUIRED) {
      this.objectives[0] = {
        text: `护送车队抵达终点（${arrived}/${CONVOY_COUNT}）`,
        state: 'done'
      };
      this.result = {
        success: true,
        reason: `车队抵达终点 · 存活 ${arrived}/${CONVOY_COUNT}`,
        rating: arrived >= CONVOY_COUNT ? 'S' : 'A',
        missionName: this.name,
        objectives: this.objectives
      };
    } else if (aliveTotal < CONVOY_REQUIRED) {
      this.objectives[0] = {
        text: `护送车队抵达终点（${arrived}/${CONVOY_COUNT}）`,
        state: 'failed'
      };
      this.result = {
        success: false,
        reason: '车队损失过大',
        rating: 'C',
        missionName: this.name,
        objectives: this.objectives
      };
    }
  }

  private updateRecon(dt: number, aircraft: Aircraft) {
    const forward = aircraft.forward;
    const to = new THREE.Vector3();
    let doneCount = 0;
    for (let i = 0; i < this.reconTargets.length; i++) {
      const r = this.reconTargets[i];
      if (r.done) {
        doneCount++;
        continue;
      }
      if (r.target.alive) {
        to.subVectors(r.target.position, aircraft.position);
        const dist = to.length();
        if (dist < 1200) {
          to.normalize();
          if (to.dot(forward) > Math.cos(THREE.MathUtils.degToRad(18))) {
            r.progress += dt;
          } else {
            r.progress = Math.max(0, r.progress - dt * 0.6);
          }
        } else {
          r.progress = Math.max(0, r.progress - dt * 0.6);
        }
        if (r.progress >= r.required) r.done = true;
      } else {
        r.done = true;
      }
      if (r.done) doneCount++;
      this.objectives[i] = {
        text: `侦察 ${r.target.def.name}（${Math.round(Math.min(100, (r.progress / r.required) * 100))}%）`,
        state: r.done ? 'done' : 'active'
      };
    }
    if (doneCount >= this.reconTargets.length) {
      this.result = {
        success: true,
        reason: '全部侦察目标完成',
        rating: this.rateByTime(),
        missionName: this.name,
        objectives: this.objectives
      };
    }
  }

  private updatePrecision() {
    const destroyed = this.designated.filter((t) => !t.alive).length;
    this.objectives[0] = {
      text: `摧毁指定堡垒（${destroyed}/${this.designated.length}）`,
      state: destroyed >= this.designated.length ? 'done' : 'active'
    };
    const pct = this.precisionDrops > 0 ? Math.round((this.precisionHits / this.precisionDrops) * 100) : 0;
    this.objectives[1] = {
      text: `炸弹命中精度 ${pct}%`,
      state: this.precisionDrops === 0 ? 'active' : pct >= 60 ? 'done' : pct >= 40 ? 'active' : 'failed'
    };
    if (destroyed >= this.designated.length) {
      const precision = this.precisionDrops > 0 ? this.precisionHits / this.precisionDrops : 0;
      const rating = precision >= 0.8 ? 'S' : precision >= 0.6 ? 'A' : precision >= 0.4 ? 'B' : 'C';
      this.result = {
        success: true,
        reason: `全部堡垒已摧毁 · 精度 ${pct}%`,
        rating,
        missionName: this.name,
        objectives: this.objectives
      };
    }
  }

  private updateDestroyCount(label: string, doneText: string) {
    const destroyed = this.designated.filter((t) => !t.alive).length;
    this.objectives[0] = {
      text: `${label}（${destroyed}/${this.designated.length}）`,
      state: destroyed >= this.designated.length ? 'done' : 'active'
    };
    if (destroyed >= this.designated.length) {
      this.result = {
        success: true,
        reason: doneText,
        rating: this.rateByTime(),
        missionName: this.name,
        objectives: this.objectives
      };
    }
  }

  private rateByTime() {
    if (this.elapsed <= 120) return 'S';
    if (this.elapsed <= 180) return 'A';
    if (this.elapsed <= 240) return 'B';
    return 'C';
  }

  private updateTracers(dt: number) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.t += dt;
      const k = Math.min(1, tr.t / tr.dur);
      tr.mesh.position.lerpVectors(tr.from, tr.to, k);
      if (tr.t >= tr.dur) {
        this.scene.remove(tr.mesh);
        this.tracers.splice(i, 1);
        if (tr.unit.alive) {
          tr.unit.hp = Math.max(0, tr.unit.hp - TRACER_DAMAGE);
          this.spawnBurst(tr.to);
          if (tr.unit.hp <= 0) {
            tr.unit.alive = false;
            tr.unit.mesh.visible = false;
          }
        }
      }
    }
  }

  private updateBursts(dt: number) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      b.mesh.scale.setScalar(1 + (0.35 - b.life) * 9);
      const mat = b.mesh.material as THREE.MeshLambertMaterial;
      mat.opacity = Math.max(0, b.life / 0.35);
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        this.bursts.splice(i, 1);
      }
    }
  }

  private spawnBurst(pos: THREE.Vector3) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 6, 6),
      new THREE.MeshLambertMaterial({
        color: 0xff8844,
        emissive: 0xff3300,
        emissiveIntensity: 1.6,
        transparent: true,
        opacity: 0.9
      })
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.bursts.push({ mesh, life: 0.35 });
  }
}
