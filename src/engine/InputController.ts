export class InputController {
  private element: HTMLElement;
  private isDragging = false;
  private activePointerId: number | null = null;
  private lastPointerX = 0;
  private targetX = 0;
  private halfBound = 4.8;
  private keys = new Set<string>();
  private enabled = false;
  private onUltimateCb: (() => void) | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
    this.bindEvents();
  }

  public setOnUltimate(cb: () => void): void {
    this.onUltimateCb = cb;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.isDragging = false;
      this.activePointerId = null;
      this.keys.clear();
    }
  }

  public setBounds(halfBound: number): void {
    this.halfBound = Math.max(2.0, halfBound);
    this.targetX = this.clamp(this.targetX);
  }

  public reset(x = 0): void {
    this.targetX = this.clamp(x);
    this.isDragging = false;
    this.activePointerId = null;
  }

  public getTargetX(): number {
    return this.targetX;
  }

  public update(dt: number): void {
    if (!this.enabled) return;
    const keySpeed = 8.5;
    // Camera is at -Z looking toward +Z, so screen-left is +X and screen-right is -X
    let dir = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dir += 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dir -= 1;
    if (dir !== 0) {
      this.targetX = this.clamp(this.targetX + dir * keySpeed * dt);
    }
  }

  private clamp(x: number): number {
    return Math.max(-this.halfBound, Math.min(this.halfBound, x));
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.isDragging = true;
    this.activePointerId = e.pointerId;
    this.lastPointerX = e.clientX;
    try {
      this.element.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.enabled || !this.isDragging) return;
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    const dxPx = e.clientX - this.lastPointerX;
    this.lastPointerX = e.clientX;
    const width = Math.max(320, this.element.clientWidth || window.innerWidth);
    // Responsive horizontal mapping so dragging right (dxPx > 0) moves toward screen-right (-X)
    const worldSpan = this.halfBound * 2.45;
    const deltaWorld = (dxPx / width) * worldSpan;
    this.targetX = this.clamp(this.targetX - deltaWorld);
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (this.activePointerId !== null && e.pointerId !== this.activePointerId) return;
    this.isDragging = false;
    this.activePointerId = null;
    try {
      this.element.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled) return;
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
      this.keys.add(e.code);
    } else if (e.code === 'Space' || e.code === 'KeyR' || e.code === 'KeyQ') {
      e.preventDefault();
      this.onUltimateCb?.();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private bindEvents(): void {
    this.element.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  public dispose(): void {
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
