export type MapStyle = 'canyon' | 'archipelago' | 'riverplain';

export interface MapDef {
  id: MapStyle;
  name: string;
  blurb: string;
  mission: string;
  waterLevel: number;
  fogColor: number;
  fogDensity: number;
  skyColor: number;
  waterColor: number;
  runwayGround: number;
}

export const MAPS: Record<MapStyle, MapDef> = {
  canyon: {
    id: 'canyon',
    name: '峡谷山地',
    blurb: '高耸山脊与深切河谷，低空突防路线丰富，桥梁架在峡谷河上。',
    mission: '战役任务 01 · 峡谷清剿',
    waterLevel: 0,
    fogColor: 0x7d9bb0,
    fogDensity: 0.00016,
    skyColor: 0x87a8c4,
    waterColor: 0x2f6f8f,
    runwayGround: 0.4
  },
  archipelago: {
    id: 'archipelago',
    name: '群岛海战',
    blurb: '辽阔海域与岛屿群，开阔海面无遮蔽，主要威胁来自舰载防空。',
    mission: '战役任务 02 · 海上封锁',
    waterLevel: 0,
    fogColor: 0x7fa6bc,
    fogDensity: 0.00014,
    skyColor: 0x8db4cc,
    waterColor: 0x1f5f86,
    runwayGround: 8
  },
  riverplain: {
    id: 'riverplain',
    name: '河网平原',
    blurb: '低丘、河湖与湿地交错，桥梁众多，适合车队与地面清剿。',
    mission: '战役任务 03 · 平原破袭',
    waterLevel: 0,
    fogColor: 0x9aaf9a,
    fogDensity: 0.00018,
    skyColor: 0x9fbcb4,
    waterColor: 0x2f7a75,
    runwayGround: 0.4
  }
};
