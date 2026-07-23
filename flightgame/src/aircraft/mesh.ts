import * as THREE from 'three';
import type { AircraftDef } from './defs';

export function createAircraftMesh(def: AircraftDef) {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: def.color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2228 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x89c4e8, transparent: true, opacity: 0.75 });
  const accent = new THREE.MeshLambertMaterial({ color: 0xb8c4a8 });

  const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 8.5), bodyMat);
  fuselage.position.z = 0.2;
  root.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.4, 8), bodyMat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0.05, -5.2);
  root.add(nose);

  let wingSpan = 10;
  let wingChord = 2.6;
  if (def.id === 'bomber') {
    wingSpan = 16;
    wingChord = 3.4;
  } else if (def.id === 'fighter') {
    wingSpan = 9;
    wingChord = 2.2;
  }

  const wing = new THREE.Mesh(new THREE.BoxGeometry(wingSpan, 0.25, wingChord), bodyMat);
  wing.position.set(0, -0.1, 0.4);
  root.add(wing);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 1.4), bodyMat);
  tail.position.set(0, 0.2, 3.8);
  root.add(tail);

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.2, 1.5), bodyMat);
  fin.position.set(0, 1.3, 3.7);
  root.add(fin);

  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), glass);
  canopy.scale.set(1, 0.7, 1.3);
  canopy.position.set(0, 0.85, -1.2);
  root.add(canopy);

  // undercarriage simplified
  for (const x of [-1.2, 1.2, 0]) {
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.1, 8), dark);
    gear.position.set(x, -1.1, x === 0 ? -2.2 : 0.8);
    root.add(gear);
  }

  // engine pods for bomber / attacker
  if (def.id !== 'fighter') {
    for (const x of [-3.5, 3.5]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.8, 8), dark);
      pod.rotation.x = Math.PI / 2;
      pod.position.set(x, -0.35, 0.2);
      root.add(pod);
    }
  } else {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 2), dark);
    intake.position.set(0, -0.35, 1.5);
    root.add(intake);
  }

  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.6, 8), accent);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0, 0, 4.6);
  root.add(exhaust);

  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });

  return root;
}
