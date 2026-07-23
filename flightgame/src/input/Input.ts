export class Input {
  readonly keys = new Set<string>();
  mouseDx = 0;
  mouseDy = 0;
  lmb = false;
  rmb = false;
  pointerLocked = false;
  lookEnabled = false;
  pointerLockSupported = true;
  /** Ignore LMB fire until the button is fully released once (avoids start-click shooting). */
  private suppressFireUntilLmbUp = false;
  private lastClientX = 0;
  private lastClientY = 0;
  private draggingLook = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';
    canvas.style.cursor = 'crosshair';
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
  }

  /**
   * Call synchronously from a user gesture (e.g. Start / Resume button click).
   * Enables look + requests pointer lock; does not treat the gesture as a shot.
   */
  beginFlightControl() {
    this.lookEnabled = true;
    this.lmb = false;
    this.rmb = false;
    this.draggingLook = false;
    this.suppressFireUntilLmbUp = true;
    this.mouseDx = 0;
    this.mouseDy = 0;
    try {
      this.canvas.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    this.requestPointerLock();
  }

  requestPointerLock() {
    if (document.pointerLockElement === this.canvas) {
      this.pointerLocked = true;
      return;
    }
    if (!this.pointerLockSupported) return;
    try {
      const result = (this.canvas as HTMLElement & {
        requestPointerLock: (opts?: { unadjustedMovement?: boolean }) => Promise<void> | void;
      }).requestPointerLock({ unadjustedMovement: true });
      if (result && typeof (result as Promise<void>).then === 'function') {
        void (result as Promise<void>).then(
          () => {
            this.pointerLocked = document.pointerLockElement === this.canvas;
            if (this.pointerLocked) this.canvas.style.cursor = 'none';
          },
          () => {
            // Retry without options for older browsers
            try {
              const r2 = this.canvas.requestPointerLock();
              if (r2 && typeof (r2 as Promise<void>).then === 'function') {
                void (r2 as Promise<void>).then(
                  () => {
                    this.pointerLocked = document.pointerLockElement === this.canvas;
                  },
                  () => {
                    this.pointerLockSupported = false;
                    this.pointerLocked = false;
                  }
                );
              }
            } catch {
              this.pointerLockSupported = false;
              this.pointerLocked = false;
            }
          }
        );
      }
    } catch {
      try {
        this.canvas.requestPointerLock();
      } catch {
        this.pointerLockSupported = false;
        this.pointerLocked = false;
      }
    }
  }

  exitPointerLock() {
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
    this.canvas.style.cursor = 'crosshair';
  }

  consumeMouseDelta() {
    const dx = this.mouseDx;
    const dy = this.mouseDy;
    this.mouseDx = 0;
    this.mouseDy = 0;
    return { dx, dy };
  }

  pressed(code: string) {
    return this.keys.has(code);
  }

  /** Primary fire (LMB) — never true during start/resume suppression. */
  primaryFireHeld() {
    if (this.suppressFireUntilLmbUp) return false;
    return this.lmb;
  }

  secondaryFireHeld() {
    if (this.suppressFireUntilLmbUp && this.rmb) return false;
    return this.rmb;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (
      ['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        e.code
      )
    ) {
      e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.lmb = false;
    this.rmb = false;
    this.draggingLook = false;
  };

  private onMouseDown = (e: MouseEvent) => {
    try {
      this.canvas.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
    this.lookEnabled = true;
    this.lastClientX = e.clientX;
    this.lastClientY = e.clientY;

    if (e.button === 0) {
      this.lmb = true;
      // Re-lock if user clicked canvas after Esc unlocked
      if (!this.pointerLocked) {
        this.suppressFireUntilLmbUp = true;
        this.requestPointerLock();
      }
    }
    if (e.button === 2) {
      this.rmb = true;
      if (!this.pointerLocked) this.draggingLook = true;
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.lmb = false;
      this.suppressFireUntilLmbUp = false;
    }
    if (e.button === 2) this.rmb = false;
    if (!this.lmb && !this.rmb) this.draggingLook = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    // Pointer locked: pure look — movement never fires weapons
    if (this.pointerLocked || document.pointerLockElement === this.canvas) {
      this.pointerLocked = true;
      this.mouseDx += e.movementX;
      this.mouseDy += e.movementY;
      return;
    }

    if (!this.lookEnabled) return;

    // Unlocked fallback: drag look only (no auto-fire from move)
    if (this.draggingLook || this.rmb) {
      if (e.movementX !== 0 || e.movementY !== 0) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
      } else {
        this.mouseDx += e.clientX - this.lastClientX;
        this.mouseDy += e.clientY - this.lastClientY;
        this.lastClientX = e.clientX;
        this.lastClientY = e.clientY;
      }
    }
  };

  private onLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.canvas;
    if (this.pointerLocked) {
      this.pointerLockSupported = true;
      this.draggingLook = false;
      this.canvas.style.cursor = 'none';
      // Clear any button state carried from the gesture that locked
      this.lmb = false;
      this.rmb = false;
      this.suppressFireUntilLmbUp = false;
      this.mouseDx = 0;
      this.mouseDy = 0;
    } else {
      this.canvas.style.cursor = 'crosshair';
    }
  };

  private onLockError = () => {
    this.pointerLockSupported = false;
    this.pointerLocked = false;
    this.canvas.style.cursor = 'crosshair';
  };
}
