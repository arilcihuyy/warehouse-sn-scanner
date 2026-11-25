/** Tiny Web Audio feedback layer: no audio files, no autoplay surprises. */
export class FeedbackAudio {
  constructor() {
    this.context = null;
    this.master = null;
  }

  unlock() {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    if (!this.context) {
      this.context = new AudioCtor();
      this.master = this.context.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.context.destination);
      // iOS sometimes needs a silent source before it will run.
      try {
        const buffer = this.context.createBuffer(1, 1, 22050);
        const source = this.context.createBufferSource();
        source.buffer = buffer;
        source.connect(this.context.destination);
        source.start(0);
      } catch {
        /* ignore */
      }
    }
    if (this.context.state === 'suspended') {
      this.context.resume().catch(() => {});
    }
  }

  tone(frequency, delay, duration, volume = 0.2, type = 'sine') {
    if (!this.context || this.context.state !== 'running' || !this.master) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  success() {
    this.tone(880, 0, 0.09, 0.22);
    this.tone(1320, 0.09, 0.13, 0.18);
  }

  duplicate() {
    this.tone(620, 0, 0.07, 0.12);
    this.tone(520, 0.12, 0.09, 0.1);
  }

  complete() {
    this.tone(784, 0, 0.1, 0.16);
    this.tone(1046, 0.1, 0.1, 0.16);
    this.tone(1318, 0.2, 0.2, 0.14);
  }

  tap() {
    this.tone(440, 0, 0.04, 0.05, 'triangle');
  }
}
