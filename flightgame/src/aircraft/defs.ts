export type AircraftId = 'bomber' | 'attacker' | 'fighter';

export type WeaponKind = 'bomb' | 'smallBomb' | 'rocket' | 'missile' | 'cannon' | 'mg' | 'flare';

export interface WeaponSlotDef {
  kind: WeaponKind;
  name: string;
  maxAmmo: number;
  regenPerSec: number;
  cooldown: number;
  damage: number;
  splashRadius: number;
  muzzleSpeed: number;
  maxRange?: number;
  lockTime?: number;
  lockConeDeg?: number;
  turnRate?: number;
}

export interface AircraftDef {
  id: AircraftId;
  name: string;
  blurb: string;
  color: number;
  maxSpeed: number;
  minSpeed: number;
  accel: number;
  turnRate: number;
  pitchRate: number;
  rollRate: number;
  lift: number;
  mass: number;
  stallSpeed: number;
  rotateSpeed: number;
  weapons: WeaponSlotDef[];
}

export const CANNON_MUZZLE_SPEED = 480;
export const ROCKET_MUZZLE_SPEED = (CANNON_MUZZLE_SPEED * 2) / 3;
export const CANNON_MAX_RANGE = 1050;
export const ROCKET_MAX_RANGE = Math.round(CANNON_MAX_RANGE * (2 / 3));
export const MG_MUZZLE_SPEED = 520;
export const MG_MAX_RANGE = 20000;

export const FLARE_BOMBER = 6;
export const FLARE_ATTACKER = 4;
export const FLARE_FIGHTER = 2;

export const AA_SCAN_HEIGHT = 600; // was 200, x3
export const AA_CONE_HALF_DEG = 68; // wider scan cone
export const AA_LOCK_TIME = 1.6;
export const AA_FIRE_INTERVAL = 8;
export const AA_MISSILE_DAMAGE = 38;
export const AA_MISSILE_SPEED = 95;
export const AA_MISSILE_TURN = 2.1;
export const AA_MISSILE_RANGE = 1100;
export const MISSILE_SEEKER_APEX_DEG = 90;
export const PLAYER_MAX_HP = 100;

const flareSlot = (maxAmmo: number): WeaponSlotDef => ({
  kind: 'flare',
  name: '热诱弹',
  maxAmmo,
  regenPerSec: 0.05,
  cooldown: 0.55,
  damage: 0,
  splashRadius: 0,
  muzzleSpeed: 0
});

export const AIRCRAFT: Record<AircraftId, AircraftDef> = {
  bomber: {
    id: 'bomber',
    name: '轰炸机',
    blurb: '低速高载弹：机枪扫射 + 重磅炸弹 + 热诱弹。',
    color: 0x4a5a48,
    maxSpeed: 92,
    minSpeed: 0,
    accel: 18,
    turnRate: 0.55,
    pitchRate: 0.7,
    rollRate: 1.1,
    lift: 1.05,
    mass: 1.35,
    stallSpeed: 38,
    rotateSpeed: 58,
    weapons: [
      {
        kind: 'mg',
        name: '机枪',
        maxAmmo: 200,
        regenPerSec: 6,
        cooldown: 0.06,
        damage: 6,
        splashRadius: 0,
        muzzleSpeed: MG_MUZZLE_SPEED,
        maxRange: MG_MAX_RANGE
      },
      {
        kind: 'bomb',
        name: '重磅炸弹',
        maxAmmo: 16,
        regenPerSec: 0.12,
        cooldown: 0.55,
        damage: 360,
        splashRadius: 28,
        muzzleSpeed: 0
      },
      flareSlot(FLARE_BOMBER)
    ]
  },
  attacker: {
    id: 'attacker',
    name: '攻击机',
    blurb: '中速多用途：小炸弹、弹道火箭、可锁定导弹与热诱弹。',
    color: 0x3d5a6c,
    maxSpeed: 98,
    minSpeed: 0,
    accel: 22,
    turnRate: 0.95,
    pitchRate: 1.05,
    rollRate: 1.8,
    lift: 1.12,
    mass: 1.05,
    stallSpeed: 36,
    rotateSpeed: 58,
    weapons: [
      {
        kind: 'smallBomb',
        name: '小当量炸弹',
        maxAmmo: 10,
        regenPerSec: 0.14,
        cooldown: 0.4,
        damage: 190,
        splashRadius: 18,
        muzzleSpeed: 0
      },
      {
        kind: 'rocket',
        name: '火箭弹',
        maxAmmo: 18,
        regenPerSec: 0.22,
        cooldown: 0.28,
        damage: 55,
        splashRadius: 10,
        muzzleSpeed: ROCKET_MUZZLE_SPEED,
        maxRange: ROCKET_MAX_RANGE
      },
      {
        kind: 'missile',
        name: '空地导弹',
        maxAmmo: 3,
        regenPerSec: 0.04,
        cooldown: 0.9,
        damage: 280,
        splashRadius: 18,
        muzzleSpeed: 160,
        maxRange: 1125,
        lockTime: 1.15,
        lockConeDeg: 14,
        turnRate: 2.4
      },
      flareSlot(FLARE_ATTACKER)
    ]
  },
  fighter: {
    id: 'fighter',
    name: '战斗机',
    blurb: '高机动：爆炸机炮弹丸、近距导弹与热诱弹。',
    color: 0x5a6d88,
    maxSpeed: 118,
    minSpeed: 0,
    accel: 28,
    turnRate: 1.35,
    pitchRate: 1.4,
    rollRate: 2.6,
    lift: 1.2,
    mass: 0.9,
    stallSpeed: 40,
    rotateSpeed: 68,
    weapons: [
      {
        kind: 'cannon',
        name: '机炮弹丸',
        maxAmmo: 120,
        regenPerSec: 4.5,
        cooldown: 0.08,
        damage: 18,
        splashRadius: 6,
        muzzleSpeed: CANNON_MUZZLE_SPEED,
        maxRange: CANNON_MAX_RANGE
      },
      {
        kind: 'missile',
        name: '近距导弹',
        maxAmmo: 2,
        regenPerSec: 0.03,
        cooldown: 1.0,
        damage: 240,
        splashRadius: 16,
        muzzleSpeed: 175,
        maxRange: 938,
        lockTime: 0.95,
        lockConeDeg: 12,
        turnRate: 2.8
      },
      flareSlot(FLARE_FIGHTER)
    ]
  }
};

export const MAP_HALF = 2200;
export const GRAVITY = 28;
export const RESPAWN_STATIC_SEC = 60;
export const MOBILE_CAP = 25;

export const LOCK_BOX_HALF_W = 0.24;
export const LOCK_BOX_HALF_H = 0.18;
