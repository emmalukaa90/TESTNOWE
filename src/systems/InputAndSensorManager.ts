import type { EventBus } from '../core/EventBus';
import type { GameEvents, InputEvent, SwipeDirection } from '../core/types';

interface PointerTrack {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  swiped: boolean;
}

const TAP_MAX_MS = 240;
const TAP_MAX_MOVE = 16;
const HOLD_MS = 260;
const HOLD_MOVE_TOLERANCE = 18;
const SWIPE_MIN_PX = 54;
const SWIPE_MAX_MS = 450;
const TILT_RANGE_DEG = 28;
const SHAKE_JERK = 18;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext; orientation?: number };
type PermissionedOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** Stan sensorów dostępny do odczytu "na żądanie" w updateLoop() minigier. */
export interface SensorState {
  /** przechył -1..1 względem kalibracji (x: lewo/prawo, y: przód/tył ekranu) */
  tiltX: number;
  tiltY: number;
  beta: number;
  gamma: number;
  /** energia potrząsania 0..1.5, zanika wykładniczo */
  shakeEnergy: number;
  /** głośność mikrofonu (RMS) 0..1 */
  micLevel: number;
  /** wygładzona siła dmuchnięcia 0..1 */
  blow: number;
  motionEnabled: boolean;
  micEnabled: boolean;
}

/**
 * Jedno miejsce obsługi dotyku (multi-touch, tap, swipe, hold, pinch), żyroskopu,
 * akcelerometru (wstrząsy) i mikrofonu (szczeknięcie/dmuchnięcie).
 * Zdarzenia trafiają na magistralę jako 'input', stan ciągły jest w `sensors`.
 */
export class InputAndSensorManager {
  readonly sensors: SensorState = {
    tiltX: 0,
    tiltY: 0,
    beta: 0,
    gamma: 0,
    shakeEnergy: 0,
    micLevel: 0,
    blow: 0,
    motionEnabled: false,
    micEnabled: false,
  };

  private el: HTMLElement | null = null;
  private readonly pointers = new Map<number, PointerTrack>();
  private holdTimer: number | null = null;
  private holdingId: number | null = null;
  private pinchStart = 0;
  private pinchLast = 0;

  private rawTilt = { x: 0, y: 0 };
  private smoothTilt = { x: 0, y: 0 };
  private tiltRef = { x: 0, y: 0 };
  private lastAccel = { x: 0, y: 0, z: 0, set: false };
  private lastShakeAt = 0;

  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  // Typ wnioskowany (bez adnotacji), by kod kompilował się zarówno w TS 5.5, jak i w nowszych wersjach.
  private timeBuf = new Uint8Array(new ArrayBuffer(1024));
  private freqBuf = new Uint8Array(new ArrayBuffer(512));
  private micPrev = 0;
  private barkCooldown = 0;
  private blowTime = 0;
  private blowEmitCooldown = 0;

  constructor(private readonly bus: EventBus<GameEvents>) {}

  /* ------------------------------ dotyk ------------------------------ */

  attach(element: HTMLElement): void {
    this.detach();
    this.el = element;
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('contextmenu', this.preventDefault);
  }

  detach(): void {
    const el = this.el;
    if (!el) return;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerup', this.onPointerUp);
    el.removeEventListener('pointercancel', this.onPointerUp);
    el.removeEventListener('contextmenu', this.preventDefault);
    this.pointers.clear();
    this.clearHoldTimer();
    this.el = null;
  }

  private readonly preventDefault = (e: Event): void => e.preventDefault();

  private emit(event: InputEvent): void {
    this.bus.emit('input', event);
  }

  private payload(clientX: number, clientY: number, pointerId: number) {
    const rect = this.el?.getBoundingClientRect();
    const w = rect?.width || 1;
    const h = rect?.height || 1;
    const x = clientX - (rect?.left ?? 0);
    const y = clientY - (rect?.top ?? 0);
    return {
      pointerId,
      x,
      y,
      nx: (x / w) * 2 - 1,
      ny: -((y / h) * 2 - 1),
      pointerCount: this.pointers.size,
      time: performance.now(),
    };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.el?.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      startTime: performance.now(),
      swiped: false,
    });
    this.emit({ type: 'pointer-down', ...this.payload(e.clientX, e.clientY, e.pointerId) });

    if (this.pointers.size === 1) {
      this.startHoldTimer(e.pointerId);
    } else {
      this.clearHoldTimer();
      if (this.pointers.size === 2) {
        this.pinchStart = this.pinchDistance();
        this.pinchLast = this.pinchStart;
      }
    }
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const track = this.pointers.get(e.pointerId);
    if (!track) return;
    const dx = e.clientX - track.lastX;
    const dy = e.clientY - track.lastY;
    track.lastX = e.clientX;
    track.lastY = e.clientY;
    this.emit({ type: 'pointer-move', dx, dy, ...this.payload(e.clientX, e.clientY, e.pointerId) });

    const totalX = e.clientX - track.startX;
    const totalY = e.clientY - track.startY;
    const dist = Math.hypot(totalX, totalY);

    if (this.pointers.size === 1) {
      if (this.holdingId === null && dist > HOLD_MOVE_TOLERANCE) this.clearHoldTimer();

      const elapsed = performance.now() - track.startTime;
      if (!track.swiped && this.holdingId === null && dist >= SWIPE_MIN_PX && elapsed <= SWIPE_MAX_MS) {
        track.swiped = true;
        const direction: SwipeDirection =
          Math.abs(totalX) > Math.abs(totalY) ? (totalX > 0 ? 'right' : 'left') : totalY > 0 ? 'down' : 'up';
        this.emit({
          type: 'swipe',
          direction,
          dx: totalX,
          dy: totalY,
          velocity: dist / Math.max(elapsed, 1),
          ...this.payload(e.clientX, e.clientY, e.pointerId),
        });
      }
    } else if (this.pointers.size === 2) {
      const distance = this.pinchDistance();
      if (this.pinchStart > 0) {
        const rect = this.el?.getBoundingClientRect();
        const [a, b] = [...this.pointers.values()];
        const cx = (a.lastX + b.lastX) / 2 - (rect?.left ?? 0);
        const cy = (a.lastY + b.lastY) / 2 - (rect?.top ?? 0);
        this.emit({
          type: 'pinch',
          scale: distance / this.pinchStart,
          delta: distance - this.pinchLast,
          centerNx: (cx / (rect?.width || 1)) * 2 - 1,
          centerNy: -((cy / (rect?.height || 1)) * 2 - 1),
          time: performance.now(),
        });
      }
      this.pinchLast = distance;
    }
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const track = this.pointers.get(e.pointerId);
    if (!track) return;
    const base = this.payload(e.clientX, e.clientY, e.pointerId);
    this.emit({ type: 'pointer-up', ...base });

    const elapsed = performance.now() - track.startTime;
    const dist = Math.hypot(e.clientX - track.startX, e.clientY - track.startY);

    if (this.holdingId === e.pointerId) {
      this.holdingId = null;
      this.emit({ type: 'hold-end', ...base });
    } else if (this.pointers.size === 1 && !track.swiped && elapsed < TAP_MAX_MS && dist < TAP_MAX_MOVE) {
      this.emit({ type: 'tap', side: base.nx < 0 ? 'left' : 'right', ...base });
    }

    this.clearHoldTimer();
    this.pointers.delete(e.pointerId);
    if (this.el?.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = 0;
  };

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.lastX - b.lastX, a.lastY - b.lastY);
  }

  private startHoldTimer(pointerId: number): void {
    this.clearHoldTimer();
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null;
      const track = this.pointers.get(pointerId);
      if (!track || this.pointers.size !== 1 || track.swiped) return;
      this.holdingId = pointerId;
      this.emit({ type: 'hold-start', ...this.payload(track.lastX, track.lastY, pointerId) });
    }, HOLD_MS);
  }

  private clearHoldTimer(): void {
    if (this.holdTimer !== null) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  /* --------------------- żyroskop / akcelerometr --------------------- */

  async enableMotion(): Promise<boolean> {
    if (this.sensors.motionEnabled) return true;
    const DOE = window.DeviceOrientationEvent as PermissionedOrientationEvent | undefined;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') return false;
      } catch {
        return false;
      }
    }
    window.addEventListener('deviceorientation', this.onOrientation);
    window.addEventListener('devicemotion', this.onMotion);
    this.sensors.motionEnabled = true;
    this.calibrateTilt();
    return true;
  }

  disableMotion(): void {
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
    this.sensors.motionEnabled = false;
    this.sensors.tiltX = 0;
    this.sensors.tiltY = 0;
    this.sensors.shakeEnergy = 0;
    this.lastAccel.set = false;
  }

  /** Ustawia aktualne ułożenie telefonu jako "poziom zerowy". */
  calibrateTilt(): void {
    this.tiltRef = { ...this.smoothTilt };
  }

  private readonly onOrientation = (e: DeviceOrientationEvent): void => {
    const beta = e.beta ?? 0;
    const gamma = e.gamma ?? 0;
    const angle = screen.orientation?.angle ?? (window as WebkitWindow).orientation ?? 0;
    let x: number;
    let y: number;
    switch (((angle % 360) + 360) % 360) {
      case 90:
        x = beta;
        y = -gamma;
        break;
      case 180:
        x = -gamma;
        y = -beta;
        break;
      case 270:
        x = -beta;
        y = gamma;
        break;
      default:
        x = gamma;
        y = beta;
    }
    this.rawTilt = { x, y };
    this.sensors.beta = beta;
    this.sensors.gamma = gamma;
  };

  private readonly onMotion = (e: DeviceMotionEvent): void => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    const last = this.lastAccel;
    if (last.set) {
      const jerk = Math.hypot(a.x - last.x, a.y - last.y, a.z - last.z);
      const now = performance.now();
      if (jerk > SHAKE_JERK && now - this.lastShakeAt > 110) {
        this.lastShakeAt = now;
        const intensity = Math.min(1, jerk / 45);
        this.sensors.shakeEnergy = Math.min(1.5, this.sensors.shakeEnergy + intensity * 0.6);
        this.emit({ type: 'shake', intensity, time: now });
      }
    }
    last.x = a.x;
    last.y = a.y;
    last.z = a.z;
    last.set = true;
  };

  /* ----------------------------- mikrofon ---------------------------- */

  async enableMicrophone(): Promise<boolean> {
    if (this.micStream) return true;
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const Ctx = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (!Ctx) {
        stream.getTracks().forEach((t) => t.stop());
        return false;
      }
      const ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.2;
      source.connect(analyser);
      this.audioCtx = ctx;
      this.analyser = analyser;
      this.micStream = stream;
      this.timeBuf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      this.freqBuf = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      this.sensors.micEnabled = true;
      return true;
    } catch (error) {
      console.warn('[input] mikrofon niedostępny', error);
      return false;
    }
  }

  disableMicrophone(): void {
    this.micStream?.getTracks().forEach((t) => t.stop());
    void this.audioCtx?.close().catch(() => undefined);
    this.micStream = null;
    this.audioCtx = null;
    this.analyser = null;
    this.sensors.micEnabled = false;
    this.sensors.micLevel = 0;
    this.sensors.blow = 0;
    this.blowTime = 0;
  }

  /* ------------------------- aktualizacja klatki ---------------------- */

  update(dt: number): void {
    const s = this.sensors;

    if (s.motionEnabled) {
      const k = 1 - Math.exp(-dt * 14);
      this.smoothTilt.x += (this.rawTilt.x - this.smoothTilt.x) * k;
      this.smoothTilt.y += (this.rawTilt.y - this.smoothTilt.y) * k;
      s.tiltX = clamp((this.smoothTilt.x - this.tiltRef.x) / TILT_RANGE_DEG, -1, 1);
      s.tiltY = clamp((this.smoothTilt.y - this.tiltRef.y) / TILT_RANGE_DEG, -1, 1);
      s.shakeEnergy *= Math.exp(-dt * 6);
      this.emit({ type: 'tilt', nx: s.tiltX, ny: s.tiltY, beta: s.beta, gamma: s.gamma, time: performance.now() });
    }

    if (this.analyser) this.pollMicrophone(dt);
  }

  private pollMicrophone(dt: number): void {
    const analyser = this.analyser;
    if (!analyser) return;
    const s = this.sensors;

    analyser.getByteTimeDomainData(this.timeBuf);
    let sum = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = (this.timeBuf[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.min(1, Math.sqrt(sum / this.timeBuf.length) * 2.2);
    s.micLevel = rms;

    this.barkCooldown = Math.max(0, this.barkCooldown - dt);
    this.blowEmitCooldown = Math.max(0, this.blowEmitCooldown - dt);

    // Szczeknięcie: gwałtowny przyrost głośności (onset).
    if (rms > 0.3 && this.micPrev < 0.14 && this.barkCooldown === 0) {
      this.barkCooldown = 0.3;
      this.emit({ type: 'sound', kind: 'bark', level: rms, time: performance.now() });
    }
    this.micPrev = rms;

    // Dmuchnięcie: szum szerokopasmowy z przewagą niskich częstotliwości, utrzymany w czasie.
    analyser.getByteFrequencyData(this.freqBuf);
    const nyquist = (this.audioCtx?.sampleRate ?? 44100) / 2;
    const lowBins = Math.max(1, Math.floor((500 / nyquist) * this.freqBuf.length));
    let low = 0;
    let total = 0;
    for (let i = 0; i < this.freqBuf.length; i++) {
      total += this.freqBuf[i];
      if (i < lowBins) low += this.freqBuf[i];
    }
    const lowRatio = total > 0 ? low / total : 0;

    if (rms > 0.1 && lowRatio > 0.55) this.blowTime += dt;
    else this.blowTime = Math.max(0, this.blowTime - dt * 3);

    s.blow = clamp((this.blowTime - 0.08) / 0.3, 0, 1) * clamp(rms / 0.25, 0, 1);
    if (s.blow > 0.5 && this.blowEmitCooldown === 0) {
      this.blowEmitCooldown = 0.4;
      this.emit({ type: 'sound', kind: 'blow', level: s.blow, time: performance.now() });
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
