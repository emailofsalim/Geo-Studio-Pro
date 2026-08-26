// Web Audio API Synthesizer for Survey Proximity Alarms
// 100% offline, zero external audio asset dependencies

export type ProximitySoundProfile = 'subtle-ping' | 'surveyor-beep' | 'major-triad' | 'sonar-pulse' | 'geiger-click';

class ProximityAudioEngine {
  private ctx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playProximityChime(profile: ProximitySoundProfile = 'subtle-ping', volume = 0.6) {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      const safeVol = Math.max(0.01, Math.min(1.0, volume));
      masterGain.gain.setValueAtTime(safeVol, now);
      masterGain.connect(ctx.destination);

      if (profile === 'subtle-ping') {
        // Subtle dual harmonic sine chime (A5: 880Hz, E6: 1320Hz)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(880, now);
        osc2.frequency.setValueAtTime(1320, now);

        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.45, now + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

        osc1.connect(gain1);
        osc2.connect(gain1);
        gain1.connect(masterGain);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.4);
        osc2.stop(now + 0.4);
      } else if (profile === 'surveyor-beep') {
        // Total Station surveyor double beep (C6: 1046.5Hz, E6: 1318.5Hz)
        [0, 0.11].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(idx === 0 ? 1046.5 : 1318.5, now + offset);
          g.gain.setValueAtTime(0, now + offset);
          g.gain.linearRampToValueAtTime(0.4, now + offset + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.09);
          osc.connect(g);
          g.connect(masterGain);
          osc.start(now + offset);
          osc.stop(now + offset + 0.1);
        });
      } else if (profile === 'major-triad') {
        // Melodic arrival chime C5 -> E5 -> G5 -> C6
        const notes = [523.25, 659.25, 783.99, 1046.50];
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          const noteTime = now + idx * 0.075;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, noteTime);
          g.gain.setValueAtTime(0, noteTime);
          g.gain.linearRampToValueAtTime(0.35, noteTime + 0.015);
          g.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);
          osc.connect(g);
          g.connect(masterGain);
          osc.start(noteTime);
          osc.stop(noteTime + 0.36);
        });
      } else if (profile === 'sonar-pulse') {
        // Deep resonant sonar pulse
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1180, now);
        osc.frequency.exponentialRampToValueAtTime(580, now + 0.42);
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.45, now + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
        osc.connect(g);
        g.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (profile === 'geiger-click') {
        // Rapid field geiger click burst
        [0, 0.04, 0.08].forEach((offset) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(2200, now + offset);
          g.gain.setValueAtTime(0.3, now + offset);
          g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.025);
          osc.connect(g);
          g.connect(masterGain);
          osc.start(now + offset);
          osc.stop(now + offset + 0.03);
        });
      }
    } catch (e) {
      console.warn('Web Audio playback error:', e);
    }
  }

  triggerHaptic(pattern: number[] = [120, 60, 120]) {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch {}
    }
  }
}

export const proximityAudio = new ProximityAudioEngine();
