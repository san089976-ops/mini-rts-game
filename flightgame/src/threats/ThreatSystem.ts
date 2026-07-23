import * as THREE from 'three';
import {
  AA_CONE_HALF_DEG,
  AA_FIRE_INTERVAL,
  AA_LOCK_TIME,
  AA_MISSILE_DAMAGE,
  AA_MISSILE_RANGE,
  AA_MISSILE_SPEED,
  AA_MISSILE_TURN,
  AA_SCAN_HEIGHT,
  MISSILE_SEEKER_APEX_DEG
} from '../aircraft/defs';
import type { Aircraft } from '../flight/Aircraft';
import type { Target, TargetSystem } from '../targets/TargetSystem';
import type { Effects } from '../effects/Effects';
import type { AudioSystem } from '../audio/Audio';

export interface FlareDecoy {
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
}

interface EnemyMissile {
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  traveled: number;
  targetPlayer: boolean;
  decoy: FlareDecoy | null;
  /** after flare break, cannot reacquire player until 0 */
  flareBreakTimer: number;
  turnRate: number;
  damage: number;
  prev: THREE.Vector3;
}

export interface ThreatUpdateResult {
  playerDamage: number;
  messages: string[];
  /** best AA lock progress on player 0..1 */
  aaLockProgress: number;
  aaLocked: boolean;
  missileIncoming: boolean;
}

export class ThreatSystem {
  private missiles: EnemyMissile[] = [];
  private flares: FlareDecoy[] = [];
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(
    private scene: THREE.Scene,
    private targets: TargetSystem,
    private effects: Effects,
    private getHeight: (x: number, z: number) => number,
    private audio: AudioSystem | null = null
  ) {}

  clear() {
    for (const m of this.missiles) this.scene.remove(m.mesh);
    for (const f of this.flares) this.scene.remove(f.mesh);
    this.missiles.length = 0;
    this.flares.length = 0;
  }

  deployFlare(from: THREE.Vector3, velocity: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3) {
    const count = 8;
    const newDecoys: FlareDecoy[] = [];
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.7 + Math.random() * 0.35, 6, 6),
        new THREE.MeshLambertMaterial({ color: 0xffaa44, emissive: 0xff5500, emissiveIntensity: 1.8 })
      );
      const side = (i % 2 === 0 ? 1 : -1) * (2.2 + Math.random() * 2.5);
      const aft = -3 - Math.random() * 4;
      const pos = from
        .clone()
        .addScaledVector(right, side)
        .addScaledVector(up, -1.2 - Math.random() * 1.5)
        .addScaledVector(velocity.clone().normalize().multiplyScalar(velocity.length() > 1 ? 1 : 0), aft);
      // if nearly stopped, dump behind world -Z-ish using -up/right only
      if (velocity.lengthSq() < 1) {
        pos.copy(from).addScaledVector(right, side).addScaledVector(up, -1.5).add(new THREE.Vector3(0, 0, aft));
      }
      mesh.position.copy(pos);
      this.scene.add(mesh);
      const vel = velocity
        .clone()
        .multiplyScalar(0.22)
        .addScaledVector(right, side * 5.5)
        .addScaledVector(up, -3 + Math.random() * 3)
        .add(new THREE.Vector3((Math.random() - 0.5) * 10, 2 + Math.random() * 6, (Math.random() - 0.5) * 10));
      const decoy: FlareDecoy = {
        mesh,
        position: pos,
        velocity: vel,
        life: 7.5 + Math.random() * 2.0
      };
      this.flares.push(decoy);
      newDecoys.push(decoy);
    }
    this.audio?.playFlare();
    // Strong IR: ALL player-tracking missiles within 500m switch to nearest flare
    const seduceRange = 500;
    for (const m of this.missiles) {
      if (!m.targetPlayer && !m.decoy) continue;
      let best: FlareDecoy | null = null;
      let bestD = seduceRange;
      for (const f of this.flares) {
        const d = m.position.distanceTo(f.position);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      if (best) {
        m.decoy = best;
        m.targetPlayer = false;
        // break hard toward decoy
        const to = best.position.clone().sub(m.position);
        if (to.lengthSq() > 0.01) {
          m.velocity.copy(to.normalize().multiplyScalar(Math.max(m.velocity.length(), 70)));
        }
      }
    }
  }

  update(
    dt: number,
    aircraft: Aircraft,
    now: number,
    opts?: { invulnerableToLock?: boolean }
  ): ThreatUpdateResult {
    const result: ThreatUpdateResult = {
      playerDamage: 0,
      messages: [],
      aaLockProgress: 0,
      aaLocked: false,
      missileIncoming: this.missiles.some((m) => m.targetPlayer)
    };
    if (!aircraft.alive) {
      this.updateFlares(dt);
      this.updateMissiles(dt, aircraft, result);
      return result;
    }

    this.updateFlares(dt);
    if (opts?.invulnerableToLock) {
      // break all locks / tracking; no new AA fire
      for (const t of this.targets.targets) {
        if (t.def.kind === 'aaVehicle') t.aaLock = 0;
      }
      for (const m of this.missiles) {
        m.targetPlayer = false;
        m.decoy = m.decoy;
        m.flareBreakTimer = Math.max(m.flareBreakTimer, 1);
      }
      result.aaLockProgress = 0;
      result.aaLocked = false;
      result.missileIncoming = false;
    } else {
      this.updateAA(dt, aircraft, result);
    }
    this.updateMissiles(dt, aircraft, result);
    if (opts?.invulnerableToLock) {
      result.aaLockProgress = 0;
      result.aaLocked = false;
      result.missileIncoming = false;
      result.playerDamage = 0;
    }
    return result;
  }

  private updateFlares(dt: number) {
    for (let i = this.flares.length - 1; i >= 0; i--) {
      const f = this.flares[i];
      f.life -= dt;
      f.velocity.y -= 6 * dt;
      f.velocity.multiplyScalar(Math.exp(-0.4 * dt));
      f.position.addScaledVector(f.velocity, dt);
      f.mesh.position.copy(f.position);
      const mat = (f.mesh as THREE.Mesh).material as THREE.MeshLambertMaterial;
      if (mat.emissive) {
        mat.emissiveIntensity = 0.6 + Math.sin(performance.now() * 0.02 + i) * 0.5;
      }
      const gy = this.getHeight(f.position.x, f.position.z);
      if (f.life <= 0 || f.position.y <= gy + 0.5) {
        this.scene.remove(f.mesh);
        this.flares.splice(i, 1);
      }
    }
  }

  private playerInAACone(aa: Target, player: THREE.Vector3) {
    const dx = player.x - aa.position.x;
    const dz = player.z - aa.position.z;
    const horiz = Math.hypot(dx, dz);
    const relH = player.y - aa.position.y;
    if (relH < 5 || relH > AA_SCAN_HEIGHT) return false;
    // upward cone: angle from world up
    const toPlayer = this.tmp.set(dx, relH, dz).normalize();
    const cos = Math.cos(THREE.MathUtils.degToRad(AA_CONE_HALF_DEG));
    if (toPlayer.dot(this.up) < cos) return false;
    // also limit horizontal reach of cone base
    const maxHoriz = Math.tan(THREE.MathUtils.degToRad(AA_CONE_HALF_DEG)) * relH;
    return horiz <= maxHoriz + 8;
  }

  private updateAA(dt: number, aircraft: Aircraft, result: ThreatUpdateResult) {
    let bestLock = 0;
    for (const t of this.targets.targets) {
      if (!t.alive || t.def.kind !== 'aaVehicle') continue;
      t.aaFireCooldown = Math.max(0, t.aaFireCooldown - dt);
      const inCone = this.playerInAACone(t, aircraft.position);
      if (inCone) {
        const prev = t.aaLock;
        t.aaLock = Math.min(1, t.aaLock + dt / AA_LOCK_TIME);
        if (t.aaLock > bestLock) bestLock = t.aaLock;
        if (t.aaLock >= 1 && t.aaFireCooldown <= 0) {
          this.fireAAMissile(t, aircraft);
          t.aaFireCooldown = AA_FIRE_INTERVAL;
          result.messages.push('防空导弹发射！');
          this.audio?.playMissile();
        }
      } else {
        t.aaLock = Math.max(0, t.aaLock - dt * 0.9);
      }
    }
    result.aaLockProgress = bestLock;
    result.aaLocked = bestLock >= 1;
  }

  private fireAAMissile(aa: Target, aircraft: Aircraft) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.2, 2.2, 6),
      new THREE.MeshLambertMaterial({ color: 0xff6644, emissive: 0x662200 })
    );
    mesh.rotation.x = Math.PI / 2;
    const pos = aa.position.clone().add(new THREE.Vector3(0, 4, 0));
    mesh.position.copy(pos);
    this.scene.add(mesh);
    const to = aircraft.position.clone().sub(pos).normalize();
    const vel = to.multiplyScalar(AA_MISSILE_SPEED * 0.65);
    this.missiles.push({
      mesh,
      position: pos,
      velocity: vel,
      life: 14,
      traveled: 0,
      targetPlayer: true,
      decoy: null,
      flareBreakTimer: 0,
      turnRate: AA_MISSILE_TURN,
      damage: AA_MISSILE_DAMAGE,
      prev: pos.clone()
    });
  }

  private updateMissiles(dt: number, aircraft: Aircraft, result: ThreatUpdateResult) {
    const halfApex = MISSILE_SEEKER_APEX_DEG * 0.5;
    const cosSeeker = Math.cos(THREE.MathUtils.degToRad(halfApex));

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.prev.copy(m.position);
      m.life -= dt;
      m.flareBreakTimer = Math.max(0, m.flareBreakTimer - dt);

      // Active flares strongly steal seeker within generous range
      if (this.flares.length && m.flareBreakTimer <= 0) {
        let bestF: FlareDecoy | null = null;
        let bestScore = -Infinity;
        for (const f of this.flares) {
          const d = m.position.distanceTo(f.position);
          if (d > 200) continue;
          // prefer closer + hotter (remaining life)
          const score = f.life * 40 - d;
          if (score > bestScore) {
            bestScore = score;
            bestF = f;
          }
        }
        if (bestF) {
          m.decoy = bestF;
          m.targetPlayer = false;
        }
      }

      // choose aim point
      let aim: THREE.Vector3 | null = null;
      if (m.decoy && m.decoy.life > 0) {
        aim = m.decoy.position;
      } else if (m.decoy && m.decoy.life <= 0) {
        m.decoy = null;
        m.targetPlayer = false;
        m.flareBreakTimer = Math.max(m.flareBreakTimer, 2.8);
      } else if (m.targetPlayer && aircraft.alive && m.flareBreakTimer <= 0) {
        aim = aircraft.position;
      } else if (aircraft.alive && m.flareBreakTimer <= 0) {
        // reacquire only if close + inside seeker + no flares nearby
        const flaresNear = this.flares.some((f) => m.position.distanceTo(f.position) < 180);
        if (!flaresNear) {
          const toP = this.tmp.subVectors(aircraft.position, m.position);
          const dist = toP.length();
          if (dist > 1 && dist < 280) {
            toP.multiplyScalar(1 / dist);
            const forward = this.tmp2.copy(m.velocity).normalize();
            if (toP.dot(forward) >= cosSeeker + 0.08) {
              m.targetPlayer = true;
              m.decoy = null;
              aim = aircraft.position;
            }
          }
        }
      }

      if (aim) {
        const toAim = this.tmp.subVectors(aim, m.position);
        const dist = toAim.length();
        if (dist > 0.5) {
          toAim.multiplyScalar(1 / dist);
          const forward = this.tmp2.copy(m.velocity);
          if (forward.lengthSq() < 0.01) forward.set(0, 1, 0);
          else forward.normalize();
          // Seeker cone only applies when tracking player; flares always pull
          const trackingPlayer = m.targetPlayer && !m.decoy;
          if (trackingPlayer && toAim.dot(forward) < cosSeeker) {
            m.targetPlayer = false;
            result.messages.push('摆脱防空导弹！');
            aim = null;
          } else {
            const turn = m.decoy ? m.turnRate * 1.35 : m.turnRate;
            const speed = Math.max(AA_MISSILE_SPEED * 0.7, m.velocity.length());
            const turned = forward.lerp(toAim, 1 - Math.exp(-turn * dt)).normalize();
            m.velocity.copy(turned.multiplyScalar(speed * (1 + 0.08 * dt)));
          }
        }
      }

      m.position.addScaledVector(m.velocity, dt);
      m.mesh.position.copy(m.position);
      if (m.velocity.lengthSq() > 0.1) {
        m.mesh.lookAt(m.position.clone().add(m.velocity));
      }
      m.traveled += m.position.distanceTo(m.prev);

      const gy = this.getHeight(m.position.x, m.position.z);
      let explode = m.life <= 0 || m.traveled > AA_MISSILE_RANGE || m.position.y <= gy + 0.8;

      // hit player
      if (!explode && m.targetPlayer && !m.decoy && aircraft.alive) {
        const d = m.position.distanceTo(aircraft.position);
        if (d < 6.5) {
          explode = true;
          result.playerDamage += m.damage;
          result.messages.push('被防空导弹命中！');
          this.audio?.playExplosion(1.1);
        }
      }

      // hit decoy — generous proximity fuse
      if (!explode && m.decoy) {
        if (m.position.distanceTo(m.decoy.position) < 14) {
          explode = true;
          result.messages.push('热诱弹诱偏导弹');
          this.audio?.playExplosion(0.55);
          m.flareBreakTimer = 3.5;
        }
      }

      if (explode) {
        this.effects.explode(m.position.clone(), 10);
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
    result.missileIncoming = this.missiles.some((m) => m.targetPlayer && !m.decoy);
  }

  /** world positions of active enemy missiles (for radar) */
  getMissileWorldPositions(out: THREE.Vector3[] = []) {
    out.length = 0;
    for (const m of this.missiles) {
      out.push(m.position.clone());
    }
    return out;
  }

  /** position + velocity for radar arrow blips */
  getMissilesForRadar(out: Array<{ position: THREE.Vector3; velocity: THREE.Vector3 }> = []) {
    out.length = 0;
    for (const m of this.missiles) {
      out.push({ position: m.position, velocity: m.velocity });
    }
    return out;
  }

  dispose() {
    this.clear();
  }
}
