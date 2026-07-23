import type { AircraftId } from '../aircraft/defs';
import { AIRCRAFT } from '../aircraft/defs';
import type { AmmoState } from '../weapons/WeaponSystem';
import { DevCheats, anyCheatActive } from '../debug/DevCheats';

export type UiPhase = 'title' | 'playing' | 'paused' | 'results';

export interface HudModel {
  score: number;
  combo: number;
  kills: number;
  aliveTime: number;
  speed: number;
  altitude: number;
  throttle: number;
  groundState: string;
  aircraftName: string;
  slots: AmmoState[];
  activeSlot: number;
  lockProgress: number;
  lockName: string | null;
  lockBoxVisible: boolean;
  lockReady: boolean;
  aaLockProgress: number;
  playerHp: number;
  playerMaxHp: number;
  resupplying: boolean;
  toast: string;
}

export class UI {
  private root: HTMLElement;
  private phase: UiPhase = 'title';
  private selected: AircraftId = 'attacker';
  private onStart: ((id: AircraftId) => void) | null = null;
  private onResume: (() => void) | null = null;
  private onExit: (() => void) | null = null;
  private onRestart: (() => void) | null = null;

  private titleEl: HTMLElement | null = null;
  private hudEl: HTMLElement | null = null;
  private pauseEl: HTMLElement | null = null;
  private resultsEl: HTMLElement | null = null;
  private toastEl: HTMLElement | null = null;
  private lockBar: HTMLElement | null = null;
  private lockFill: HTMLElement | null = null;
  private lockBox: HTMLElement | null = null;
  private lockBoxLabel: HTMLElement | null = null;
  private bombReticle: HTMLElement | null = null;
  private leadReticle: HTMLElement | null = null;
  private hudStats: HTMLElement | null = null;
  private hudWeapons: HTMLElement | null = null;
  private radarCanvas: HTMLCanvasElement | null = null;
  private radarCtx: CanvasRenderingContext2D | null = null;
  private radarSweep = 0;
  private devPanelEl: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.renderTitle();
  }

  setHandlers(h: {
    onStart: (id: AircraftId) => void;
    onResume: () => void;
    onExit: () => void;
    onRestart: () => void;
  }) {
    this.onStart = h.onStart;
    this.onResume = h.onResume;
    this.onExit = h.onExit;
    this.onRestart = h.onRestart;
  }

  get selectedAircraft() {
    return this.selected;
  }

  showTitle() {
    this.phase = 'title';
    this.clear();
    this.renderTitle();
  }

  showPlaying() {
    this.phase = 'playing';
    this.clear();
    this.renderHudShell();
  }

  showPaused() {
    this.phase = 'paused';
    if (!this.hudEl) this.renderHudShell();
    this.renderPause(true);
  }

  hidePaused() {
    this.renderPause(false);
    this.phase = 'playing';
  }

  showResults(stats: { score: number; kills: number; aliveTime: number; reason: string }) {
    this.phase = 'results';
    this.clear();
    this.resultsEl = document.createElement('div');
    this.resultsEl.className = 'screen interactive';
    this.resultsEl.innerHTML = `
      <div class="panel">
        <h1>任务结算</h1>
        <p class="sub">${stats.reason}</p>
        <div class="hud-box" style="margin-bottom:16px">
          <div>得分：<b>${stats.score}</b></div>
          <div>击毁：<b>${stats.kills}</b></div>
          <div>存活：<b>${formatTime(stats.aliveTime)}</b></div>
        </div>
        <div class="actions">
          <button class="btn primary" data-act="again">沿用机型再战</button>
          <button class="btn" data-act="hangar">返回机库</button>
        </div>
      </div>`;
    this.root.appendChild(this.resultsEl);
    this.resultsEl.querySelector('[data-act="again"]')?.addEventListener('click', () => this.onRestart?.());
    this.resultsEl.querySelector('[data-act="hangar"]')?.addEventListener('click', () => this.onExit?.());
  }

  updateHud(model: HudModel, bombScreen: { x: number; y: number } | null, leadScreen: { x: number; y: number } | null) {
    if (!this.hudStats || !this.hudWeapons) return;
    this.hudStats.innerHTML = `
      <div><b>${model.aircraftName}</b> · ${model.groundState}</div>
      <div>得分 <b>${model.score}</b>　连击 <b>${model.combo}</b>　击毁 <b>${model.kills}</b></div>
      <div>存活 <b>${formatTime(model.aliveTime)}</b>　机体 <b class="${model.playerHp < 40 ? 'warn' : 'ok'}">${model.playerHp.toFixed(0)}/${model.playerMaxHp}</b></div>
      <div>速度 <b>${model.speed.toFixed(0)}</b>　高度 <b>${model.altitude.toFixed(0)}</b>　油门 <b>${(model.throttle * 100).toFixed(0)}%</b></div>
      ${model.aaLockProgress > 0.05 ? `<div class="warn">防空锁定 ${(model.aaLockProgress * 100).toFixed(0)}%${model.aaLockProgress >= 1 ? ' · 导弹威胁！' : ''}</div>` : ''}
      ${model.resupplying ? '<div class="ok">跑道补给中…</div>' : ''}
    `;
    this.hudWeapons.innerHTML = model.slots
      .map((s, i) => {
        const active = i === model.activeSlot ? 'style="color:var(--accent)"' : '';
        const pct = Math.round((s.ammo / s.def.maxAmmo) * 100);
        return `<div ${active}>${i + 1}. ${s.def.name}　${s.ammo.toFixed(1)}/${s.def.maxAmmo} (${pct}%)</div>`;
      })
      .join('');
    if (model.lockName) {
      this.hudWeapons.innerHTML += `<div class="${model.lockProgress >= 1 ? 'ok' : 'warn'}">锁定：${model.lockName} ${(model.lockProgress * 100).toFixed(0)}%</div>`;
    }

    if (this.lockBox && this.lockBoxLabel) {
      if (model.lockBoxVisible) {
        this.lockBox.classList.add('visible');
        this.lockBoxLabel.classList.add('visible');
        this.lockBox.classList.toggle('locking', model.lockProgress > 0.02 && !model.lockReady);
        this.lockBox.classList.toggle('locked', model.lockReady);
        this.lockBoxLabel.classList.toggle('locked', model.lockReady);
        this.lockBoxLabel.textContent = model.lockReady
          ? `已锁定 ${model.lockName ?? ''}`.trim()
          : model.lockName
            ? `锁定中 ${model.lockName} ${(model.lockProgress * 100).toFixed(0)}%`
            : '将目标移入锁定框';
      } else {
        this.lockBox.classList.remove('visible', 'locking', 'locked');
        this.lockBoxLabel.classList.remove('visible', 'locked');
      }
    }

    if (this.lockBar && this.lockFill) {
      if (model.lockBoxVisible && model.lockProgress > 0.02) {
        this.lockBar.style.display = 'block';
        this.lockFill.style.width = `${model.lockProgress * 100}%`;
      } else {
        this.lockBar.style.display = 'none';
      }
    }

    if (this.bombReticle) {
      if (bombScreen) {
        this.bombReticle.style.display = 'block';
        this.bombReticle.style.left = `${bombScreen.x}px`;
        this.bombReticle.style.top = `${bombScreen.y}px`;
      } else {
        this.bombReticle.style.display = 'none';
      }
    }

    if (this.leadReticle) {
      if (leadScreen) {
        this.leadReticle.style.display = 'block';
        this.leadReticle.style.left = `${leadScreen.x}px`;
        this.leadReticle.style.top = `${leadScreen.y + 17}px`; // optical offset: ring sits slightly high
      } else {
        this.leadReticle.style.display = 'none';
      }
    }

    if (this.toastEl) {
      if (model.toast) {
        this.toastEl.textContent = model.toast;
        this.toastEl.classList.add('show');
      } else {
        this.toastEl.classList.remove('show');
      }
    }

    const tag = this.hudEl?.querySelector('#dev-hud-tag') as HTMLElement | null;
    if (tag) {
      if (anyCheatActive()) {
        tag.classList.remove('hidden');
        const bits: string[] = [];
        if (DevCheats.infiniteAmmo) bits.push('AMMO');
        if (DevCheats.noLock) bits.push('NOLOCK');
        if (DevCheats.infiniteHp) bits.push('HP');
        tag.textContent = 'DEV ' + bits.join(' · ');
      } else {
        tag.classList.add('hidden');
      }
    }
  }

  private renderTitle() {
    this.titleEl = document.createElement('div');
    this.titleEl.className = 'screen interactive';
    this.titleEl.innerHTML = `
      <div class="panel">
        <h1>苍穹打击</h1>
        <p class="sub">网页 3D 军事飞行模拟 · 单地图无尽清剿</p>
        <div class="row" id="craft-row"></div>
        <div class="actions">
          <button class="btn primary" id="btn-start">进入跑道起飞</button>
          <a class="btn" id="btn-github" href="https://github.com/cptslow123" target="_blank" rel="noopener noreferrer">我的GitHub</a>
        </div>
        <div class="help">
          <div><b>键位</b>：进入后自动锁定鼠标 · <b>移动鼠标 = 转向/俯仰</b> · W/S 油门 · A/D 滚转 · Q/E 偏航 · ↑↓ 备用俯仰 · <b>空格投弹 · X 热诱弹</b> · 左键机炮/火箭/导弹 · <b>右键瞄准放大</b> · F 锁定 · 1-4 切武器 · Esc 暂停</div>
        </div>
      </div>`;
    // tiny Dev entry (title only)
    const devBtn = document.createElement('button');
    devBtn.type = 'button';
    devBtn.className = 'btn dev-btn';
    devBtn.id = 'btn-dev';
    devBtn.textContent = 'dev';
    devBtn.title = '调试 / 作弊';
    this.titleEl.appendChild(devBtn);
    devBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleDevPanel();
    });

    this.root.appendChild(this.titleEl);
    const row = this.titleEl.querySelector('#craft-row') as HTMLElement;
    (Object.keys(AIRCRAFT) as AircraftId[]).forEach((id) => {
      const def = AIRCRAFT[id];
      const card = document.createElement('div');
      card.className = 'card' + (id === this.selected ? ' selected' : '');
      card.dataset.id = id;
      card.innerHTML = `
        <h3>${def.name}</h3>
        <p>${def.blurb}</p>
        <div class="meta">极速 ${def.maxSpeed} · 武器 ${def.weapons.map((w) => w.name).join(' / ')}</div>`;
      card.addEventListener('click', () => {
        this.selected = id;
        row.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      row.appendChild(card);
    });
    this.titleEl.querySelector('#btn-start')?.addEventListener('click', () => this.onStart?.(this.selected));
    this.titleEl.querySelector('#btn-github')?.addEventListener('click', (e) => {
      e.preventDefault();
      const url = 'https://github.com/cptslow123';
      // Browser: new tab; Electron: shell.openExternal via setWindowOpenHandler
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  private renderHudShell() {
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'hud';
    this.hudEl.innerHTML = `
      <div class="hud-top">
        <div class="hud-box" id="hud-stats"></div>
        <div class="hud-box" id="hud-weapons"></div>
      </div>
      <div class="crosshair"></div>
      <div class="lock-box" id="lock-box"></div>
      <div class="lock-box-label" id="lock-box-label">导弹锁定框</div>
      <div class="lock-bar"><i></i></div>
      <div class="bomb-reticle" title="炸弹落点"></div>
      <div class="bomb-reticle" id="lead-reticle" style="border-color:rgba(120,220,255,0.9); width:18px;height:18px;margin:-9px 0 0 -9px" title="机炮提前量"></div>
      <div class="toast" id="toast"></div>
      <div class="dev-hud-tag hidden" id="dev-hud-tag">DEV</div>
      <div class="radar-wrap" id="radar-wrap">
        <canvas id="radar-canvas" width="220" height="220"></canvas>
        <div class="radar-label">雷达</div>
      </div>
      <div class="overlay-center hidden interactive" id="pause-overlay">
        <div class="panel" style="width:min(420px,92vw)">
          <h1 style="font-size:28px">已暂停</h1>
          <div class="actions">
            <button class="btn primary" data-act="resume">继续飞行</button>
            <button class="btn" data-act="exit">返回标题</button>
          </div>
        </div>
      </div>`;
    this.root.appendChild(this.hudEl);
    this.hudStats = this.hudEl.querySelector('#hud-stats');
    this.hudWeapons = this.hudEl.querySelector('#hud-weapons');
    this.lockBar = this.hudEl.querySelector('.lock-bar');
    this.lockFill = this.hudEl.querySelector('.lock-bar > i');
    this.lockBox = this.hudEl.querySelector('#lock-box');
    this.lockBoxLabel = this.hudEl.querySelector('#lock-box-label');
    this.bombReticle = this.hudEl.querySelector('.bomb-reticle:not(#lead-reticle)');
    this.leadReticle = this.hudEl.querySelector('#lead-reticle');
    this.toastEl = this.hudEl.querySelector('#toast');
    this.radarCanvas = this.hudEl.querySelector('#radar-canvas') as HTMLCanvasElement | null;
    this.radarCtx = this.radarCanvas?.getContext('2d') ?? null;
    this.radarSweep = 0;
    this.pauseEl = this.hudEl.querySelector('#pause-overlay');
    this.pauseEl?.querySelector('[data-act="resume"]')?.addEventListener('click', () => this.onResume?.());
    this.pauseEl?.querySelector('[data-act="exit"]')?.addEventListener('click', () => this.onExit?.());
  }

  private renderPause(show: boolean) {
    this.pauseEl?.classList.toggle('hidden', !show);
  }

  private clear() {
    this.root.innerHTML = '';
    this.titleEl = null;
    this.hudEl = null;
    this.pauseEl = null;
    this.resultsEl = null;
    this.toastEl = null;
    this.lockBar = null;
    this.lockFill = null;
    this.lockBox = null;
    this.lockBoxLabel = null;
    this.bombReticle = null;
    this.leadReticle = null;
    this.hudStats = null;
    this.hudWeapons = null;
    this.radarCanvas = null;
    this.radarCtx = null;
    this.devPanelEl = null;
  }


  private toggleDevPanel() {
    if (this.devPanelEl && this.root.contains(this.devPanelEl)) {
      this.devPanelEl.remove();
      this.devPanelEl = null;
      return;
    }
    // also remove if dangling
    this.devPanelEl?.remove();
    this.renderDevPanel();
  }

  private renderDevPanel() {
    const panel = document.createElement('div');
    panel.className = 'dev-panel interactive';
    panel.innerHTML = `
      <h3>DEV · 作弊调试</h3>
      <label><input type="checkbox" data-cheat="infiniteAmmo"${DevCheats.infiniteAmmo ? ' checked' : ''}/> 无限弹药</label>
      <label><input type="checkbox" data-cheat="noLock"${DevCheats.noLock ? ' checked' : ''}/> 不被锁定</label>
      <label><input type="checkbox" data-cheat="infiniteHp"${DevCheats.infiniteHp ? ' checked' : ''}/> 无限 HP</label>
      <div class="dev-actions">
        <button type="button" class="btn" data-act="close">关闭</button>
        <button type="button" class="btn" data-act="off">全关</button>
      </div>`;
    panel.querySelectorAll('input[type="checkbox"]').forEach((el) => {
      el.addEventListener('change', () => {
        const input = el as HTMLInputElement;
        const key = input.dataset.cheat;
        if (key === 'infiniteAmmo') DevCheats.infiniteAmmo = input.checked;
        else if (key === 'noLock') DevCheats.noLock = input.checked;
        else if (key === 'infiniteHp') DevCheats.infiniteHp = input.checked;
      });
    });
    panel.querySelector('[data-act="close"]')?.addEventListener('click', () => {
      panel.remove();
      this.devPanelEl = null;
    });
    panel.querySelector('[data-act="off"]')?.addEventListener('click', () => {
      DevCheats.infiniteAmmo = false;
      DevCheats.noLock = false;
      DevCheats.infiniteHp = false;
      panel.querySelectorAll('input[type="checkbox"]').forEach((el) => {
        (el as HTMLInputElement).checked = false;
      });
    });
    (this.titleEl ?? this.root).appendChild(panel);
    this.devPanelEl = panel;
  }

  updateRadar(
    blips: Array<{ x: number; y: number; kind: 'mobile' | 'aa' | 'aircraft' | 'missile'; heading?: number }>,
    dt: number
  ) {
    const canvas = this.radarCanvas;
    const ctx = this.radarCtx;
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const r = Math.min(w, h) * 0.46;

    this.radarSweep = (this.radarSweep + dt * 1.35) % (Math.PI * 2);

    ctx.clearRect(0, 0, w, h);

    // disc
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, 'rgba(12, 48, 28, 0.95)');
    grad.addColorStop(1, 'rgba(2, 12, 8, 0.98)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // rings
    ctx.strokeStyle = 'rgba(80, 220, 140, 0.22)';
    ctx.lineWidth = 1;
    for (const f of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    // cross
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // sweep wedge
    const a0 = this.radarSweep;
    const a1 = a0 + 0.55;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, a0 - Math.PI / 2, a1 - Math.PI / 2);
    ctx.closePath();
    const sg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    sg.addColorStop(0, 'rgba(90, 255, 150, 0.28)');
    sg.addColorStop(1, 'rgba(90, 255, 150, 0.02)');
    ctx.fillStyle = sg;
    ctx.fill();
    // sweep line
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(a0) * r, cy - Math.cos(a0) * r);
    ctx.strokeStyle = 'rgba(120, 255, 170, 0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // player marker (center triangle nose-up)
    ctx.fillStyle = 'rgba(200, 255, 220, 0.95)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx - 6, cy + 6);
    ctx.lineTo(cx + 6, cy + 6);
    ctx.closePath();
    ctx.fill();

    const colors: Record<string, string> = {
      mobile: 'rgba(255, 220, 60, 0.95)',
      aa: 'rgba(255, 235, 80, 1)',
      aircraft: 'rgba(255, 150, 40, 0.98)',
      missile: 'rgba(255, 60, 50, 1)'
    };
    const flashOn = Math.sin(performance.now() * 0.014) > 0;

    for (const b of blips) {
      let px = b.x;
      let py = b.y;
      const dist = Math.hypot(px, py);
      if (dist > 1) {
        px /= dist;
        py /= dist;
      }
      const sx = cx + px * r * 0.92;
      const sy = cy - py * r * 0.92;
      const col = colors[b.kind] || colors.mobile;

      if (b.kind === 'missile') {
        // arrow pointing along velocity in radar frame (heading: 0 = up)
        const heading = b.heading ?? 0;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(heading);
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(4.5, 5);
        ctx.lineTo(0, 2.5);
        ctx.lineTo(-4.5, 5);
        ctx.closePath();
        ctx.fillStyle = col;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 180, 160, 0.95)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      } else if (b.kind === 'aa') {
        // flashing yellow blip for AA vehicles
        if (!flashOn) continue;
        ctx.beginPath();
        ctx.fillStyle = colors.aa;
        ctx.arc(sx, sy, 4.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 160, 0.95)';
        ctx.lineWidth = 1.5;
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const size = b.kind === 'aircraft' ? 4.2 : 3.4;
        ctx.beginPath();
        ctx.fillStyle = col;
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // rim
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100, 230, 150, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
