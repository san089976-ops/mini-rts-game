import * as THREE from 'three';
import { AIRCRAFT, MAP_HALF, PLAYER_MAX_HP, type AircraftId } from '../aircraft/defs';
import { Aircraft } from '../flight/Aircraft';
import { Input } from '../input/Input';
import { World } from '../world/World';
import { MAPS, type MapStyle } from '../world/maps';
import { CAMPAIGN, type CampaignMission } from '../missions/campaign';
import { MissionSystem, type MissionResult } from '../missions/MissionSystem';
import { AIRCRAFT_LOADOUTS, defaultLoadoutId } from '../aircraft/loadouts';
import { TargetSystem } from '../targets/TargetSystem';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { ThreatSystem } from '../threats/ThreatSystem';
import { Effects } from '../effects/Effects';
import { UI } from '../ui/UI';
import { AudioSystem } from '../audio/Audio';
import { DevCheats } from '../debug/DevCheats';

export type GamePhase = 'title' | 'briefing' | 'playing' | 'paused' | 'results';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(65, 1, 0.5, 12000);
  private clock = new THREE.Clock();
  private input: Input;
  private ui: UI;
  private world!: World;
  private worldCache = new Map<MapStyle, World>();
  private effects!: Effects;
  private targets!: TargetSystem;
  private weapons!: WeaponSystem;
  private threats!: ThreatSystem;
  private aircraft: Aircraft | null = null;
  private phase: GamePhase = 'title';
  private selected: AircraftId = 'attacker';
  private selectedMap: MapStyle = 'canyon';
  private mode: 'campaign' | 'endless' = 'campaign';
  private campaignMissions: CampaignMission[] = [];
  private campaignIndex = 0;
  private selectedLoadout = 'attacker-std';
  private lastMissionSuccess = false;

  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private kills = 0;
  private aliveTime = 0;
  private playerHp = PLAYER_MAX_HP;
  private toast = '';
  private toastTimer = 0;
  private resupplying = false;
  private camPos = new THREE.Vector3();
  private lookTarget = new THREE.Vector3();
  private proj = new THREE.Vector3();
  private running = false;
  private escWas = false;
  private slotEdge = new Set<string>();
  private audio = new AudioSystem();
  private boundaryWarnTimer = 0;
  private mission: MissionSystem | null = null;
  private uiRenderTimer = 0;
  private readonly baseFov = 65;
  private readonly zoomFov = 32;
  private fovCurrent = 65;
  private aaLockProgress = 0;
  private readonly radarRange = 1200;
  private missileScratch: THREE.Vector3[] = [];
  private missileRadarScratch: Array<{ position: THREE.Vector3; velocity: THREE.Vector3 }> = [];
  private radarTmp = new THREE.Vector3();

  constructor(
    private canvas: HTMLCanvasElement,
    uiRoot: HTMLElement
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.input = new Input(canvas);
    this.ui = new UI(uiRoot);
    this.ui.setHandlers({
      onStart: (id, map, mode) => {
        if (mode === 'campaign') this.startCampaign(map);
        else this.startMission(id, map, 'endless', defaultLoadoutId(id));
      },
      onLaunch: (id, loadoutId) => this.launchMission(id, loadoutId),
      onResume: () => this.resume(),
      onExit: () => this.toTitle(),
      onRestart: () => {
        if (this.mode === 'campaign') {
          if (this.lastMissionSuccess) this.nextMission();
          else this.showBriefing();
        } else {
          this.startMission(this.selected, this.selectedMap, 'endless', this.selectedLoadout);
        }
      }
    });

    this.buildWorld();
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.running = true;
    this.clock.start();
    this.loop();
  }

  private buildWorld(style: MapStyle = this.selectedMap) {
    while (this.scene.children.length) this.scene.remove(this.scene.children[0]);
    this.mission = null;
    const cached = this.worldCache.get(style);
    if (cached) {
      this.world = cached;
      cached.attach(this.scene);
    } else {
      this.world = new World(this.scene, style);
      this.worldCache.set(style, this.world);
    }
    this.effects = new Effects(this.scene);
    this.targets = new TargetSystem(this.scene, this.world);
    this.weapons = new WeaponSystem(
      this.scene,
      this.targets,
      this.effects,
      (x, z) => this.world.getSurfaceHeight(x, z),
      this.audio,
      (impact) => this.mission?.onBombExplode(impact)
    );
    this.threats = new ThreatSystem(
      this.scene,
      this.targets,
      this.effects,
      (x, z) => this.world.getSurfaceHeight(x, z),
      this.audio
    );
    this.weapons.setThreatSystem(this.threats);
    this.camera.position.set(0, 40, 220);
    this.camera.lookAt(0, 0, 0);
  }

  private startCampaign(map: MapStyle) {
    this.selectedMap = map;
    this.mode = 'campaign';
    this.campaignMissions = CAMPAIGN[map];
    this.campaignIndex = this.loadCampaignProgress(map);
    this.showBriefing();
  }

  private launchMission(id: AircraftId, loadoutId: string) {
    this.startMission(id, this.selectedMap, 'campaign', loadoutId);
  }

  private showBriefing() {
    this.phase = 'briefing';
    this.audio.stopEngine();
    this.input.exitPointerLock();
    if (this.aircraft) {
      this.scene.remove(this.aircraft.mesh);
      this.aircraft = null;
    }
    this.buildWorld(this.selectedMap);
    const mission =
      this.campaignIndex < this.campaignMissions.length
        ? this.campaignMissions[this.campaignIndex]
        : null;
    this.ui.showBriefing(mission, this.campaignIndex + 1, this.campaignMissions.length);
  }

  private nextMission() {
    this.campaignIndex = Math.min(this.campaignMissions.length, this.campaignIndex + 1);
    this.saveCampaignProgress(this.selectedMap, this.campaignIndex);
    this.showBriefing();
  }

  private loadCampaignProgress(map: MapStyle) {
    try {
      const raw = localStorage.getItem('fcs-campaign');
      if (raw) {
        const data = JSON.parse(raw) as Record<string, number>;
        return Math.max(0, Math.min(CAMPAIGN[map].length, data[map] ?? 0));
      }
    } catch {
      // ignore storage errors
    }
    return 0;
  }

  private saveCampaignProgress(map: MapStyle, index: number) {
    try {
      const raw = localStorage.getItem('fcs-campaign');
      const data = raw ? (JSON.parse(raw) as Record<string, number>) : {};
      data[map] = index;
      localStorage.setItem('fcs-campaign', JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  }

  private startMission(
    id: AircraftId,
    map: MapStyle = this.selectedMap,
    mode: 'campaign' | 'endless' = this.mode,
    loadoutId = defaultLoadoutId(id)
  ) {
    this.selected = id;
    this.selectedMap = map;
    this.mode = mode;
    this.selectedLoadout = loadoutId;
    if (this.aircraft) {
      this.scene.remove(this.aircraft.mesh);
    }
    this.buildWorld(map);
    this.aircraft = new Aircraft(AIRCRAFT[id], this.world);
    this.scene.add(this.aircraft.mesh);
    const loadout = AIRCRAFT_LOADOUTS[id].find((l) => l.id === loadoutId);
    this.weapons.setupFromAircraft(this.aircraft, loadout?.weapons);
    const def =
      mode === 'campaign' && this.campaignIndex < this.campaignMissions.length
        ? this.campaignMissions[this.campaignIndex]
        : null;
    this.mission = def ? new MissionSystem(this.scene, this.world, this.targets, def) : null;

    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.kills = 0;
    this.aliveTime = 0;
    this.playerHp = PLAYER_MAX_HP;
    this.aaLockProgress = 0;
    this.boundaryWarnTimer = 0;
    this.toast =
      (mode === 'campaign' ? this.mission?.name ?? MAPS[map].mission : '无尽清剿') +
      ` · 鼠标已锁定：W 油门 · 空格投弹 · X 热诱弹`;
    this.toastTimer = 4.5;
    this.phase = 'playing';
    this.ui.showPlaying();
    this.input.beginFlightControl();
    this.audio.resume();
    this.audio.playUi();
    this.fovCurrent = this.baseFov;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.syncCamera(1);
  }

  private resume() {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.ui.hidePaused();
    this.toast = '已继续：移动鼠标转向';
    this.toastTimer = 2;
    this.input.beginFlightControl();
    this.audio.resume();
  }

  private pause() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.input.exitPointerLock();
    this.ui.showPaused();
  }

  private toTitle() {
    this.phase = 'title';
    this.audio.stopEngine();
    this.input.exitPointerLock();
    if (this.aircraft) {
      this.scene.remove(this.aircraft.mesh);
      this.aircraft = null;
    }
    this.buildWorld();
    this.ui.showTitle();
  }

  private endMission(reason: string, missionResult?: MissionResult) {
    this.phase = 'results';
    this.lastMissionSuccess = missionResult?.success ?? false;
    this.input.exitPointerLock();
    this.audio.stopEngine();
    this.ui.showResults({
      score: this.score,
      kills: this.kills,
      aliveTime: this.aliveTime,
      reason,
      modeLabel: this.mode === 'campaign' ? '战役' : '无尽清剿',
      mapLabel: MAPS[this.selectedMap].name,
      missionName: missionResult?.missionName ?? null,
      rating: missionResult?.rating ?? null,
      campaign: this.mode === 'campaign'
    });
  }

  private loop = () => {
    if (!this.running) return;
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = performance.now() / 1000;

    if (this.phase === 'title' || this.phase === 'results' || this.phase === 'briefing') {
      this.uiRenderTimer -= dt;
      if (this.uiRenderTimer <= 0) {
        this.renderer.render(this.scene, this.camera);
        this.uiRenderTimer = 0.1;
      }
      return;
    }

    const esc = this.input.pressed('Escape');
    if (esc && !this.escWas) {
      if (this.phase === 'playing') this.pause();
      else if (this.phase === 'paused') this.resume();
    }
    this.escWas = esc;

    if (this.phase === 'paused') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.updatePlaying(dt, now);
    this.renderer.render(this.scene, this.camera);
  };

  private updatePlaying(dt: number, now: number) {
    if (!this.aircraft) return;
    this.aliveTime += dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast = '';
    }

    this.aircraft.update(dt, this.input);
    this.audio.updateEngine(this.aircraft.throttle, this.aircraft.speed, !this.aircraft.onGround);

    const slotKeys: number[] = [];
    for (let i = 1; i <= 9; i++) {
      const code = `Digit${i}`;
      if (this.input.pressed(code)) {
        if (!this.slotEdge.has(code)) {
          slotKeys.push(i - 1);
          this.slotEdge.add(code);
        }
      } else {
        this.slotEdge.delete(code);
      }
    }

    if (DevCheats.infiniteAmmo) this.weapons.resupply(1);

    const fire = this.weapons.update(
      dt,
      this.aircraft,
      {
        primary: this.input.primaryFireHeld(),
        secondary: false,
        bomb: this.input.pressed('Space'),
        flare: this.input.pressed('KeyX'),
        lock: this.input.pressed('KeyF'),
        slotKeys
      },
      now,
      this.camera
    );

    if (fire.score > 0) {
      this.combo += fire.kills;
      this.comboTimer = 3.5;
      const mult = 1 + Math.min(1.5, this.combo * 0.08);
      const gained = Math.round(fire.score * mult);
      this.score += gained;
      this.kills += fire.kills;
      this.toast = `${fire.messages.join(' · ')} +${gained}`;
      this.toastTimer = 2.2;
    } else if (fire.messages.length) {
      this.toast = fire.messages.join(' · ');
      this.toastTimer = 1.6;
    }

    const threat = this.threats.update(dt, this.aircraft, now, {
      invulnerableToLock: DevCheats.noLock
    });
    this.aaLockProgress = DevCheats.noLock ? 0 : threat.aaLockProgress;
    this.audio.updateThreatLockAudio(
      this.aaLockProgress,
      now,
      DevCheats.noLock ? false : threat.missileIncoming
    );

    if (DevCheats.infiniteHp) {
      this.playerHp = PLAYER_MAX_HP;
    }

    if (threat.playerDamage > 0 && !DevCheats.infiniteHp && !DevCheats.noLock) {
      this.playerHp = Math.max(0, this.playerHp - threat.playerDamage);
      this.combo = 0;
      this.toast = threat.messages.join(' · ') + ` HP ${this.playerHp}`;
      this.toastTimer = 2.5;
      this.audio.playHit();
      if (this.playerHp <= 0) {
        this.audio.playCrash();
        this.score = Math.max(0, this.score - 150);
        this.endMission('被防空导弹击落');
        return;
      }
    } else if (threat.messages.length && !DevCheats.noLock) {
      this.toast = threat.messages[threat.messages.length - 1];
      this.toastTimer = 1.8;
    }

    this.resupplying = false;
    if (
      this.aircraft.onGround &&
      this.aircraft.groundState === 'runway' &&
      this.aircraft.speed < 12
    ) {
      this.resupplying = true;
      this.weapons.resupply(dt * 0.55);
      this.playerHp = Math.min(PLAYER_MAX_HP, this.playerHp + 12 * dt);
    }

    this.targets.update(dt, now);
    this.effects.update(dt);
    this.syncCamera(dt);

    if (this.mission) {
      const missionResult = this.mission.update(dt, now, this.aircraft);
      if (missionResult) {
        this.mission = null;
        this.endMission(missionResult.reason, missionResult);
        return;
      }
    }

    const bx = Math.max(Math.abs(this.aircraft.position.x), Math.abs(this.aircraft.position.z));
    if (bx > MAP_HALF - 520) {
      if (this.boundaryWarnTimer <= 0) {
        this.toast = '即将离开作战区，请返航';
        this.toastTimer = 2.5;
        this.boundaryWarnTimer = 4;
      }
    }
    if (this.boundaryWarnTimer > 0) this.boundaryWarnTimer -= dt;

    if (this.aircraft.crashed) {
      this.audio.playCrash();
      this.audio.stopEngine();
      this.score = Math.max(0, this.score - 150);
      this.combo = 0;
      this.endMission('坠毁 — 已扣除部分分数');
      return;
    }

    this.pushHud();
    this.pushRadar(dt);
  }

  private syncCamera(dt: number) {
    if (!this.aircraft) return;
    const zooming = this.input.rmb && this.phase === 'playing';
    const behind = zooming ? 12 : 18;
    const up = zooming ? 3.8 : 5.5;
    const lookAhead = zooming ? 34 : 22;
    const desired = this.aircraft.position
      .clone()
      .addScaledVector(this.aircraft.forward, -behind)
      .addScaledVector(this.aircraft.up, up);

    const alpha = 1 - Math.exp(-6 * Math.min(dt, 0.05));
    this.camPos.lerp(desired, dt >= 1 ? 1 : alpha);
    this.camera.position.copy(this.camPos);

    this.lookTarget
      .copy(this.aircraft.position)
      .addScaledVector(this.aircraft.forward, lookAhead)
      .addScaledVector(this.aircraft.up, 1.5);
    this.camera.lookAt(this.lookTarget);

    const targetFov = zooming ? this.zoomFov : this.baseFov;
    const fovAlpha = 1 - Math.exp(-10 * Math.min(dt, 0.05));
    this.fovCurrent = THREE.MathUtils.lerp(this.fovCurrent, targetFov, dt >= 1 ? 1 : fovAlpha);
    if (Math.abs(this.camera.fov - this.fovCurrent) > 0.05) {
      this.camera.fov = this.fovCurrent;
      this.camera.updateProjectionMatrix();
    }
  }

  private pushHud() {
    if (!this.aircraft) return;
    const groundY = this.world.getSurfaceHeight(this.aircraft.position.x, this.aircraft.position.z);
    const stateLabel =
      this.aircraft.groundState === 'runway'
        ? '跑道'
        : this.aircraft.groundState === 'ground'
          ? '地面'
          : '空中';

    let bombScreen: { x: number; y: number } | null = null;
    if (this.weapons.bombImpact) {
      this.proj.copy(this.weapons.bombImpact).project(this.camera);
      if (this.proj.z < 1) {
        bombScreen = {
          x: (this.proj.x * 0.5 + 0.5) * window.innerWidth,
          y: (-this.proj.y * 0.5 + 0.5) * window.innerHeight
        };
      }
    }

    let leadScreen: { x: number; y: number } | null = null;
    if (this.weapons.leadAim) {
      this.proj.copy(this.weapons.leadAim).project(this.camera);
      if (this.proj.z < 1) {
        leadScreen = {
          x: (this.proj.x * 0.5 + 0.5) * window.innerWidth,
          y: (-this.proj.y * 0.5 + 0.5) * window.innerHeight
        };
      }
    }

    this.ui.updateHud(
      {
        score: this.score,
        combo: this.combo,
        kills: this.kills,
        aliveTime: this.aliveTime,
        modeLabel: this.mode === 'campaign' ? '战役' : '无尽清剿',
        mapLabel: MAPS[this.selectedMap].name,
        missionName: this.mission?.name ?? null,
        objectives: this.mission?.objectives ?? [],
        convoyHp: this.mission?.convoyHp ?? null,
        convoyMaxHp: this.mission?.convoyMaxHp ?? null,
        convoyUnits: this.mission?.convoyUnitStates ?? [],
        precisionHits: this.mission?.precisionHits ?? null,
        precisionDrops: this.mission?.precisionDrops ?? null,
        speed: this.aircraft.speed,
        altitude: Math.max(0, this.aircraft.position.y - groundY),
        throttle: this.aircraft.throttle,
        groundState: stateLabel,
        aircraftName: this.aircraft.def.name,
        slots: this.weapons.slots,
        activeSlot: this.weapons.activeSlot,
        lockProgress: this.weapons.lockProgress,
        lockName: this.weapons.lockTarget?.def.name ?? null,
        lockBoxVisible: this.weapons.showLockBox,
        lockReady: this.weapons.lockProgress >= 1,
        aaLockProgress: this.aaLockProgress,
        playerHp: this.playerHp,
        playerMaxHp: PLAYER_MAX_HP,
        resupplying: this.resupplying,
        toast:
          this.toast ||
          (this.input.pointerLocked
            ? ''
            : this.input.lookEnabled
              ? '指针未锁定：右键拖动转向，或用 ↑↓ 俯仰 · 点击画面重新锁定'
              : '点击「进入跑道起飞」将自动锁定鼠标')
      },
      bombScreen,
      leadScreen
    );
  }


  private pushRadar(dt: number) {
    if (!this.aircraft) return;
    const blips: Array<{
      x: number;
      y: number;
      kind:
        | 'mobile'
        | 'aa'
        | 'fixed'
        | 'aircraft'
        | 'missile'
        | 'convoy'
        | 'destination'
        | 'objective';
      heading?: number;
    }> = [];
    const origin = this.aircraft.position;
    const range = this.radarRange;

    // Use aircraft forward/right axes (XZ) so radar "up" = nose, "right" = starboard
    const fx = this.aircraft.forward.x;
    const fz = this.aircraft.forward.z;
    const fl = Math.hypot(fx, fz) || 1;
    const fnx = fx / fl;
    const fnz = fz / fl;
    const rx = this.aircraft.right.x;
    const rz = this.aircraft.right.z;
    const rl = Math.hypot(rx, rz) || 1;
    const rnx = rx / rl;
    const rnz = rz / rl;

    const toLocal = (wx: number, wz: number) => {
      const dx = wx - origin.x;
      const dz = wz - origin.z;
      // forward component on Y (screen up); right component on X
      const forward = (dx * fnx + dz * fnz) / range;
      const right = (dx * rnx + dz * rnz) / range;
      return { x: right, y: forward };
    };

    const velToHeading = (vx: number, vz: number) => {
      // velocity in radar local: right/forward → angle where 0 = up (forward), clockwise to right
      const vf = vx * fnx + vz * fnz;
      const vr = vx * rnx + vz * rnz;
      return Math.atan2(vr, vf);
    };

    for (const t of this.targets.targets) {
      if (!t.alive) continue;
      const loc = toLocal(t.position.x, t.position.z);
      if (Math.hypot(loc.x, loc.y) > 1.05) continue;
      const kind =
        t.def.kind === 'aaVehicle'
          ? 'aa'
          : t.isAerial
            ? 'aircraft'
            : t.def.mobile
              ? 'mobile'
              : 'fixed';
      blips.push({
        x: loc.x,
        y: loc.y,
        kind
      });
    }

    for (const m of this.mission?.getRadarBlips() ?? []) {
      const loc = toLocal(m.x, m.z);
      blips.push({ x: loc.x, y: loc.y, kind: m.kind });
    }

    this.threats.getMissilesForRadar(this.missileRadarScratch);
    for (const m of this.missileRadarScratch) {
      const loc = toLocal(m.position.x, m.position.z);
      if (Math.hypot(loc.x, loc.y) > 1.05) continue;
      blips.push({
        x: loc.x,
        y: loc.y,
        kind: 'missile',
        heading: velToHeading(m.velocity.x, m.velocity.z)
      });
    }

    this.ui.updateRadar(blips, dt);
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };
}
