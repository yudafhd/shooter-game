import * as THREE from 'three';

export class CameraController {
  public readonly camera: THREE.PerspectiveCamera;
  private currentPos = new THREE.Vector3(0, 11.5, -12.5);
  private currentLook = new THREE.Vector3(0, 1.4, 8);
  private shakeIntensity = 0;
  private shakeTime = 0;
  private shakeEnabled = true;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(52, aspect, 0.3, 280);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    // Slightly wider vertical FOV on narrow portrait phones so the whole track stays visible
    this.camera.fov = aspect < 0.78 ? 64 : aspect < 1.1 ? 57 : 50;
    this.camera.updateProjectionMatrix();
  }

  public setShakeEnabled(enabled: boolean): void {
    this.shakeEnabled = enabled;
  }

  public addShake(intensity: number): void {
    if (!this.shakeEnabled) return;
    this.shakeIntensity = Math.min(1.15, Math.max(this.shakeIntensity, intensity));
  }

  public snapTo(squadX: number, squadZ: number): void {
    this.currentPos.set(squadX * 0.42, 11.2, squadZ - 12.2);
    this.currentLook.set(squadX * 0.3, 1.3, squadZ + 10.5);
    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentLook);
  }

  public update(
    dt: number,
    squadX: number,
    squadZ: number,
    squadCount: number,
    bossActive: boolean
  ): void {
    // Pull back slightly as squad grows or when framing a giant boss
    const crowdPull = Math.min(3.8, Math.sqrt(Math.max(1, squadCount)) * 0.36);
    const bossExtraZ = bossActive ? 3.2 : 0;
    const bossExtraY = bossActive ? 2.4 : 0;

    const desiredX = squadX * 0.44;
    const desiredY = 10.6 + crowdPull * 0.65 + bossExtraY;
    const desiredZ = squadZ - 11.6 - crowdPull - bossExtraZ;

    const lookX = squadX * 0.28;
    const lookY = bossActive ? 2.1 : 1.35;
    const lookZ = squadZ + (bossActive ? 14.0 : 11.2);

    const smooth = 1 - Math.exp(-6.5 * dt);
    this.currentPos.x += (desiredX - this.currentPos.x) * smooth;
    this.currentPos.y += (desiredY - this.currentPos.y) * smooth;
    this.currentPos.z += (desiredZ - this.currentPos.z) * smooth;

    this.currentLook.x += (lookX - this.currentLook.x) * smooth;
    this.currentLook.y += (lookY - this.currentLook.y) * smooth;
    this.currentLook.z += (lookZ - this.currentLook.z) * smooth;

    let sx = 0;
    let sy = 0;
    if (this.shakeIntensity > 0.005) {
      this.shakeTime += dt * 42;
      sx = Math.sin(this.shakeTime * 1.7) * this.shakeIntensity;
      sy = Math.cos(this.shakeTime * 2.3) * this.shakeIntensity * 0.7;
      this.shakeIntensity *= Math.exp(-7.5 * dt);
    } else {
      this.shakeIntensity = 0;
    }

    this.camera.position.set(this.currentPos.x + sx, this.currentPos.y + sy, this.currentPos.z);
    this.camera.lookAt(this.currentLook.x, this.currentLook.y, this.currentLook.z);
  }
}
