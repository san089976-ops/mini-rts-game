import type { MapStyle } from '../world/maps';

export type MissionKind = 'recon' | 'escort' | 'precision' | 'naval' | 'boss';

export interface CampaignMission {
  id: string;
  kind: MissionKind;
  name: string;
  brief: string;
  map: MapStyle;
}

export const CAMPAIGN: Record<MapStyle, CampaignMission[]> = {
  canyon: [
    {
      id: 'canyon-1',
      kind: 'recon',
      name: '峡谷侦察',
      brief: '机头对准侦察目标累计 5 秒，完成全部目标。',
      map: 'canyon'
    },
    {
      id: 'canyon-2',
      kind: 'precision',
      name: '峡谷定点轰炸',
      brief: '摧毁指定堡垒，炸弹落点越准评级越高。',
      map: 'canyon'
    },
    {
      id: 'canyon-3',
      kind: 'escort',
      name: '峡谷车队护航',
      brief: '保护车队抵达终点，至少 3 辆存活。',
      map: 'canyon'
    },
    {
      id: 'canyon-boss',
      kind: 'boss',
      name: '峡谷要塞攻坚',
      brief: '摧毁峡谷中的全部堡垒集群。',
      map: 'canyon'
    }
  ],
  archipelago: [
    {
      id: 'arch-1',
      kind: 'naval',
      name: '海峡封锁',
      brief: '击沉敌方水面编队。',
      map: 'archipelago'
    },
    {
      id: 'arch-2',
      kind: 'recon',
      name: '岛屿侦察',
      brief: '机头对准侦察目标累计 5 秒，完成全部目标。',
      map: 'archipelago'
    },
    {
      id: 'arch-3',
      kind: 'precision',
      name: '岛屿定点轰炸',
      brief: '摧毁指定堡垒。',
      map: 'archipelago'
    },
    {
      id: 'arch-boss',
      kind: 'boss',
      name: '舰队长蛇',
      brief: '击沉敌方旗舰编队。',
      map: 'archipelago'
    }
  ],
  riverplain: [
    {
      id: 'plain-1',
      kind: 'escort',
      name: '平原车队护航',
      brief: '保护车队抵达终点，至少 3 辆存活。',
      map: 'riverplain'
    },
    {
      id: 'plain-2',
      kind: 'recon',
      name: '平原侦察',
      brief: '机头对准侦察目标累计 5 秒，完成全部目标。',
      map: 'riverplain'
    },
    {
      id: 'plain-3',
      kind: 'precision',
      name: '平原定点轰炸',
      brief: '摧毁指定堡垒。',
      map: 'riverplain'
    },
    {
      id: 'plain-boss',
      kind: 'boss',
      name: '装甲集团',
      brief: '摧毁敌方装甲集群。',
      map: 'riverplain'
    }
  ]
};
