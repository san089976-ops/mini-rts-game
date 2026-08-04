import { AIRCRAFT, type AircraftId, type WeaponSlotDef } from './defs';

export interface LoadoutDef {
  id: string;
  name: string;
  blurb: string;
  weapons: WeaponSlotDef[];
}

export const AIRCRAFT_LOADOUTS: Record<AircraftId, LoadoutDef[]> = {
  bomber: [
    {
      id: 'bomber-std',
      name: '标准挂载',
      blurb: '机枪 + 重磅炸弹 + 热诱弹',
      weapons: AIRCRAFT.bomber.weapons
    },
    {
      id: 'bomber-heavy',
      name: '重型载弹',
      blurb: '重磅炸弹翻倍，机枪备弹削减',
      weapons: [
        { ...AIRCRAFT.bomber.weapons[0], maxAmmo: 100, regenPerSec: 3 },
        { ...AIRCRAFT.bomber.weapons[1], maxAmmo: 32, regenPerSec: 0.2 },
        AIRCRAFT.bomber.weapons[2]
      ]
    }
  ],
  attacker: [
    {
      id: 'attacker-std',
      name: '标准挂载',
      blurb: '小炸弹 + 火箭 + 空地导弹 + 热诱弹',
      weapons: AIRCRAFT.attacker.weapons
    },
    {
      id: 'attacker-rocket',
      name: '火箭突击',
      blurb: '火箭弹数量增加，小炸弹削减',
      weapons: [
        { ...AIRCRAFT.attacker.weapons[0], maxAmmo: 5, regenPerSec: 0.06 },
        { ...AIRCRAFT.attacker.weapons[1], maxAmmo: 30, regenPerSec: 0.36 },
        AIRCRAFT.attacker.weapons[2],
        AIRCRAFT.attacker.weapons[3]
      ]
    }
  ],
  fighter: [
    {
      id: 'fighter-std',
      name: '标准挂载',
      blurb: '机炮 + 近距导弹 + 热诱弹',
      weapons: AIRCRAFT.fighter.weapons
    },
    {
      id: 'fighter-strike',
      name: '对地突击',
      blurb: '机炮 + 小当量炸弹 + 近距导弹',
      weapons: [
        AIRCRAFT.fighter.weapons[0],
        {
          kind: 'smallBomb',
          name: '小当量炸弹',
          maxAmmo: 6,
          regenPerSec: 0.08,
          cooldown: 0.5,
          damage: 190,
          splashRadius: 18,
          muzzleSpeed: 0
        },
        AIRCRAFT.fighter.weapons[2]
      ]
    }
  ]
};

export function defaultLoadoutId(id: AircraftId) {
  return AIRCRAFT_LOADOUTS[id][0].id;
}
