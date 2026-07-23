import * as THREE from 'three';
import type { AircraftDef } from '../aircraft/defs';
import { createAircraftMesh } from '../aircraft/mesh';
import type { World } from '../world/World';
import type { Input } from '../input/Input';

export type GroundState = 'runway' | 'ground' | 'airborne';

export class Aircraft {
  readonly mesh: THREE.Group;
  readonly velocity = new THREE.Vector3();
  readonly forward = new THREE.Vector3(0, 0, -1);
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly right = new THREE.Vector3(1, 0, 0);

  throttle = 0;
  speed = 0;
  onGround = true;
  groundState: GroundState = 'runway';
  alive = true;
  crashed = false;

  private pitchInput = 0;
  private yawInput = 0;
  private rollInput = 0;
  private tmp = new THREE.Vector3();
  private quat = new THREE.Quaternion();
  private euler = new THREE.Euler();

  constructor(
    readonly def: AircraftDef,
    private world: World
  ) {
    this.mesh = createAircraftMesh(def);
    this.resetToRunway();
  }

  resetToRunway() {
    const r = this.world.runway;
    this.mesh.position.set(r.center.x, 2.2, r.center.z + r.length * 0.35);
    this.mesh.rotation.set(0, 0, 0); // nose toward -Z
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.throttle = 0;
    this.onGround = true;
    this.groundState = 'runway';
    this.alive = true;
    this.crashed = false;
    this.updateAxes();
  }

  get position() {
    return this.mesh.position;
  }

  updateAxes() {
    this.mesh.getWorldDirection(this.forward); // +Z local becomes world dir; Three looks down -Z by default for cameras but Object3D.getWorldDirection uses +Z
    // Our nose is modeled toward -Z, so flip:
    this.forward.multiplyScalar(-1);
    this.up.set(0, 1, 0).applyQuaternion(this.mesh.quaternion).normalize();
    this.right.crossVectors(this.forward, this.up).normalize();
    this.up.crossVectors(this.right, this.forward).normalize();
  }

  update(dt: number, input: Input) {
    if (!this.alive) return;

    // throttle
    if (input.pressed('KeyW')) this.throttle = Math.min(1, this.throttle + dt * 0.55);
    if (input.pressed('KeyS')) this.throttle = Math.max(0, this.throttle - dt * 0.7);

    // roll / yaw keys
    this.rollInput = 0;
    this.yawInput = 0;
    this.pitchInput = 0;
    if (input.pressed('KeyA')) this.rollInput += 1;
    if (input.pressed('KeyD')) this.rollInput -= 1;
    if (input.pressed('KeyQ')) this.yawInput += 1;
    if (input.pressed('KeyE')) this.yawInput -= 1;
    // keyboard pitch (works without pointer lock)
    if (input.pressed('ArrowUp') || input.pressed('KeyI')) this.pitchInput += 1;
    if (input.pressed('ArrowDown') || input.pressed('KeyK')) this.pitchInput -= 1;
    if (input.pressed('ArrowLeft') || input.pressed('KeyJ')) this.yawInput += 0.85;
    if (input.pressed('ArrowRight') || input.pressed('KeyL')) this.yawInput -= 0.85;

    const { dx, dy } = input.consumeMouseDelta();
    // mouse look: high sensitivity; inverted Y (mouse down = pitch up / lift)
    const mouseSens = 0.052;
    this.yawInput += -dx * mouseSens;
    this.pitchInput += dy * mouseSens;

    this.updateAxes();
    const groundY = this.world.getHeight(this.position.x, this.position.z);
    const gearClearance = 2.1;
    const agl = this.position.y - groundY;
    this.onGround = agl <= gearClearance + 0.35 && this.velocity.y <= 4;

    if (this.onGround) {
      this.groundState = this.world.isOnRunway(this.position) ? 'runway' : 'ground';
    } else {
      this.groundState = 'airborne';
    }

    // orientation rates
    const rollRate = this.def.rollRate * this.rollInput;
    const pitchRate = this.def.pitchRate * THREE.MathUtils.clamp(this.pitchInput, -2.8, 2.8);
    const yawRate = this.def.turnRate * THREE.MathUtils.clamp(this.yawInput, -2.8, 2.8);

    if (this.onGround) {
      // taxi / takeoff roll: limited pitch until rotate speed
      const canRotate = this.speed >= this.def.rotateSpeed * 0.85;
      this.mesh.rotateY(yawRate * dt * (0.35 + this.speed / this.def.maxSpeed));
      if (canRotate) {
        this.mesh.rotateX(pitchRate * dt * 0.65);
      } else {
        // keep level-ish
        this.euler.setFromQuaternion(this.mesh.quaternion, 'YXZ');
        this.euler.x = THREE.MathUtils.lerp(this.euler.x, 0, 1 - Math.exp(-4 * dt));
        this.euler.z = THREE.MathUtils.lerp(this.euler.z, 0, 1 - Math.exp(-6 * dt));
        this.mesh.quaternion.setFromEuler(this.euler);
      }
      this.mesh.rotateZ(rollRate * dt * 0.25);
    } else {
      this.mesh.rotateZ(rollRate * dt);
      this.mesh.rotateX(pitchRate * dt);
      this.mesh.rotateY(yawRate * dt);
    }

    this.updateAxes();

    // speed / thrust
    const targetSpeed = this.def.minSpeed + (this.def.maxSpeed - this.def.minSpeed) * this.throttle;
    const accel = this.def.accel * (this.onGround ? 1.15 : 1);
    if (this.speed < targetSpeed) this.speed = Math.min(targetSpeed, this.speed + accel * dt);
    else this.speed = Math.max(targetSpeed, this.speed - accel * 0.7 * dt);

    // drag when nose up
    const climbFactor = Math.max(0, this.forward.y);
    this.speed = Math.max(0, this.speed - climbFactor * 18 * dt);

    // velocity follows nose with some inertia
    this.tmp.copy(this.forward).multiplyScalar(this.speed);
    if (this.onGround) {
      this.velocity.x = this.tmp.x;
      this.velocity.z = this.tmp.z;
      this.velocity.y = Math.min(this.velocity.y, 0);
      if (this.speed >= this.def.rotateSpeed && this.forward.y > 0.08) {
        // lift off
        this.velocity.y = Math.max(this.velocity.y, this.speed * this.forward.y * 0.35);
        this.onGround = false;
        this.groundState = 'airborne';
      }
    } else {
      // blend velocity toward nose direction (arcade-sim)
      this.velocity.lerp(this.tmp, 1 - Math.exp(-2.8 * dt / this.def.mass));
      // gravity vs lift from speed
      const lift = (this.speed / this.def.stallSpeed) * this.def.lift;
      const grav = 28;
      this.velocity.y += (-grav + Math.min(grav * 1.15, lift * 16)) * dt * 0.35;
      // stall sink
      if (this.speed < this.def.stallSpeed * 0.85) {
        this.velocity.y -= (this.def.stallSpeed - this.speed) * 0.35 * dt;
      }
    }

    this.position.addScaledVector(this.velocity, dt);

    // ground collision
    const gy = this.world.getHeight(this.position.x, this.position.z);
    if (this.position.y < gy + gearClearance) {
      const impact = -this.velocity.y;
      const horiz = Math.hypot(this.velocity.x, this.velocity.z);
      this.position.y = gy + gearClearance;
      if (!this.onGround && impact > 22) {
        this.crash();
        return;
      }
      if (!this.onGround && impact > 12 && !this.world.isOnRunway(this.position)) {
        this.crash();
        return;
      }
      // landing / taxi
      this.velocity.y = 0;
      this.onGround = true;
      this.groundState = this.world.isOnRunway(this.position) ? 'runway' : 'ground';
      // hard bank crash
      this.euler.setFromQuaternion(this.mesh.quaternion, 'YXZ');
      if (Math.abs(this.euler.z) > 0.85 && horiz > 30) {
        this.crash();
        return;
      }
      // settle attitude on ground
      this.euler.x = THREE.MathUtils.lerp(this.euler.x, 0, 1 - Math.exp(-5 * dt));
      this.euler.z = THREE.MathUtils.lerp(this.euler.z, 0, 1 - Math.exp(-5 * dt));
      this.mesh.quaternion.setFromEuler(this.euler);
      // ground friction
      this.speed *= Math.exp(-0.35 * dt);
      this.velocity.x = this.forward.x * this.speed;
      this.velocity.z = this.forward.z * this.speed;
    }

    if (this.world.clampToMap(this.position)) {
      this.velocity.multiplyScalar(0.4);
      this.speed *= 0.4;
    }

    // soft ceiling
    if (this.position.y > 520) {
      this.position.y = 520;
      this.velocity.y = Math.min(0, this.velocity.y);
    }
  }

  crash() {
    this.alive = false;
    this.crashed = true;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
  }

  /** velocity components for bomb release (horizontal + vertical decomposition) */
  getReleaseVelocity(out = new THREE.Vector3()) {
    return out.copy(this.velocity);
  }
}
