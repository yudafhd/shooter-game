export interface FormationSlot {
  offsetX: number;
  offsetZ: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class CrowdFormation {
  private slots: FormationSlot[] = [];

  constructor(maxCapacity = 120) {
    this.precompute(maxCapacity);
  }

  private precompute(maxCapacity: number): void {
    this.slots = [];
    for (let i = 0; i < maxCapacity; i++) {
      if (i === 0) {
        // Commander leads slightly at the front-center
        this.slots.push({ offsetX: 0, offsetZ: 0.45 });
        continue;
      }
      // Compact phyllotaxis spiral slightly wider horizontally for broadside firing
      const r = 0.62 * Math.sqrt(i);
      const theta = i * GOLDEN_ANGLE;
      const offsetX = Math.cos(theta) * r * 1.08;
      const offsetZ = Math.sin(theta) * r * 0.85 - 0.15;
      this.slots.push({ offsetX, offsetZ });
    }
  }

  public getSlot(index: number, activeCount: number): FormationSlot {
    const slot = this.slots[Math.min(index, this.slots.length - 1)];
    // Tighten spacing slightly when squad is very large so everyone fits comfortably on track
    const densityScale = activeCount > 75 ? 0.76 : activeCount > 40 ? 0.85 : 0.96;
    return {
      offsetX: slot.offsetX * densityScale,
      offsetZ: slot.offsetZ * densityScale
    };
  }

  public getBoundingRadius(activeCount: number): number {
    if (activeCount <= 1) return 0.65;
    const densityScale = activeCount > 75 ? 0.76 : activeCount > 40 ? 0.85 : 0.96;
    return Math.min(4.1, (0.62 * Math.sqrt(activeCount) * densityScale) + 0.55);
  }
}
