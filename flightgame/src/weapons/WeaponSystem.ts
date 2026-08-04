import * as THREE from 'three';
import { GRAVITY, LOCK_BOX_HALF_H, LOCK_BOX_HALF_W, type WeaponKind, type WeaponSlotDef } from '../aircraft/defs';
import type { Aircraft } from '../flight/Aircraft';
import { TargetSystem, type Target } from '../targets/TargetSystem';
import type { Effects } from '../effects/Effects';
import type { AudioSystem } from '../audio/Audio';
import type { ThreatSystem } from '../threats/ThreatSystem';

export interface AmmoState {
  def: WeaponSlotDef;
  ammo: number;
  cooldown: number;
}

export interface FireResult {
  score: number;
  kills: number;
  messages: string[];
  flared?: boolean;
}

interface Projectile {
  kind: WeaponKind;
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  damage: number;
  splash: number;
  life: number;
  maxRange: number;
  traveled: number;
  target?: Target | null;
  turnRate?: number;
  prev: THREE.Vector3;
  /** machine gun: no auto-detonate splash at max range */
  hitscanLike?: boolean;
}

export class WeaponSystem {
  slots: AmmoState[] = [];
  activeSlot = 0;
  lockTarget: Target | null = null;
  lockProgress = 0;
  bombImpact: THREE.Vector3 | null = null;
  leadAim: THREE.Vector3 | null = null;
  lockTargetWorld: THREE.Vector3 | null = null;
  showLockBox = false;

  private camera: THREE.Camera | null = null;
  private ndc = new THREE.Vector3();
  private projectiles: Projectile[] = [];
  private bombPreview = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private threat: ThreatSystem | null = null;
  private lastLockBeep = 0;
  private wasFullyLocked = false;
  private bombPreviewTimer = 0;
  private leadAimTimer = 0;

  constructor(
    private scene: THREE.Scene,
    private targets: TargetSystem,
    private effects: Effects,
    private getHeight: (x: number, z: number) => number,
    private audio: AudioSystem | null = null,
    private onBombExplode: ((impact: THREE.Vector3) => void) | null = null
  ) {}

  setThreatSystem(threat: ThreatSystem) {
    this.threat = threat;
  }

  setupFromAircraft(aircraft: Aircraft, weapons?: WeaponSlotDef[]) {
    this.clearProjectiles();
    this.slots = (weapons ?? aircraft.def.weapons).map((def) => ({
      def,
      ammo: def.maxAmmo,
      cooldown: 0
    }));
    this.activeSlot = 0;
    this.lockTarget = null;
    this.lockProgress = 0;
    this.wasFullyLocked = false;
  }

  get active() {
    return this.slots[this.activeSlot];
  }

  selectSlot(index: number) {
    if (index >= 0 && index < this.slots.length) {
      this.activeSlot = index;
      this.lockProgress = 0;
      this.lockTarget = null;
      this.wasFullyLocked = false;
    }
  }

  cycleSlot(dir: number) {
    if (!this.slots.length) return;
    this.selectSlot((this.activeSlot + dir + this.slots.length) % this.slots.length);
  }

  update(
    dt: number,
    aircraft: Aircraft,
    input: {
      primary: boolean;
      secondary: boolean;
      bomb: boolean;
      flare: boolean;
      lock: boolean;
      slotKeys: number[];
    },
    now: number,
    camera?: THREE.Camera | null
  ): FireResult {
    const result: FireResult = { score: 0, kills: 0, messages: [] };
    if (camera) this.camera = camera;
    this.showLockBox = this.active?.def.kind === 'missile';
    if (!aircraft.alive) {
      this.bombImpact = null;
      this.leadAim = null;
      this.lockTargetWorld = null;
      this.showLockBox = false;
      return result;
    }

    for (const s of this.slots) {
      s.cooldown = Math.max(0, s.cooldown - dt);
      if (!aircraft.onGround) {
        s.ammo = Math.min(s.def.maxAmmo, s.ammo + s.def.regenPerSec * dt);
      }
    }

    for (const k of input.slotKeys) this.selectSlot(k);

    this.bombPreviewTimer -= dt;
    if (this.bombPreviewTimer <= 0) {
      this.updateBombPreview(aircraft);
      this.bombPreviewTimer = 1 / 60;
    }
    this.leadAimTimer -= dt;
    if (this.leadAimTimer <= 0) {
      this.updateLeadAim(aircraft);
      this.leadAimTimer = 1 / 60;
    }

    if (this.active.def.kind === 'missile') {
      this.updateLock(dt, aircraft, this.active.def, now);
      this.targets.notifyPlayerLock(this.lockTarget);
    } else {
      this.lockProgress = 0;
      this.lockTarget = null;
      this.lockTargetWorld = null;
      this.wasFullyLocked = false;
    }

    // Bombs ONLY via Space
    if (input.bomb) {
      const bomb = this.slots.find((s) => s.def.kind === 'bomb' || s.def.kind === 'smallBomb');
      if (bomb) this.tryFireSlot(bomb, aircraft, now, result);
    }

    // Quick flare: X / dedicated, or primary while flare selected
    if (input.flare) {
      const flare = this.slots.find((s) => s.def.kind === 'flare');
      if (flare) this.tryFireSlot(flare, aircraft, now, result);
    }

    if (input.primary) {
      const kind = this.active.def.kind;
      if (kind === 'cannon' || kind === 'rocket' || kind === 'missile' || kind === 'mg' || kind === 'flare') {
        this.tryFireSlot(this.active, aircraft, now, result);
      }
    }

    this.updateProjectiles(dt, now, result);
    return result;
  }

  resupply(amount = 1) {
    for (const s of this.slots) {
      s.ammo = Math.min(s.def.maxAmmo, s.ammo + s.def.maxAmmo * amount);
      if (amount >= 1) s.ammo = s.def.maxAmmo;
    }
  }

  private tryFireSlot(slot: AmmoState, aircraft: Aircraft, now: number, result: FireResult) {
    if (slot.cooldown > 0 || slot.ammo < 1) return;
    const kind = slot.def.kind;
    if (kind === 'missile' && this.lockProgress < 1) return;

    slot.ammo -= 1;
    slot.cooldown = slot.def.cooldown;

    if (kind === 'bomb' || kind === 'smallBomb') {
      this.audio?.playBombDrop();
      this.spawnBomb(aircraft, slot.def);
      return;
    }
    if (kind === 'cannon') {
      this.audio?.playCannon();
      this.spawnCannon(aircraft, slot.def);
      return;
    }
    if (kind === 'mg') {
      this.audio?.playMg();
      this.spawnMg(aircraft, slot.def);
      return;
    }
    if (kind === 'rocket') {
      this.audio?.playRocket();
      this.spawnRocket(aircraft, slot.def);
      return;
    }
    if (kind === 'missile') {
      this.audio?.playMissile();
      this.spawnMissile(aircraft, slot.def, this.lockTarget);
      this.lockProgress = 0.35;
      this.wasFullyLocked = false;
      return;
    }
    if (kind === 'flare') {
      this.threat?.deployFlare(aircraft.position, aircraft.velocity, aircraft.right, aircraft.up);
      result.flared = true;
      result.messages.push('热诱弹释放');
    }
  }

  private spawnBomb(aircraft: Aircraft, def: WeaponSlotDef) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.2, 1.6, 6),
      new THREE.MeshLambertMaterial({ color: 0x2a2e28 })
    );
    mesh.rotation.x = Math.PI / 2;
    const pos = aircraft.position.clone().addScaledVector(aircraft.forward, 2).add(new THREE.Vector3(0, -1.2, 0));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const vel = aircraft.getReleaseVelocity(new THREE.Vector3());
    vel.addScaledVector(aircraft.up, -2);
    this.projectiles.push({
      kind: def.kind,
      mesh,
      velocity: vel,
      damage: def.damage,
      splash: def.splashRadius,
      life: 20,
      maxRange: 5000,
      traveled: 0,
      prev: pos.clone()
    });
  }

  private spawnCannon(aircraft: Aircraft, def: WeaponSlotDef) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xffe08a, emissive: 0xaa6600 })
    );
    const pos = aircraft.position.clone().addScaledVector(aircraft.forward, 4).addScaledVector(aircraft.up, -0.4);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const dir = aircraft.forward.clone();
    const vel = dir.multiplyScalar(def.muzzleSpeed).addScaledVector(aircraft.velocity, 0.15);
    this.projectiles.push({
      kind: 'cannon',
      mesh,
      velocity: vel,
      damage: def.damage,
      splash: def.splashRadius,
      life: (def.maxRange ?? 700) / def.muzzleSpeed + 0.4,
      maxRange: def.maxRange ?? 700,
      traveled: 0,
      prev: pos.clone()
    });
  }

  /** Bomber MG: very long range, no splash detonation, lower damage */
  private spawnMg(aircraft: Aircraft, def: WeaponSlotDef) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 5, 5),
      new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0x886600 })
    );
    const pos = aircraft.position
      .clone()
      .addScaledVector(aircraft.forward, 4.2)
      .addScaledVector(aircraft.up, -0.35)
      .addScaledVector(aircraft.right, (Math.random() - 0.5) * 0.15);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const spread = 0.008;
    const dir = aircraft.forward
      .clone()
      .addScaledVector(aircraft.right, (Math.random() - 0.5) * spread)
      .addScaledVector(aircraft.up, (Math.random() - 0.5) * spread)
      .normalize();
    const vel = dir.multiplyScalar(def.muzzleSpeed).addScaledVector(aircraft.velocity, 0.1);
    this.projectiles.push({
      kind: 'mg',
      mesh,
      velocity: vel,
      damage: def.damage,
      splash: 0,
      life: 12,
      maxRange: def.maxRange ?? 20000,
      traveled: 0,
      prev: pos.clone(),
      hitscanLike: true
    });
  }

  private spawnRocket(aircraft: Aircraft, def: WeaponSlotDef) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 6, 6),
      new THREE.MeshLambertMaterial({ color: 0xff8a4a, emissive: 0x882200 })
    );
    const pos = aircraft.position
      .clone()
      .addScaledVector(aircraft.forward, 3.8)
      .addScaledVector(aircraft.up, -0.35)
      .addScaledVector(aircraft.right, (Math.random() - 0.5) * 0.6);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const dir = aircraft.forward.clone();
    const vel = dir.multiplyScalar(def.muzzleSpeed).addScaledVector(aircraft.velocity, 0.15);
    const maxRange = def.maxRange ?? 700;
    this.projectiles.push({
      kind: 'rocket',
      mesh,
      velocity: vel,
      damage: def.damage,
      splash: def.splashRadius,
      life: maxRange / Math.max(1, def.muzzleSpeed) + 0.4,
      maxRange,
      traveled: 0,
      prev: pos.clone()
    });
  }

  private spawnMissile(aircraft: Aircraft, def: WeaponSlotDef, target: Target | null) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 1.8, 6),
      new THREE.MeshLambertMaterial({ color: 0xd0d6de, emissive: 0x223344 })
    );
    mesh.rotation.x = Math.PI / 2;
    const pos = aircraft.position.clone().addScaledVector(aircraft.forward, 4);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const vel = aircraft.forward.clone().multiplyScalar(def.muzzleSpeed).addScaledVector(aircraft.velocity, 0.2);
    if (target?.isAerial) target.notifyThreat(8);
    this.projectiles.push({
      kind: 'missile',
      mesh,
      velocity: vel,
      damage: def.damage,
      splash: def.splashRadius,
      life: (def.maxRange ?? 800) / def.muzzleSpeed + 1,
      maxRange: def.maxRange ?? 800,
      traveled: 0,
      target,
      turnRate: def.turnRate ?? 2.2,
      prev: pos.clone()
    });
  }

  private updateBombPreview(aircraft: Aircraft) {
    const hasBomb = this.slots.some((s) => s.def.kind === 'bomb' || s.def.kind === 'smallBomb');
    if (!hasBomb || aircraft.onGround) {
      this.bombImpact = null;
      return;
    }
    const p = this.bombPreview.copy(aircraft.position).addScaledVector(aircraft.forward, 2);
    const v = aircraft.getReleaseVelocity(this.tmp2);
    v.addScaledVector(aircraft.up, -2);
    let t = 0;
    const dt = 0.05;
    while (t < 12) {
      v.y -= GRAVITY * dt;
      p.addScaledVector(v, dt);
      t += dt;
      const gy = this.getHeight(p.x, p.z);
      if (p.y <= gy + 0.5) {
        p.y = gy + 0.2;
        this.bombImpact = p.clone();
        return;
      }
    }
    this.bombImpact = null;
  }

  private updateLeadAim(aircraft: Aircraft) {
    const shell =
      this.active.def.kind === 'cannon' || this.active.def.kind === 'rocket' || this.active.def.kind === 'mg'
        ? this.active
        : null;
    if (!shell) {
      this.leadAim = null;
      return;
    }
    const maxRange = Math.min(shell.def.maxRange ?? 700, 1200);
    const tgt = this.targets.findLockTarget(aircraft.position, aircraft.forward, maxRange, 10);
    if (!tgt) {
      this.leadAim = null;
      return;
    }
    const from = aircraft.position.clone().addScaledVector(aircraft.forward, 4);
    this.leadAim = TargetSystem.leadPoint(from, tgt, shell.def.muzzleSpeed, new THREE.Vector3());
  }

  private updateLock(dt: number, aircraft: Aircraft, def: WeaponSlotDef, now: number) {
    const maxDist = def.maxRange ?? 800;
    const candidate = this.findTargetInLockBox(aircraft, maxDist);

    if (candidate && (!this.lockTarget || this.lockTarget.id === candidate.id || this.lockProgress < 0.25)) {
      this.lockTarget = candidate;
      const prevLock = this.lockProgress;
      this.lockProgress = Math.min(1, this.lockProgress + dt / (def.lockTime ?? 1));
      if (prevLock < 1 && this.lockProgress >= 1) {
        this.audio?.playLockTone();
        this.wasFullyLocked = true;
      }
    } else if (this.lockTarget?.alive && this.isTargetInLockBox(this.lockTarget, aircraft, maxDist * 1.05)) {
      const prevLock = this.lockProgress;
      this.lockProgress = Math.min(1, this.lockProgress + dt / (def.lockTime ?? 1));
      if (prevLock < 1 && this.lockProgress >= 1) {
        this.audio?.playLockTone();
        this.wasFullyLocked = true;
      }
    } else {
      this.lockProgress = Math.max(0, this.lockProgress - dt * 1.35);
      if (this.lockProgress <= 0) {
        this.lockTarget = null;
        this.wasFullyLocked = false;
      }
    }

    // progressive lock beeps while acquiring (not fully locked)
    if (this.lockProgress > 0.05 && this.lockProgress < 1) {
      // interval shrinks from ~0.55s to ~0.08s
      const interval = 0.55 - this.lockProgress * 0.47;
      if (now - this.lastLockBeep >= interval) {
        this.lastLockBeep = now;
        this.audio?.playLockTick(0.7 + this.lockProgress * 0.5);
      }
    }

    this.lockTargetWorld = this.lockTarget?.alive ? this.lockTarget.position.clone() : null;
  }

  private findTargetInLockBox(aircraft: Aircraft, maxDist: number): Target | null {
    if (!this.camera) return null;
    let best: Target | null = null;
    let bestScore = -Infinity;
    for (const t of this.targets.targets) {
      if (!t.alive) continue;
      const score = this.scoreTargetInLockBox(t, aircraft, maxDist);
      if (score === null) continue;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  private isTargetInLockBox(t: Target, aircraft: Aircraft, maxDist: number) {
    return this.scoreTargetInLockBox(t, aircraft, maxDist) !== null;
  }

  private scoreTargetInLockBox(t: Target, aircraft: Aircraft, maxDist: number): number | null {
    if (!this.camera) return null;
    const to = this.tmp.subVectors(t.position, aircraft.position);
    const dist = to.length();
    if (dist > maxDist || dist < 10) return null;
    if (to.normalize().dot(aircraft.forward) < 0.15) return null;

    this.ndc.copy(t.position).project(this.camera);
    if (this.ndc.z < -1 || this.ndc.z > 1) return null;
    if (Math.abs(this.ndc.x) > LOCK_BOX_HALF_W || Math.abs(this.ndc.y) > LOCK_BOX_HALF_H) return null;

    const centerDist = Math.hypot(this.ndc.x / LOCK_BOX_HALF_W, this.ndc.y / LOCK_BOX_HALF_H);
    return (1 - centerDist) * 2 - dist / maxDist;
  }

  private updateProjectiles(dt: number, now: number, result: FireResult) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.prev.copy(p.mesh.position);
      p.life -= dt;

      if (p.kind === 'bomb' || p.kind === 'smallBomb') {
        p.velocity.y -= GRAVITY * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        if (p.velocity.lengthSq() > 0.1) {
          p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));
        }
      } else if (p.kind === 'missile' && p.target?.alive) {
        TargetSystem.leadPoint(p.mesh.position, p.target, p.velocity.length(), this.tmp);
        const desired = this.tmp2.subVectors(this.tmp, p.mesh.position).normalize();
        const speed = p.velocity.length();
        const cur = p.velocity.clone().normalize();
        const turned = cur.lerp(desired, 1 - Math.exp(-(p.turnRate ?? 2) * dt)).normalize();
        p.velocity.copy(turned.multiplyScalar(speed));
        p.velocity.multiplyScalar(1 + 0.12 * dt);
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));
      } else {
        if (p.kind === 'rocket' || p.kind === 'cannon') p.velocity.y -= GRAVITY * 0.08 * dt;
        // mg: almost no gravity (flat long range)
        if (p.kind === 'mg') p.velocity.y -= GRAVITY * 0.012 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        if (p.velocity.lengthSq() > 0.1) {
          p.mesh.lookAt(p.mesh.position.clone().add(p.velocity));
        }
      }

      const step = p.mesh.position.distanceTo(p.prev);
      p.traveled += step;

      const gy = this.getHeight(p.mesh.position.x, p.mesh.position.z);
      const hitGround = p.mesh.position.y <= gy + 0.6;
      let hitTarget: Target | null = null;

      for (const t of this.targets.targets) {
        if (!t.alive) continue;
        const pad = p.kind === 'mg' ? 0.9 : p.kind === 'cannon' || p.kind === 'rocket' ? 1.2 : 1.8;
        const dist = distancePointSegment(t.position, p.prev, p.mesh.position);
        if (dist < t.def.radius + pad) {
          hitTarget = t;
          break;
        }
      }

      // MG: expire only on hit/ground/life ? range is effectively infinite
      const rangeExpired = p.kind === 'mg' ? false : p.traveled > p.maxRange;
      if (hitGround || hitTarget || p.life <= 0 || rangeExpired) {
        const impact = hitTarget ? hitTarget.position.clone() : p.mesh.position.clone();
        if (hitGround) impact.y = gy + 0.4;

        if (p.kind === 'mg') {
          if (hitTarget) {
            const gained = hitTarget.applyDamage(p.damage);
            if (gained > 0) {
              result.score += gained;
              result.kills += 1;
              result.messages.push(`摧毁 ${hitTarget.def.name}`);
              this.targets.markDestroyed(hitTarget, now);
              this.effects.explode(impact, 3);
              this.audio?.playExplosion(0.35);
            } else {
              this.audio?.playHit();
            }
          }
          // no splash, no ground boom for stray MG
        } else {
          this.effects.explode(impact, p.splash);
          this.audio?.playExplosion(p.splash / 16);
          const splash = this.targets.querySplash(impact, p.splash, p.damage, now);
          result.score += splash.score;
          result.kills += splash.kills;
          if (p.kind === 'bomb' || p.kind === 'smallBomb') {
            this.onBombExplode?.(impact);
          }
          if (splash.hitNames.length) {
            result.messages.push(`摧毁 ${splash.hitNames.join('、')}`);
          }
        }

        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private clearProjectiles() {
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
  }

  dispose() {
    this.clearProjectiles();
  }
}

function distancePointSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / (ab.lengthSq() || 1), 0, 1);
  const closest = a.clone().addScaledVector(ab, t);
  return closest.distanceTo(p);
}
