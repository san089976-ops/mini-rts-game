import * as THREE from 'three';

interface Burst {
  mesh: THREE.Points;
  life: number;
  maxLife: number;
  velocities: Float32Array;
}

export class Effects {
  private bursts: Burst[] = [];
  private flashes: Array<{ mesh: THREE.Mesh; life: number; maxLife: number }> = [];
  private trail: THREE.Points | null = null;

  constructor(private scene: THREE.Scene) {}

  explode(pos: THREE.Vector3, radius: number) {
    const count = Math.min(48, 18 + Math.floor(radius * 1.2));
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize();
      const sp = 12 + Math.random() * 28 * (radius / 12);
      velocities[i * 3] = dir.x * sp;
      velocities[i * 3 + 1] = dir.y * sp;
      velocities[i * 3 + 2] = dir.z * sp;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffaa55,
      size: 2.2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false
    });
    const mesh = new THREE.Points(geo, mat);
    this.scene.add(mesh);
    this.bursts.push({ mesh, life: 0.7 + radius * 0.015, maxLife: 0.7 + radius * 0.015, velocities });

    // flash sphere
    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(2, radius * 0.35), 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc66, transparent: true, opacity: 0.55 })
    );
    flash.position.copy(pos);
    this.scene.add(flash);
    this.flashes.push({ mesh: flash, life: 0.28, maxLife: 0.28 });
  }

  update(dt: number) {
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      const t = 1 - Math.max(0, f.life / f.maxLife);
      f.mesh.scale.setScalar(1 + t * 2.2);
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        this.flashes.splice(i, 1);
      }
    }
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      const pos = b.mesh.geometry.attributes.position as THREE.BufferAttribute;
      for (let p = 0; p < pos.count; p++) {
        pos.setX(p, pos.getX(p) + b.velocities[p * 3] * dt);
        pos.setY(p, pos.getY(p) + b.velocities[p * 3 + 1] * dt);
        pos.setZ(p, pos.getZ(p) + b.velocities[p * 3 + 2] * dt);
        b.velocities[p * 3 + 1] -= 18 * dt;
      }
      pos.needsUpdate = true;
      const mat = b.mesh.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, b.life / b.maxLife);
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        mat.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }
}
