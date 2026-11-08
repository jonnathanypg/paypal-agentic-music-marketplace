"use client";

import React, { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from "react";
import type { Track } from "@/components/StreamPlayer";

export interface DeckState {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;        // 0 to 1
  gain: number;          // 0 to 2 (trim)
  pitch: number;         // 0.8 to 1.2 (playbackRate)
  eqLow: number;         // -24 to +12 dB
  eqMid: number;         // -24 to +12 dB
  eqHigh: number;        // -24 to +12 dB
  filter: number;        // -1 (Lowpass) to 0 (flat) to +1 (Highpass)
  loopActive: boolean;
  loopLength: number;    // beats or seconds
  loopStart: number;     // start timestamp in seconds
  loopEnd: number;       // end timestamp in seconds
  loopLabel: string | null; // e.g., "1/4", "1/2", "1/1", "2/2", "4/4", "8/8", "MANUAL"
  cuePoint: number;
}

export interface DJContextType {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  deckA: DeckState;
  deckB: DeckState;
  crossfader: number; // 0 = 100% Deck A, 0.5 = 50/50, 1 = 100% Deck B
  masterVolume: number;
  setMasterVolume: (vol: number) => void;
  masterFilter: number;
  activeFX: {
    delay: boolean;
    reverb: boolean;
    flanger: boolean;
  };
  loadTrackToDeck: (deck: "A" | "B", track: Track, autoPlay?: boolean, startTime?: number) => void;
  playDeck: (deck: "A" | "B") => void;
  pauseDeck: (deck: "A" | "B") => void;
  togglePlayDeck: (deck: "A" | "B") => void;
  seekDeck: (deck: "A" | "B", time: number) => void;
  setDeckVolume: (deck: "A" | "B", vol: number) => void;
  setDeckGain: (deck: "A" | "B", gain: number) => void;
  setDeckPitch: (deck: "A" | "B", pitch: number) => void;
  setDeckEQ: (deck: "A" | "B", band: "low" | "mid" | "high", val: number) => void;
  setDeckFilter: (deck: "A" | "B", val: number) => void;
  setCue: (deck: "A" | "B") => void;
  jumpToCue: (deck: "A" | "B") => void;
  setBeatLoop: (deck: "A" | "B", label: string, durationSec: number) => void;
  clearLoop: (deck: "A" | "B") => void;
  toggleReloop: (deck: "A" | "B") => void;
  setLoopIn: (deck: "A" | "B") => void;
  setLoopOut: (deck: "A" | "B") => void;
  halveLoop: (deck: "A" | "B") => void;
  doubleLoop: (deck: "A" | "B") => void;
  setCrossfader: (val: number) => void;
  smoothCrossfade: (target: number, durationSec?: number) => void;
  startScratch: (deck: "A" | "B") => void;
  scratchMove: (deck: "A" | "B", velocity: number) => void;
  stopScratch: (deck: "A" | "B") => void;
  toggleFX: (fx: "delay" | "reverb" | "flanger") => void;
  syncBPM: () => void;
  autoDJMix: (trackA?: Track, trackB?: Track) => void;
  registerOnTrackChangeListener: (listener: (track: Track) => void) => void;
  unregisterOnTrackChangeListener: (listener: (track: Track) => void) => void;
  registerOnDeckEndedListener: (listener: (deck: "A" | "B") => void) => void;
  unregisterOnDeckEndedListener: (listener: (deck: "A" | "B") => void) => void;
  smoothCloseDJ: (onCompleted?: () => void) => void;
  // Audio element refs for direct Web Audio binding
  audioRefA: React.RefObject<HTMLAudioElement | null>;
  audioRefB: React.RefObject<HTMLAudioElement | null>;
  audioContextRef: React.RefObject<AudioContext | null>;
  analyserA: React.RefObject<AnalyserNode | null>;
  analyserB: React.RefObject<AnalyserNode | null>;
}


const defaultDeckState = (track: Track | null = null): DeckState => ({
  track,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1.0,
  gain: 1.0,
  pitch: 1.0,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  filter: 0,
  loopActive: false,
  loopLength: 4,
  loopStart: 0,
  loopEnd: 0,
  loopLabel: null,
  cuePoint: 0,
});

const DJContext = createContext<DJContextType | null>(null);

export function DJProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [deckA, setDeckA] = useState<DeckState>(defaultDeckState());
  const [deckB, setDeckB] = useState<DeckState>(defaultDeckState());
  const [crossfader, setCrossfaderState] = useState<number>(0.5);
  const [masterVolume, setMasterVolumeState] = useState<number>(1.0);
  const [masterFilter, setMasterFilter] = useState<number>(0);
  const [activeFX, setActiveFX] = useState({ delay: false, reverb: false, flanger: false });

  const audioRefA = useRef<HTMLAudioElement | null>(null);
  const audioRefB = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserA = useRef<AnalyserNode | null>(null);
  const analyserB = useRef<AnalyserNode | null>(null);

  // Nodes refs for DSP
  const gainNodeA = useRef<GainNode | null>(null);
  const gainNodeB = useRef<GainNode | null>(null);
  const eqLowNodeA = useRef<BiquadFilterNode | null>(null);
  const eqMidNodeA = useRef<BiquadFilterNode | null>(null);
  const eqHighNodeA = useRef<BiquadFilterNode | null>(null);
  const filterNodeA = useRef<BiquadFilterNode | null>(null);

  const eqLowNodeB = useRef<BiquadFilterNode | null>(null);
  const eqMidNodeB = useRef<BiquadFilterNode | null>(null);
  const eqHighNodeB = useRef<BiquadFilterNode | null>(null);
  const filterNodeB = useRef<BiquadFilterNode | null>(null);

  const crossfadeGainA = useRef<GainNode | null>(null);
  const crossfadeGainB = useRef<GainNode | null>(null);
  const delayNode = useRef<DelayNode | null>(null);
  const delayFeedback = useRef<GainNode | null>(null);

  // Scratch Acoustic Engine Refs (Doppler Variable Delay + Vinyl Friction Noise Buffer)
  const scratchDelayNodeA = useRef<DelayNode | null>(null);
  const scratchNoiseSourceA = useRef<AudioBufferSourceNode | null>(null);
  const scratchFilterA = useRef<BiquadFilterNode | null>(null);
  const scratchGainA = useRef<GainNode | null>(null);

  const scratchDelayNodeB = useRef<DelayNode | null>(null);
  const scratchNoiseSourceB = useRef<AudioBufferSourceNode | null>(null);
  const scratchFilterB = useRef<BiquadFilterNode | null>(null);
  const scratchGainB = useRef<GainNode | null>(null);

  const isScratchingA = useRef(false);
  const wasPlayingBeforeScratchA = useRef(false);
  const scratchAnchorTimeA = useRef(0);
  const scratchDelayPosA = useRef(0.05);
  const lastScratchSeekTimeA = useRef(0);

  const isScratchingB = useRef(false);
  const wasPlayingBeforeScratchB = useRef(false);
  const scratchAnchorTimeB = useRef(0);
  const scratchDelayPosB = useRef(0.05);
  const lastScratchSeekTimeB = useRef(0);

  // Refs for high-precision Beat-Loop watcher (15ms resolution)
  const loopStateRefA = useRef<{ active: boolean; start: number; end: number }>({ active: false, start: 0, end: 0 });
  const loopStateRefB = useRef<{ active: boolean; start: number; end: number }>({ active: false, start: 0, end: 0 });

  const isAudioSetup = useRef(false);
  const onTrackChangeListeners = useRef<Array<(track: Track) => void>>([]);
  const onDeckEndedListeners = useRef<Array<(deck: "A" | "B") => void>>([]);
  const lastDominantTrackId = useRef<number | string | null>(null);

  // Create a realistic vinyl friction noise buffer (pink/brown noise + micro-crackle, no synth beep)
  const createVinylNoiseBuffer = (ctx: AudioContext) => {
    const bufferSize = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      // Periodic vinyl groove texture
      const grooveMod = 0.65 + 0.35 * Math.sin(i * 0.018);
      data[i] = ((b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04) * grooveMod;
      b6 = white * 0.115926;
    }
    return buffer;
  };

  // Initialize Web Audio graph
  const setupWebAudio = useCallback(() => {
    if (isAudioSetup.current || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;

      if (!audioRefA.current || !audioRefB.current) return;

      const sourceA = ctx.createMediaElementSource(audioRefA.current);
      const sourceB = ctx.createMediaElementSource(audioRefB.current);

      const vinylNoiseBuffer = createVinylNoiseBuffer(ctx);

      // Deck A EQ & Filter chain
      const lowA = ctx.createBiquadFilter();
      lowA.type = "lowshelf";
      lowA.frequency.value = 250;
      eqLowNodeA.current = lowA;

      const midA = ctx.createBiquadFilter();
      midA.type = "peaking";
      midA.frequency.value = 1000;
      midA.Q.value = 1.0;
      eqMidNodeA.current = midA;

      const highA = ctx.createBiquadFilter();
      highA.type = "highshelf";
      highA.frequency.value = 4000;
      eqHighNodeA.current = highA;

      const filtA = ctx.createBiquadFilter();
      filtA.type = "allpass";
      filterNodeA.current = filtA;

      // Inline Doppler Delay Node for Deck A (allows smooth forward/backward vinyl pitch-bending of real audio)
      const scDelayA = ctx.createDelay(0.6);
      scDelayA.delayTime.value = 0.05;
      scratchDelayNodeA.current = scDelayA;

      const gA = ctx.createGain();
      gainNodeA.current = gA;

      const cfA = ctx.createGain();
      cfA.gain.value = 1.0;
      crossfadeGainA.current = cfA;

      const anA = ctx.createAnalyser();
      anA.fftSize = 64;
      analyserA.current = anA;

      // Connect Deck A: source -> low -> mid -> high -> filt -> scDelay -> gain -> crossfader -> analyser -> destination
      sourceA.connect(lowA);
      lowA.connect(midA);
      midA.connect(highA);
      highA.connect(filtA);
      filtA.connect(scDelayA);
      scDelayA.connect(gA);
      gA.connect(cfA);
      cfA.connect(anA);
      anA.connect(ctx.destination);

      // Deck A Vinyl Friction Layer (Filtered Pink Noise - NO synthetic sawtooth oscillator)
      const noiseA = ctx.createBufferSource();
      noiseA.buffer = vinylNoiseBuffer;
      noiseA.loop = true;
      scratchNoiseSourceA.current = noiseA;

      const scFiltA = ctx.createBiquadFilter();
      scFiltA.type = "bandpass";
      scFiltA.frequency.value = 950;
      scFiltA.Q.value = 2.2;
      scratchFilterA.current = scFiltA;

      const scGainA = ctx.createGain();
      scGainA.gain.value = 0;
      scratchGainA.current = scGainA;

      noiseA.connect(scFiltA);
      scFiltA.connect(scGainA);
      scGainA.connect(cfA);
      try { noiseA.start(); } catch (_) {}

      // Deck B EQ & Filter chain
      const lowB = ctx.createBiquadFilter();
      lowB.type = "lowshelf";
      lowB.frequency.value = 250;
      eqLowNodeB.current = lowB;

      const midB = ctx.createBiquadFilter();
      midB.type = "peaking";
      midB.frequency.value = 1000;
      midB.Q.value = 1.0;
      eqMidNodeB.current = midB;

      const highB = ctx.createBiquadFilter();
      highB.type = "highshelf";
      highB.frequency.value = 4000;
      eqHighNodeB.current = highB;

      const filtB = ctx.createBiquadFilter();
      filtB.type = "allpass";
      filterNodeB.current = filtB;

      // Inline Doppler Delay Node for Deck B
      const scDelayB = ctx.createDelay(0.6);
      scDelayB.delayTime.value = 0.05;
      scratchDelayNodeB.current = scDelayB;

      const gB = ctx.createGain();
      gainNodeB.current = gB;

      const cfB = ctx.createGain();
      cfB.gain.value = 0.0;
      crossfadeGainB.current = cfB;

      const anB = ctx.createAnalyser();
      anB.fftSize = 64;
      analyserB.current = anB;

      // Connect Deck B: source -> low -> mid -> high -> filt -> scDelay -> gain -> crossfader -> analyser -> destination
      sourceB.connect(lowB);
      lowB.connect(midB);
      midB.connect(highB);
      highB.connect(filtB);
      filtB.connect(scDelayB);
      scDelayB.connect(gB);
      gB.connect(cfB);
      cfB.connect(anB);
      anB.connect(ctx.destination);

      // Deck B Vinyl Friction Layer (Filtered Pink Noise)
      const noiseB = ctx.createBufferSource();
      noiseB.buffer = vinylNoiseBuffer;
      noiseB.loop = true;
      scratchNoiseSourceB.current = noiseB;

      const scFiltB = ctx.createBiquadFilter();
      scFiltB.type = "bandpass";
      scFiltB.frequency.value = 950;
      scFiltB.Q.value = 2.2;
      scratchFilterB.current = scFiltB;

      const scGainB = ctx.createGain();
      scGainB.gain.value = 0;
      scratchGainB.current = scGainB;

      noiseB.connect(scFiltB);
      scFiltB.connect(scGainB);
      scGainB.connect(cfB);
      try { noiseB.start(); } catch (_) {}

      isAudioSetup.current = true;
    } catch (err) {
      console.warn("Web Audio API initialization deferred or failed:", err);
    }
  }, []);

  // Ensure AudioContext is resumed on user gesture
  const resumeAudioContext = useCallback(() => {
    if (audioContextRef.current && audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
  }, []);

  const registerOnTrackChangeListener = useCallback((listener: (track: Track) => void) => {
    if (!onTrackChangeListeners.current.includes(listener)) {
      onTrackChangeListeners.current.push(listener);
    }
  }, []);

  const unregisterOnTrackChangeListener = useCallback((listener: (track: Track) => void) => {
    onTrackChangeListeners.current = onTrackChangeListeners.current.filter(l => l !== listener);
  }, []);

  const registerOnDeckEndedListener = useCallback((listener: (deck: "A" | "B") => void) => {
    if (!onDeckEndedListeners.current.includes(listener)) {
      onDeckEndedListeners.current.push(listener);
    }
  }, []);

  const unregisterOnDeckEndedListener = useCallback((listener: (deck: "A" | "B") => void) => {
    onDeckEndedListeners.current = onDeckEndedListeners.current.filter(l => l !== listener);
  }, []);

  // Update Crossfader gains (Natural Equal-power curve: cos/sin with smooth de-zippering)
  const setCrossfader = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setCrossfaderState(clamped);

    // Natural Equal-power crossfade curve:
    // Left (0): Deck A = 100%, Deck B = 0%
    // Center (0.5): Deck A = 70.7%, Deck B = 70.7% (Sum of squares = 1.0, zero volume dip)
    // Right (1): Deck A = 0%, Deck B = 100%
    const gainA = Math.cos((clamped * Math.PI) / 2);
    const gainB = Math.sin((clamped * Math.PI) / 2);

    const ctx = audioContextRef.current;
    if (ctx && ctx.state === "running") {
      const now = ctx.currentTime;
      if (crossfadeGainA.current) {
        crossfadeGainA.current.gain.setTargetAtTime(gainA, now, 0.012);
      }
      if (crossfadeGainB.current) {
        crossfadeGainB.current.gain.setTargetAtTime(gainB, now, 0.012);
      }
    } else {
      if (crossfadeGainA.current) crossfadeGainA.current.gain.value = gainA;
      if (crossfadeGainB.current) crossfadeGainB.current.gain.value = gainB;
    }

    // Direct element volumes synchronized in real-time to guarantee 100% instant audible response
    if (audioRefA.current) {
      audioRefA.current.volume = Math.max(0, Math.min(1, gainA * deckA.volume));
    }
    if (audioRefB.current) {
      audioRefB.current.volume = Math.max(0, Math.min(1, gainB * deckB.volume));
    }

    // ── Auto-pausa en extremos (100% a un lado detiene el plato inactivo) ──
    if (clamped >= 0.999) {
      if (audioRefA.current && !audioRefA.current.paused) {
        audioRefA.current.pause();
        setDeckA(prev => ({ ...prev, isPlaying: false }));
      }
    } else if (clamped <= 0.001) {
      if (audioRefB.current && !audioRefB.current.paused) {
        audioRefB.current.pause();
        setDeckB(prev => ({ ...prev, isPlaying: false }));
      }
    }

    // ── Notificar cambio de pista dominante en tiempo real al reproductor integrado ──
    const dominantTrack = clamped > 0.5 ? deckB.track : deckA.track;
    if (dominantTrack && dominantTrack.id !== lastDominantTrackId.current) {
      lastDominantTrackId.current = dominantTrack.id;
      onTrackChangeListeners.current.forEach(listener => {
        try { listener(dominantTrack); } catch (_) {}
      });
    }
  }, [deckA.volume, deckB.volume, deckA.track, deckB.track]);

  // Smooth motorized crossfade
  const smoothCrossfade = useCallback((target: number, durationSec = 4) => {
    const startTime = performance.now();
    const startVal = crossfader;
    const diff = target - startVal;

    const step = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      const progress = Math.min(1, elapsed / durationSec);
      // Smooth ease-in-out curve
      const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const currentVal = startVal + diff * eased;
      setCrossfader(currentVal);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, [crossfader, setCrossfader]);

  // Scratch Interactions (Authentic Vinyl Doppler Delay + Pitch Bend + Filtered Vinyl Friction)
  const setAudioPreservesPitch = (audioEl: HTMLAudioElement, preserve: boolean) => {
    try {
      (audioEl as any).preservesPitch = preserve;
      (audioEl as any).mozPreservesPitch = preserve;
      (audioEl as any).webkitPreservesPitch = preserve;
    } catch (_) {}
  };

  const startScratch = useCallback((deck: "A" | "B") => {
    setupWebAudio();
    resumeAudioContext();
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (!audioEl) return;

    // Disable pitch preservation during scratch so speed changes bend pitch like a real vinyl record!
    setAudioPreservesPitch(audioEl, false);

    if (deck === "A") {
      isScratchingA.current = true;
      wasPlayingBeforeScratchA.current = !audioEl.paused;
      scratchAnchorTimeA.current = audioEl.currentTime;
      scratchDelayPosA.current = 0.05;
      lastScratchSeekTimeA.current = performance.now();
    } else {
      isScratchingB.current = true;
      wasPlayingBeforeScratchB.current = !audioEl.paused;
      scratchAnchorTimeB.current = audioEl.currentTime;
      scratchDelayPosB.current = 0.05;
      lastScratchSeekTimeB.current = performance.now();
    }

    // Ensure audio element is playing so the Web Audio DelayLine has live audio samples to bend
    if (audioEl.paused) {
      audioEl.play().catch(() => {});
    }
  }, [setupWebAudio, resumeAudioContext]);

  const scratchMove = useCallback((deck: "A" | "B", velocity: number) => {
    resumeAudioContext();
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (!audioEl) return;

    const ctx = audioContextRef.current;
    const now = ctx ? ctx.currentTime : 0;
    const scDelay = deck === "A" ? scratchDelayNodeA.current : scratchDelayNodeB.current;
    const scGain = deck === "A" ? scratchGainA.current : scratchGainB.current;
    const scFilt = deck === "A" ? scratchFilterA.current : scratchFilterB.current;
    const delayPosRef = deck === "A" ? scratchDelayPosA : scratchDelayPosB;
    const anchorRef = deck === "A" ? scratchAnchorTimeA : scratchAnchorTimeB;
    const lastSeekRef = deck === "A" ? lastScratchSeekTimeA : lastScratchSeekTimeB;

    const speed = Math.abs(velocity);

    // 1. Modulate Inline Doppler Delay Time for real-time forward & reverse vinyl pitch-bending of the song!
    // Decreasing delayTime = higher/forward pitch; Increasing delayTime = lower/reverse pitch
    if (ctx && scDelay) {
      const delayStep = -velocity * 0.014;
      let nextDelay = delayPosRef.current + delayStep;
      // Softly wrap delay buffer within [0.006s, 0.24s] so continuous rotation keeps bending smoothly
      if (nextDelay < 0.006) nextDelay = 0.14;
      if (nextDelay > 0.24) nextDelay = 0.05;
      delayPosRef.current = nextDelay;
      scDelay.delayTime.setTargetAtTime(nextDelay, now, 0.014);
    }

    // 2. Real Vinyl Pitch-Bend on the Audio Element (with preservesPitch = false)
    if (velocity > 0.04) {
      // Forward scratch: accelerate/decelerate actual music pitch
      const targetRate = Math.min(2.6, Math.max(0.28, 0.45 + speed * 1.15));
      audioEl.playbackRate = targetRate;
      if (audioEl.paused) audioEl.play().catch(() => {});
    } else if (velocity < -0.04) {
      // Reverse pull: low vinyl drag pitch while Doppler delay pulls backward
      const targetRate = Math.min(1.4, Math.max(0.25, 0.32 + speed * 0.65));
      audioEl.playbackRate = targetRate;
      if (audioEl.paused) audioEl.play().catch(() => {});
    } else {
      // Hand holding the platter still
      audioEl.playbackRate = 0.15;
    }

    // 3. Throttled Anchor Scrub (every ~140ms) so we never stutter the MP3 decoder on every mousemove frame
    if (audioEl.duration && audioEl.duration > 0) {
      anchorRef.current = Math.max(0, Math.min(audioEl.duration - 0.1, anchorRef.current + velocity * 0.035));
      const perfNow = performance.now();
      if (perfNow - lastSeekRef.current > 140) {
        lastSeekRef.current = perfNow;
        // Only seek if drifted significantly
        if (Math.abs(audioEl.currentTime - anchorRef.current) > 0.35) {
          audioEl.currentTime = anchorRef.current;
        }
      }
    }

    // 4. Subtle Vinyl Needle Friction Texture (Filtered Pink Noise, zero oscillator beep)
    if (ctx && scGain && scFilt) {
      if (speed > 0.04) {
        const filterFreq = Math.max(380, Math.min(3400, 650 + speed * 1350));
        const gainVal = Math.min(0.28, speed * 0.16);
        scFilt.frequency.setTargetAtTime(filterFreq, now, 0.012);
        scGain.gain.setTargetAtTime(gainVal, now, 0.012);
      } else {
        scGain.gain.setTargetAtTime(0, now, 0.02);
      }
    }
  }, [resumeAudioContext]);

  const stopScratch = useCallback((deck: "A" | "B") => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    const ctx = audioContextRef.current;
    const now = ctx ? ctx.currentTime : 0;
    const scGain = deck === "A" ? scratchGainA.current : scratchGainB.current;
    const scDelay = deck === "A" ? scratchDelayNodeA.current : scratchDelayNodeB.current;

    if (ctx && scGain) {
      scGain.gain.setTargetAtTime(0, now, 0.025);
    }
    if (ctx && scDelay) {
      scDelay.delayTime.setTargetAtTime(0.05, now, 0.04);
    }

    const wasPlaying = deck === "A" ? wasPlayingBeforeScratchA.current : wasPlayingBeforeScratchB.current;
    const pitch = deck === "A" ? deckA.pitch : deckB.pitch;

    if (deck === "A") isScratchingA.current = false;
    else isScratchingB.current = false;

    if (audioEl) {
      setAudioPreservesPitch(audioEl, true);
      audioEl.playbackRate = pitch;
      if (wasPlaying) {
        audioEl.play().catch(() => {});
        if (deck === "A") setDeckA(prev => ({ ...prev, isPlaying: true }));
        else setDeckB(prev => ({ ...prev, isPlaying: true }));
      } else {
        audioEl.pause();
        if (deck === "A") setDeckA(prev => ({ ...prev, isPlaying: false }));
        else setDeckB(prev => ({ ...prev, isPlaying: false }));
      }
    }
  }, [deckA.pitch, deckB.pitch]);

  // ── High-Precision Beat-Loop Watcher (15ms resolution for seamless 1/4, 1/2, 1/1, 2/2, 4/4, 8/8 loops) ──
  useEffect(() => {
    const interval = setInterval(() => {
      // Deck A Loop check
      const loopA = loopStateRefA.current;
      const elA = audioRefA.current;
      if (loopA.active && elA && !elA.paused && !isScratchingA.current && loopA.end > loopA.start + 0.05) {
        if (elA.currentTime >= loopA.end || elA.currentTime < loopA.start - 0.25) {
          elA.currentTime = loopA.start;
        }
      }
      // Deck B Loop check
      const loopB = loopStateRefB.current;
      const elB = audioRefB.current;
      if (loopB.active && elB && !elB.paused && !isScratchingB.current && loopB.end > loopB.start + 0.05) {
        if (elB.currentTime >= loopB.end || elB.currentTime < loopB.start - 0.25) {
          elB.currentTime = loopB.start;
        }
      }
    }, 15);
    return () => clearInterval(interval);
  }, []);

  // Activate or toggle a Beat-Loop pad ("1/4", "1/2", "1/1", "2/2", "4/4", "8/8")
  const setBeatLoop = useCallback((deck: "A" | "B", label: string, durationSec: number) => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (!audioEl) return;

    const currentDeck = deck === "A" ? deckA : deckB;
    // If clicking the already active loop pad, exit loop!
    if (currentDeck.loopActive && currentDeck.loopLabel === label) {
      if (deck === "A") {
        loopStateRefA.current = { ...loopStateRefA.current, active: false };
        setDeckA(prev => ({ ...prev, loopActive: false, loopLabel: null }));
      } else {
        loopStateRefB.current = { ...loopStateRefB.current, active: false };
        setDeckB(prev => ({ ...prev, loopActive: false, loopLabel: null }));
      }
      return;
    }

    // Scale loop duration by current deck pitch/tempo
    const scaledDuration = Math.max(0.12, durationSec / (currentDeck.pitch || 1));
    // If a loop is already active, keep its loopStart anchor so switching 4/4 -> 2/2 -> 1/2 -> 1/4 feels like a real Pioneer CDJ Loop Roll build-up!
    const startPos = currentDeck.loopActive ? currentDeck.loopStart : audioEl.currentTime;
    const maxDur = audioEl.duration && audioEl.duration > 0 ? audioEl.duration - 0.05 : startPos + scaledDuration;
    const endPos = Math.min(maxDur, startPos + scaledDuration);

    if (deck === "A") {
      loopStateRefA.current = { active: true, start: startPos, end: endPos };
      setDeckA(prev => ({
        ...prev,
        loopActive: true,
        loopLength: scaledDuration,
        loopStart: startPos,
        loopEnd: endPos,
        loopLabel: label,
      }));
    } else {
      loopStateRefB.current = { active: true, start: startPos, end: endPos };
      setDeckB(prev => ({
        ...prev,
        loopActive: true,
        loopLength: scaledDuration,
        loopStart: startPos,
        loopEnd: endPos,
        loopLabel: label,
      }));
    }

    if (audioEl.paused) {
      audioEl.play().catch(() => {});
      if (deck === "A") setDeckA(prev => ({ ...prev, isPlaying: true }));
      else setDeckB(prev => ({ ...prev, isPlaying: true }));
    }
  }, [deckA, deckB]);

  const clearLoop = useCallback((deck: "A" | "B") => {
    if (deck === "A") {
      loopStateRefA.current = { ...loopStateRefA.current, active: false };
      setDeckA(prev => ({ ...prev, loopActive: false, loopLabel: null }));
    } else {
      loopStateRefB.current = { ...loopStateRefB.current, active: false };
      setDeckB(prev => ({ ...prev, loopActive: false, loopLabel: null }));
    }
  }, []);

  const toggleReloop = useCallback((deck: "A" | "B") => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    const currentDeck = deck === "A" ? deckA : deckB;
    if (!audioEl) return;

    if (currentDeck.loopActive) {
      clearLoop(deck);
    } else if (currentDeck.loopEnd > currentDeck.loopStart + 0.08) {
      audioEl.currentTime = currentDeck.loopStart;
      if (deck === "A") {
        loopStateRefA.current = { active: true, start: currentDeck.loopStart, end: currentDeck.loopEnd };
        setDeckA(prev => ({ ...prev, loopActive: true, loopLabel: prev.loopLabel || "RELOOP" }));
      } else {
        loopStateRefB.current = { active: true, start: currentDeck.loopStart, end: currentDeck.loopEnd };
        setDeckB(prev => ({ ...prev, loopActive: true, loopLabel: prev.loopLabel || "RELOOP" }));
      }
    } else {
      // Default to 4/4 loop at current position
      setBeatLoop(deck, "4/4", 2.0);
    }
  }, [deckA, deckB, clearLoop, setBeatLoop]);

  const setLoopIn = useCallback((deck: "A" | "B") => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (!audioEl) return;
    const pos = audioEl.currentTime;
    if (deck === "A") {
      const nextEnd = deckA.loopEnd > pos + 0.1 ? deckA.loopEnd : pos + 2.0;
      loopStateRefA.current = { ...loopStateRefA.current, start: pos, end: nextEnd };
      setDeckA(prev => ({ ...prev, loopStart: pos, loopEnd: nextEnd }));
    } else {
      const nextEnd = deckB.loopEnd > pos + 0.1 ? deckB.loopEnd : pos + 2.0;
      loopStateRefB.current = { ...loopStateRefB.current, start: pos, end: nextEnd };
      setDeckB(prev => ({ ...prev, loopStart: pos, loopEnd: nextEnd }));
    }
  }, [deckA.loopEnd, deckB.loopEnd]);

  const setLoopOut = useCallback((deck: "A" | "B") => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (!audioEl) return;
    const pos = audioEl.currentTime;
    if (deck === "A") {
      const start = deckA.loopStart < pos - 0.1 ? deckA.loopStart : Math.max(0, pos - 2.0);
      loopStateRefA.current = { active: true, start, end: pos };
      audioEl.currentTime = start;
      setDeckA(prev => ({
        ...prev,
        loopStart: start,
        loopEnd: pos,
        loopLength: pos - start,
        loopActive: true,
        loopLabel: "MANUAL",
      }));
    } else {
      const start = deckB.loopStart < pos - 0.1 ? deckB.loopStart : Math.max(0, pos - 2.0);
      loopStateRefB.current = { active: true, start, end: pos };
      audioEl.currentTime = start;
      setDeckB(prev => ({
        ...prev,
        loopStart: start,
        loopEnd: pos,
        loopLength: pos - start,
        loopActive: true,
        loopLabel: "MANUAL",
      }));
    }
  }, [deckA.loopStart, deckB.loopStart]);

  const halveLoop = useCallback((deck: "A" | "B") => {
    const currentDeck = deck === "A" ? deckA : deckB;
    if (!currentDeck.loopActive) return;
    const currentLen = currentDeck.loopEnd - currentDeck.loopStart;
    const newLen = Math.max(0.12, currentLen / 2);
    const newEnd = currentDeck.loopStart + newLen;
    const labelMap: Record<string, string> = { "8/8": "4/4", "4/4": "2/2", "2/2": "1/1", "1/1": "1/2", "1/2": "1/4" };
    const nextLabel = (currentDeck.loopLabel && labelMap[currentDeck.loopLabel]) || "÷2";
    if (deck === "A") {
      loopStateRefA.current = { active: true, start: currentDeck.loopStart, end: newEnd };
      setDeckA(prev => ({ ...prev, loopEnd: newEnd, loopLength: newLen, loopLabel: nextLabel }));
    } else {
      loopStateRefB.current = { active: true, start: currentDeck.loopStart, end: newEnd };
      setDeckB(prev => ({ ...prev, loopEnd: newEnd, loopLength: newLen, loopLabel: nextLabel }));
    }
  }, [deckA, deckB]);

  const doubleLoop = useCallback((deck: "A" | "B") => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    const currentDeck = deck === "A" ? deckA : deckB;
    if (!currentDeck.loopActive) return;
    const currentLen = currentDeck.loopEnd - currentDeck.loopStart;
    const maxDur = audioEl?.duration || currentDeck.duration || 300;
    const newLen = Math.min(16, currentLen * 2);
    const newEnd = Math.min(maxDur - 0.05, currentDeck.loopStart + newLen);
    const labelMap: Record<string, string> = { "1/4": "1/2", "1/2": "1/1", "1/1": "2/2", "2/2": "4/4", "4/4": "8/8" };
    const nextLabel = (currentDeck.loopLabel && labelMap[currentDeck.loopLabel]) || "×2";
    if (deck === "A") {
      loopStateRefA.current = { active: true, start: currentDeck.loopStart, end: newEnd };
      setDeckA(prev => ({ ...prev, loopEnd: newEnd, loopLength: newLen, loopLabel: nextLabel }));
    } else {
      loopStateRefB.current = { active: true, start: currentDeck.loopStart, end: newEnd };
      setDeckB(prev => ({ ...prev, loopEnd: newEnd, loopLength: newLen, loopLabel: nextLabel }));
    }
  }, [deckA, deckB]);

  // Load track to Deck
  const loadTrackToDeck = useCallback((deck: "A" | "B", track: Track, autoPlay = false, startTime = 0) => {
    setupWebAudio();
    resumeAudioContext();
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;

    let trackUrl = track.file_path;
    if (trackUrl && !trackUrl.startsWith("http")) {
      if (trackUrl.includes("media_library/")) {
        trackUrl = trackUrl
          .substring(trackUrl.indexOf("media_library/"))
          .replace("media_library/", "/media-static/");
      } else {
        trackUrl = `/api/storage/download/${trackUrl.replace(/^\//, "")}`;
      }
    }

    if (deck === "A") {
      loopStateRefA.current = { active: false, start: 0, end: 0 };
      setDeckA(prev => ({
        ...prev,
        track,
        isPlaying: autoPlay,
        currentTime: startTime,
        cuePoint: startTime,
        loopActive: false,
        loopStart: 0,
        loopEnd: 0,
        loopLabel: null,
      }));
    } else {
      loopStateRefB.current = { active: false, start: 0, end: 0 };
      setDeckB(prev => ({
        ...prev,
        track,
        isPlaying: autoPlay,
        currentTime: startTime,
        cuePoint: startTime,
        loopActive: false,
        loopStart: 0,
        loopEnd: 0,
        loopLabel: null,
      }));
    }

    if (audioEl) {
      audioEl.src = trackUrl;
      audioEl.load();
      if (startTime > 0) {
        audioEl.currentTime = startTime;
      }
      if (autoPlay) {
        audioEl.play().catch(e => console.warn("Deck autoplay:", e));
      }
    }
  }, [setupWebAudio, resumeAudioContext]);


  // Play Deck
  const playDeck = useCallback((deck: "A" | "B") => {
    setupWebAudio();
    resumeAudioContext();
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (audioEl) {
      audioEl.play().catch(e => console.warn("Playback error:", e));
      if (deck === "A") setDeckA(prev => ({ ...prev, isPlaying: true }));
      else setDeckB(prev => ({ ...prev, isPlaying: true }));
    }
  }, [setupWebAudio, resumeAudioContext]);

  // Pause Deck
  const pauseDeck = useCallback((deck: "A" | "B") => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (audioEl) {
      audioEl.pause();
      if (deck === "A") setDeckA(prev => ({ ...prev, isPlaying: false }));
      else setDeckB(prev => ({ ...prev, isPlaying: false }));
    }
  }, []);

  // Toggle Play Deck
  const togglePlayDeck = useCallback((deck: "A" | "B") => {
    const isPlaying = deck === "A" ? deckA.isPlaying : deckB.isPlaying;
    if (isPlaying) pauseDeck(deck);
    else playDeck(deck);
  }, [deckA.isPlaying, deckB.isPlaying, playDeck, pauseDeck]);

  // Seek Deck
  const seekDeck = useCallback((deck: "A" | "B", time: number) => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (audioEl) {
      audioEl.currentTime = time;
      if (deck === "A") setDeckA(prev => ({ ...prev, currentTime: time }));
      else setDeckB(prev => ({ ...prev, currentTime: time }));
    }
  }, []);

  // Set Pitch / Tempo fader
  const setDeckPitch = useCallback((deck: "A" | "B", pitch: number) => {
    const clamped = Math.max(0.75, Math.min(1.25, pitch));
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (audioEl) audioEl.playbackRate = clamped;
    if (deck === "A") setDeckA(prev => ({ ...prev, pitch: clamped }));
    else setDeckB(prev => ({ ...prev, pitch: clamped }));
  }, []);

  // Set Deck EQ
  const setDeckEQ = useCallback((deck: "A" | "B", band: "low" | "mid" | "high", val: number) => {
    const clamped = Math.max(-24, Math.min(12, val));
    if (deck === "A") {
      setDeckA(prev => ({
        ...prev,
        [band === "low" ? "eqLow" : band === "mid" ? "eqMid" : "eqHigh"]: clamped
      }));
      if (band === "low" && eqLowNodeA.current) eqLowNodeA.current.gain.value = clamped;
      if (band === "mid" && eqMidNodeA.current) eqMidNodeA.current.gain.value = clamped;
      if (band === "high" && eqHighNodeA.current) eqHighNodeA.current.gain.value = clamped;
    } else {
      setDeckB(prev => ({
        ...prev,
        [band === "low" ? "eqLow" : band === "mid" ? "eqMid" : "eqHigh"]: clamped
      }));
      if (band === "low" && eqLowNodeB.current) eqLowNodeB.current.gain.value = clamped;
      if (band === "mid" && eqMidNodeB.current) eqMidNodeB.current.gain.value = clamped;
      if (band === "high" && eqHighNodeB.current) eqHighNodeB.current.gain.value = clamped;
    }
  }, []);

  // Set Deck Filter (-1 = Lowpass, 0 = Off, +1 = Highpass)
  const setDeckFilter = useCallback((deck: "A" | "B", val: number) => {
    const clamped = Math.max(-1, Math.min(1, val));
    const node = deck === "A" ? filterNodeA.current : filterNodeB.current;

    if (deck === "A") setDeckA(prev => ({ ...prev, filter: clamped }));
    else setDeckB(prev => ({ ...prev, filter: clamped }));

    if (node) {
      if (Math.abs(clamped) < 0.05) {
        node.type = "allpass";
      } else if (clamped < 0) {
        // Lowpass sweep from 20000Hz down to 200Hz
        node.type = "lowpass";
        const freq = 200 + (1 + clamped) * 19800;
        node.frequency.value = freq;
        node.Q.value = 1.5;
      } else {
        // Highpass sweep from 20Hz up to 8000Hz
        node.type = "highpass";
        const freq = 20 + clamped * 7980;
        node.frequency.value = freq;
        node.Q.value = 1.5;
      }
    }
  }, []);

  // Set Volume
  const setDeckVolume = useCallback((deck: "A" | "B", vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    if (deck === "A") {
      setDeckA(prev => ({ ...prev, volume: clamped }));
      if (gainNodeA.current) gainNodeA.current.gain.value = clamped;
    } else {
      setDeckB(prev => ({ ...prev, volume: clamped }));
      if (gainNodeB.current) gainNodeB.current.gain.value = clamped;
    }
  }, []);

  // Set Master Volume
  const setMasterVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setMasterVolumeState(clamped);
    // Apply master volume to both deck gains
    if (gainNodeA.current) gainNodeA.current.gain.value = deckA.volume * clamped;
    if (gainNodeB.current) gainNodeB.current.gain.value = deckB.volume * clamped;
  }, [deckA.volume, deckB.volume]);

  // Set Gain (Trim)
  const setDeckGain = useCallback((deck: "A" | "B", gain: number) => {
    const clamped = Math.max(0, Math.min(2, gain));
    if (deck === "A") setDeckA(prev => ({ ...prev, gain: clamped }));
    else setDeckB(prev => ({ ...prev, gain: clamped }));
  }, []);

  // CUE controls
  const setCue = useCallback((deck: "A" | "B") => {
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (audioEl) {
      const pos = audioEl.currentTime;
      if (deck === "A") setDeckA(prev => ({ ...prev, cuePoint: pos }));
      else setDeckB(prev => ({ ...prev, cuePoint: pos }));
    }
  }, []);

  const jumpToCue = useCallback((deck: "A" | "B") => {
    const targetCue = deck === "A" ? deckA.cuePoint : deckB.cuePoint;
    seekDeck(deck, targetCue);
    pauseDeck(deck);
  }, [deckA.cuePoint, deckB.cuePoint, seekDeck, pauseDeck]);

  // Toggle FX
  const toggleFX = useCallback((fx: "delay" | "reverb" | "flanger") => {
    setActiveFX(prev => ({ ...prev, [fx]: !prev[fx] }));
  }, []);

  // Sync BPM between decks
  const syncBPM = useCallback(() => {
    // Simple sync: match Deck B pitch to Deck A pitch
    setDeckPitch("B", deckA.pitch);
  }, [deckA.pitch, setDeckPitch]);

  // Auto-DJ Mix routine
  const autoDJMix = useCallback((trackA?: Track, trackB?: Track) => {
    if (trackA) loadTrackToDeck("A", trackA);
    if (trackB) loadTrackToDeck("B", trackB);

    // Start on Deck A
    setCrossfader(0);
    playDeck("A");

    // Schedule automated blend to Deck B after 15 seconds
    setTimeout(() => {
      playDeck("B");
      smoothCrossfade(1, 6);
    }, 15000);
  }, [loadTrackToDeck, playDeck, setCrossfader, smoothCrossfade]);

  // Smooth close DJ Studio: smoothly slide to 100% on dominant deck (>50%), pause the non-dominant deck, and callback
  const smoothCloseDJ = useCallback((onCompleted?: () => void) => {
    const target = crossfader > 0.5 ? 1 : 0;
    const diff = Math.abs(target - crossfader);
    if (diff < 0.02) {
      if (target === 1) {
        pauseDeck("A");
      } else {
        pauseDeck("B");
      }
      onCompleted?.();
      return;
    }

    const durationSec = 1.2;
    const startTime = performance.now();
    const startVal = crossfader;
    const totalDiff = target - startVal;

    const step = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      const progress = Math.min(1, elapsed / durationSec);
      const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
      const currentVal = startVal + totalDiff * eased;
      setCrossfader(currentVal);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        setCrossfader(target);
        if (target === 1) {
          pauseDeck("A");
        } else {
          pauseDeck("B");
        }
        onCompleted?.();
      }
    };
    requestAnimationFrame(step);
  }, [crossfader, pauseDeck, setCrossfader]);

  return (
    <DJContext.Provider
      value={{
        isOpen,
        setIsOpen,
        deckA,
        deckB,
        crossfader,
        masterVolume,
        setMasterVolume,
        masterFilter,
        activeFX,
        loadTrackToDeck,
        playDeck,
        pauseDeck,
        togglePlayDeck,
        seekDeck,
        setDeckVolume,
        setDeckGain,
        setDeckPitch,
        setDeckEQ,
        setDeckFilter,
        setCue,
        jumpToCue,
        setBeatLoop,
        clearLoop,
        toggleReloop,
        setLoopIn,
        setLoopOut,
        halveLoop,
        doubleLoop,
        setCrossfader,
        smoothCrossfade,
        startScratch,
        scratchMove,
        stopScratch,
        toggleFX,
        registerOnTrackChangeListener,
        unregisterOnTrackChangeListener,
        registerOnDeckEndedListener,
        unregisterOnDeckEndedListener,
        smoothCloseDJ,
        syncBPM,
        autoDJMix,
        audioRefA,
        audioRefB,
        audioContextRef,
        analyserA,
        analyserB,
      }}
    >
      {/* Hidden audio elements for Deck A and Deck B */}
      <audio
        ref={audioRefA}
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (audioRefA.current) {
            setDeckA(prev => ({
              ...prev,
              currentTime: audioRefA.current?.currentTime || 0,
              duration: audioRefA.current?.duration || prev.duration,
            }));
          }
        }}
        onEnded={() => {
          setDeckA(prev => ({ ...prev, isPlaying: false }));
          onDeckEndedListeners.current.forEach(l => {
            try { l("A"); } catch (_) {}
          });
        }}
      />
      <audio
        ref={audioRefB}
        crossOrigin="anonymous"
        onTimeUpdate={() => {
          if (audioRefB.current) {
            setDeckB(prev => ({
              ...prev,
              currentTime: audioRefB.current?.currentTime || 0,
              duration: audioRefB.current?.duration || prev.duration,
            }));
          }
        }}
        onEnded={() => {
          setDeckB(prev => ({ ...prev, isPlaying: false }));
          onDeckEndedListeners.current.forEach(l => {
            try { l("B"); } catch (_) {}
          });
        }}
      />
      {children}
    </DJContext.Provider>
  );
}

export function useDJ() {
  const context = useContext(DJContext);
  if (!context) {
    throw new Error("useDJ must be used within a DJProvider");
  }
  return context;
}
