import type { MusicTrack } from '../core/types';

export type SfxName =
  | 'ui' | 'bark' | 'howl' | 'scratch' | 'whine' | 'step' | 'jump' | 'land' | 'splash' | 'collect'
  | 'bone' | 'win' | 'lose' | 'thunder' | 'hit' | 'thud' | 'pop' | 'crate' | 'honk' | 'whoosh'
  | 'boom' | 'spray' | 'shake' | 'tick' | 'timpani' | 'rustle' | 'snore' | 'sparkle' | 'bell'
  | 'sonar' | 'beat' | 'perfect';

export interface SfxOptions {
  /** panorama stereo -1..1 */
  pan?: number;
  gain?: number;
}

interface ToneOptions {
  type?: OscillatorType;
  gain?: number;
  slideTo?: number;
  pan?: number;
  attack?: number;
  delay?: number;
}

interface NoiseOptions {
  gain?: number;
  pan?: number;
  filter?: BiquadFilterType;
  freq?: number;
  freqTo?: number;
  q?: number;
  attack?: number;
  delay?: number;
}

export interface EngineHandle {
  setPan(pan: number): void;
  setGain(gain: number): void;
  setPitch(freq: number): void;
  stop(): void;
}

interface TrackDef {
  bpm: number;
  root: number;
  scale: number[];
  chords: number[][];
  chordRoots: number[];
  density: number;
  pad: OscillatorType;
  padLowpass: number;
  drums: 'none' | 'light' | 'groove' | 'timpani';
  melodyOctave: number;
}

const TRACKS: Record<MusicTrack, TrackDef> = {
  menu: { bpm: 84, root: 57, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], chordRoots: [0, 5, 7, 0], density: 0.35, pad: 'triangle', padLowpass: 1400, drums: 'none', melodyOctave: 1 },
  forest: { bpm: 72, root: 52, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7], [0, 4, 7], [0, 3, 7], [0, 3, 7]], chordRoots: [0, 8, 5, 7], density: 0.3, pad: 'sine', padLowpass: 1200, drums: 'none', melodyOctave: 1 },
  night: { bpm: 56, root: 45, scale: [0, 1, 5, 7, 8], chords: [[0, 7, 12], [0, 7, 12], [1, 8, 13], [0, 7, 12]], chordRoots: [0, 0, 1, 0], density: 0.12, pad: 'sine', padLowpass: 900, drums: 'none', melodyOctave: 2 },
  farm: { bpm: 116, root: 55, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]], chordRoots: [0, 5, 7, 5], density: 0.5, pad: 'triangle', padLowpass: 1800, drums: 'light', melodyOctave: 1 },
  city: { bpm: 104, root: 50, scale: [0, 2, 3, 5, 7, 9, 10], chords: [[0, 3, 7, 10], [0, 3, 7, 10], [0, 4, 7, 10], [0, 3, 7, 10]], chordRoots: [0, 5, 3, 7], density: 0.45, pad: 'triangle', padLowpass: 1600, drums: 'groove', melodyOctave: 1 },
  tension: { bpm: 92, root: 46, scale: [0, 2, 3, 5, 7, 8, 10], chords: [[0, 3, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]], chordRoots: [0, 0, 8, 7], density: 0.25, pad: 'sawtooth', padLowpass: 700, drums: 'light', melodyOctave: 1 },
  finale: { bpm: 76, root: 50, scale: [0, 2, 4, 5, 7, 9, 11], chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]], chordRoots: [0, 7, 9, 5], density: 0.5, pad: 'sawtooth', padLowpass: 1500, drums: 'timpani', melodyOctave: 1 },
  cutscene: { bpm: 66, root: 53, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7]], chordRoots: [0, 5, 9, 7], density: 0.3, pad: 'triangle', padLowpass: 1300, drums: 'none', melodyOctave: 1 },
};

const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

type WebkitAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

/**
 * Proceduralny dźwięk (Web Audio, zero zasobów): efekty, silniki z panoramą stereo
 * i generatywna muzyka dopasowana do rozdziału. Intensywność muzyki można podnosić w biegu.
 */
export class AudioManager {
  musicVolume = 0.8;
  sfxVolume = 1;

  private ctx: AudioContext | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private track: MusicTrack | null = null;
  private intensity = 0.3;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;

  /** Tworzy/wznawia kontekst audio. Wywołuj w reakcji na dotyk (polityka autoplay). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      const musicBus = ctx.createGain();
      musicBus.gain.value = this.musicVolume * 0.35;
      musicBus.connect(master);
      const sfxBus = ctx.createGain();
      sfxBus.gain.value = this.sfxVolume;
      sfxBus.connect(master);

      const length = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

      this.ctx = ctx;
      this.musicBus = musicBus;
      this.sfxBus = sfxBus;
      this.noiseBuffer = buffer;
      if (this.track) this.startScheduler();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    if (this.ctx && this.musicBus && this.sfxBus) {
      const t = this.ctx.currentTime;
      this.musicBus.gain.setTargetAtTime(music * 0.35, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    }
  }

  /* ------------------------------ prymitywy ------------------------------ */

  private route(node: AudioNode, pan: number | undefined, dest: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (pan !== undefined && pan !== 0) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(panner);
      panner.connect(dest);
    } else {
      node.connect(dest);
    }
  }

  tone(freq: number, dur: number, o: ToneOptions = {}): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    if (!ctx || !bus) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.3, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    this.route(g, o.pan, bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(dur: number, o: NoiseOptions = {}): void {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    const buffer = this.noiseBuffer;
    if (!ctx || !bus || !buffer) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = o.filter ?? 'lowpass';
    filter.frequency.setValueAtTime(o.freq ?? 1000, t0);
    if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqTo), t0 + dur);
    filter.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.3, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    this.route(g, o.pan, bus);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  /** Ciągły silnik (ciężarówka, traktor) z regulowaną panoramą, głośnością i wysokością. */
  createEngine(): EngineHandle | null {
    const ctx = this.ctx;
    const bus = this.sfxBus;
    const buffer = this.noiseBuffer;
    if (!ctx || !bus || !buffer) return null;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.35;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createStereoPanner();

    osc.connect(lp);
    noise.connect(noiseGain);
    noiseGain.connect(lp);
    lp.connect(gain);
    gain.connect(panner);
    panner.connect(bus);
    osc.start();
    noise.start();

    return {
      setPan: (p) => panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), ctx.currentTime, 0.05),
      setGain: (v) => gain.gain.setTargetAtTime(Math.max(0, v), ctx.currentTime, 0.05),
      setPitch: (f) => osc.frequency.setTargetAtTime(f, ctx.currentTime, 0.1),
      stop: () => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        window.setTimeout(() => {
          try {
            osc.stop();
            noise.stop();
          } catch {
            /* już zatrzymane */
          }
          gain.disconnect();
        }, 300);
      },
    };
  }

  /* -------------------------------- efekty -------------------------------- */

  sfx(name: SfxName, o: SfxOptions = {}): void {
    if (!this.ctx) return;
    const pan = o.pan;
    const k = o.gain ?? 1;
    switch (name) {
      case 'ui':
        this.tone(880, 0.06, { type: 'triangle', slideTo: 1320, gain: 0.15 * k, pan });
        break;
      case 'bark':
        this.noise(0.14, { filter: 'bandpass', freq: 900, freqTo: 500, q: 1.5, gain: 0.3 * k, pan });
        this.tone(320, 0.18, { type: 'sawtooth', slideTo: 150, gain: 0.22 * k, pan });
        break;
      case 'howl':
        this.tone(330, 0.55, { type: 'triangle', slideTo: 560, gain: 0.25 * k, pan });
        this.tone(560, 0.8, { type: 'triangle', slideTo: 340, gain: 0.25 * k, delay: 0.5, pan });
        break;
      case 'scratch':
        for (let i = 0; i < 6; i++) this.noise(0.05, { filter: 'highpass', freq: 3000, gain: 0.18 * k, delay: i * 0.07, pan });
        break;
      case 'whine':
        this.tone(700, 0.35, { slideTo: 1100, gain: 0.12 * k, pan });
        this.tone(1100, 0.35, { slideTo: 760, gain: 0.12 * k, delay: 0.32, pan });
        break;
      case 'step':
        this.noise(0.07, { filter: 'lowpass', freq: 420, gain: 0.16 * k, pan });
        break;
      case 'jump':
        this.tone(300, 0.16, { type: 'triangle', slideTo: 640, gain: 0.2 * k, pan });
        break;
      case 'land':
        this.noise(0.1, { filter: 'lowpass', freq: 320, gain: 0.25 * k, pan });
        this.tone(120, 0.12, { slideTo: 60, gain: 0.25 * k, pan });
        break;
      case 'splash':
        this.noise(0.45, { filter: 'bandpass', freq: 1300, freqTo: 420, q: 0.7, gain: 0.32 * k, attack: 0.02, pan });
        break;
      case 'collect':
        this.tone(660, 0.1, { type: 'triangle', gain: 0.2 * k, pan });
        this.tone(990, 0.14, { type: 'triangle', gain: 0.2 * k, delay: 0.08, pan });
        break;
      case 'bone':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, { type: 'triangle', gain: 0.2 * k, delay: i * 0.07, pan }));
        break;
      case 'win':
        [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.28, { type: 'triangle', gain: 0.22 * k, delay: i * 0.1, pan }));
        break;
      case 'lose':
        this.tone(392, 0.6, { type: 'sawtooth', slideTo: 196, gain: 0.16 * k, pan });
        this.tone(330, 0.6, { type: 'sawtooth', slideTo: 165, gain: 0.14 * k, delay: 0.15, pan });
        break;
      case 'thunder':
        this.noise(1.7, { filter: 'lowpass', freq: 220, freqTo: 60, gain: 0.6 * k, attack: 0.03, pan });
        break;
      case 'hit':
        this.noise(0.12, { filter: 'lowpass', freq: 800, gain: 0.35 * k, pan });
        this.tone(150, 0.15, { type: 'square', slideTo: 60, gain: 0.18 * k, pan });
        break;
      case 'thud':
        this.tone(90, 0.2, { slideTo: 40, gain: 0.5 * k, pan });
        break;
      case 'pop':
        this.tone(500, 0.06, { slideTo: 900, gain: 0.2 * k, pan });
        break;
      case 'crate':
        this.noise(0.12, { filter: 'bandpass', freq: 500, gain: 0.3 * k, pan });
        this.tone(140, 0.1, { type: 'square', slideTo: 90, gain: 0.1 * k, pan });
        break;
      case 'honk':
        this.tone(220, 0.38, { type: 'sawtooth', gain: 0.22 * k, pan });
        this.tone(277, 0.38, { type: 'sawtooth', gain: 0.18 * k, pan });
        break;
      case 'whoosh':
        this.noise(0.35, { filter: 'bandpass', freq: 700, freqTo: 2200, q: 0.6, gain: 0.2 * k, attack: 0.12, pan });
        break;
      case 'boom':
        this.noise(0.9, { filter: 'lowpass', freq: 420, freqTo: 80, gain: 0.6 * k, attack: 0.01, pan });
        this.tone(80, 0.8, { slideTo: 30, gain: 0.55 * k, pan });
        break;
      case 'spray':
        this.noise(0.5, { filter: 'highpass', freq: 2500, gain: 0.12 * k, attack: 0.05, pan });
        break;
      case 'shake':
        this.noise(0.15, { filter: 'bandpass', freq: 1500, q: 1, gain: 0.15 * k, pan });
        break;
      case 'tick':
        this.tone(1800, 0.025, { type: 'square', gain: 0.07 * k, pan });
        break;
      case 'timpani':
        this.tone(110, 0.6, { slideTo: 70, gain: 0.55 * k, pan });
        this.noise(0.08, { filter: 'lowpass', freq: 220, gain: 0.3 * k, pan });
        break;
      case 'rustle':
        this.noise(0.28, { filter: 'bandpass', freq: 3000, q: 0.8, gain: 0.08 * k, attack: 0.1, pan });
        break;
      case 'snore':
        this.noise(1.2, { filter: 'lowpass', freq: 260, freqTo: 120, gain: 0.25 * k, attack: 0.5, pan });
        break;
      case 'sparkle':
        [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', gain: 0.08 * k, delay: i * 0.05, pan }));
        break;
      case 'bell':
        this.tone(880, 1, { gain: 0.2 * k, pan });
        this.tone(1760, 0.8, { gain: 0.08 * k, pan });
        break;
      case 'sonar':
        this.tone(1200, 0.5, { slideTo: 400, gain: 0.2 * k, pan });
        break;
      case 'beat':
        this.tone(150, 0.1, { slideTo: 90, gain: 0.3 * k, pan });
        break;
      case 'perfect':
        this.tone(1046, 0.12, { type: 'triangle', gain: 0.18 * k, pan });
        this.tone(1568, 0.14, { type: 'triangle', gain: 0.16 * k, delay: 0.05, pan });
        break;
    }
  }

  /* -------------------------------- muzyka -------------------------------- */

  music(track: MusicTrack | null): void {
    if (this.track === track) return;
    this.track = track;
    this.step = 0;
    this.bar = 0;
    if (!this.ctx || !this.musicBus) return;

    const bus = this.musicBus;
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(0, now, 0.08);
    this.stopScheduler();
    if (track === null) return;

    window.setTimeout(() => {
      if (!this.ctx || this.track !== track) return;
      this.startScheduler();
      bus.gain.cancelScheduledValues(this.ctx.currentTime);
      bus.gain.setTargetAtTime(this.musicVolume * 0.35, this.ctx.currentTime, 0.4);
    }, 350);
  }

  /** 0..1: zagęszcza melodię, dodaje perkusję i przyspiesza tempo (finał). */
  setMusicIntensity(value: number): void {
    this.intensity = Math.max(0, Math.min(1, value));
  }

  private startScheduler(): void {
    if (!this.ctx || this.timer !== null) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  private stopScheduler(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const ctx = this.ctx;
    const trackName = this.track;
    if (!ctx || !trackName) return;
    const def = TRACKS[trackName];
    const tempoScale = trackName === 'finale' ? 0.8 + this.intensity * 0.9 : 1;
    const stepDur = 60 / (def.bpm * tempoScale) / 2;

    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(def, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step += 1;
      if (this.step % 8 === 0) this.bar += 1;
    }
  }

  private voice(freq: number, t0: number, dur: number, type: OscillatorType, gain: number, lowpass: number, attack: number): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    if (!ctx || !bus) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.linearRampToValueAtTime(gain * 0.7, t0 + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filter);
    filter.connect(g);
    g.connect(bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private drum(kind: 'kick' | 'hat' | 'snare' | 'timpani', t0: number): void {
    const ctx = this.ctx;
    const bus = this.musicBus;
    const noise = this.noiseBuffer;
    if (!ctx || !bus || !noise) return;
    if (kind === 'kick' || kind === 'timpani') {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(kind === 'kick' ? 130 : 105, t0);
      osc.frequency.exponentialRampToValueAtTime(kind === 'kick' ? 45 : 65, t0 + 0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(kind === 'kick' ? 0.9 : 1.1, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'kick' ? 0.3 : 0.7));
      osc.connect(g);
      g.connect(bus);
      osc.start(t0);
      osc.stop(t0 + 0.8);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = kind === 'hat' ? 'highpass' : 'bandpass';
    filter.frequency.value = kind === 'hat' ? 7000 : 1800;
    const g = ctx.createGain();
    const len = kind === 'hat' ? 0.05 : 0.16;
    g.gain.setValueAtTime(kind === 'hat' ? 0.25 : 0.5, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(filter);
    filter.connect(g);
    g.connect(bus);
    src.start(t0, Math.random());
    src.stop(t0 + len + 0.05);
  }

  private playStep(def: TrackDef, step: number, t0: number, stepDur: number): void {
    const stepInBar = step % 8;
    const chordIndex = this.bar % def.chords.length;
    const chordRoot = def.root + def.chordRoots[chordIndex];
    const chord = def.chords[chordIndex];
    const barDur = stepDur * 8;

    if (stepInBar === 0) {
      chord.forEach((interval, i) => {
        const f = mtof(chordRoot + interval + 12);
        this.voice(f * 0.997, t0, barDur * 1.05, def.pad, 0.11, def.padLowpass, barDur * 0.25);
        if (i === 0) this.voice(f * 1.003, t0, barDur * 1.05, def.pad, 0.08, def.padLowpass, barDur * 0.25);
      });
    }

    if (stepInBar === 0 || stepInBar === 4) {
      this.voice(mtof(chordRoot - 12), t0, stepDur * 3.5, 'sine', 0.22, 500, 0.02);
    }

    const melodyChance = def.density * (0.35 + 0.9 * this.intensity);
    if (Math.random() < melodyChance && stepInBar !== 7) {
      const degree = def.scale[Math.floor(Math.random() * def.scale.length)];
      const note = def.root + degree + 12 * def.melodyOctave + 12;
      this.voice(mtof(note), t0, stepDur * (1 + Math.floor(Math.random() * 2)), 'triangle', 0.16, 3000, 0.01);
    }

    switch (def.drums) {
      case 'light':
        if (stepInBar === 0 || stepInBar === 4) this.drum('kick', t0);
        if (this.intensity > 0.5 && stepInBar % 2 === 1) this.drum('hat', t0);
        break;
      case 'groove':
        if (stepInBar === 0 || stepInBar === 3 || stepInBar === 4) this.drum('kick', t0);
        if (stepInBar === 2 || stepInBar === 6) this.drum('snare', t0);
        if (stepInBar % 2 === 1) this.drum('hat', t0);
        break;
      case 'timpani':
        if (stepInBar === 0 || (this.intensity > 0.45 && stepInBar === 4) || (this.intensity > 0.75 && stepInBar % 2 === 0)) this.drum('timpani', t0);
        break;
      default:
        break;
    }
  }
}
