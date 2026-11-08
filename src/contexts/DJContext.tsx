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

  // Scratch Acoustic Synthesizer Refs
  const scratchOscA = useRef<OscillatorNode | null>(null);
  const scratchFilterA = useRef<BiquadFilterNode | null>(null);
  const scratchGainA = useRef<GainNode | null>(null);

  const scratchOscB = useRef<OscillatorNode | null>(null);
  const scratchFilterB = useRef<BiquadFilterNode | null>(null);
  const scratchGainB = useRef<GainNode | null>(null);

  const isScratchingA = useRef(false);
  const wasPlayingBeforeScratchA = useRef(false);
  const isScratchingB = useRef(false);
  const wasPlayingBeforeScratchB = useRef(false);

  const isAudioSetup = useRef(false);
  const onTrackChangeListeners = useRef<Array<(track: Track) => void>>([]);
  const onDeckEndedListeners = useRef<Array<(deck: "A" | "B") => void>>([]);
  const lastDominantTrackId = useRef<number | string | null>(null);

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

      const gA = ctx.createGain();
      gainNodeA.current = gA;

      const cfA = ctx.createGain();
      cfA.gain.value = 1.0;
      crossfadeGainA.current = cfA;

      const anA = ctx.createAnalyser();
      anA.fftSize = 64;
      analyserA.current = anA;

      // Connect Deck A
      sourceA.connect(lowA);
      lowA.connect(midA);
      midA.connect(highA);
      highA.connect(filtA);
      filtA.connect(gA);
      gA.connect(cfA);
      cfA.connect(anA);
      anA.connect(ctx.destination);

      // Deck A Scratch Synthesizer Layer (Doppler + Needle Friction)
      const scOscA = ctx.createOscillator();
      scOscA.type = "sawtooth";
      scOscA.frequency.value = 220;
      scratchOscA.current = scOscA;

      const scFiltA = ctx.createBiquadFilter();
      scFiltA.type = "bandpass";
      scFiltA.frequency.value = 1100;
      scFiltA.Q.value = 3.5;
      scratchFilterA.current = scFiltA;

      const scGainA = ctx.createGain();
      scGainA.gain.value = 0;
      scratchGainA.current = scGainA;

      scOscA.connect(scFiltA);
      scFiltA.connect(scGainA);
      scGainA.connect(cfA);
      try { scOscA.start(); } catch (_) {}

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

      const gB = ctx.createGain();
      gainNodeB.current = gB;

      const cfB = ctx.createGain();
      cfB.gain.value = 0.0;
      crossfadeGainB.current = cfB;

      const anB = ctx.createAnalyser();
      anB.fftSize = 64;
      analyserB.current = anB;

      // Connect Deck B
      sourceB.connect(lowB);
      lowB.connect(midB);
      midB.connect(highB);
      highB.connect(filtB);
      filtB.connect(gB);
      gB.connect(cfB);
      cfB.connect(anB);
      anB.connect(ctx.destination);

      // Deck B Scratch Synthesizer Layer
      const scOscB = ctx.createOscillator();
      scOscB.type = "sawtooth";
      scOscB.frequency.value = 220;
      scratchOscB.current = scOscB;

      const scFiltB = ctx.createBiquadFilter();
      scFiltB.type = "bandpass";
      scFiltB.frequency.value = 1100;
      scFiltB.Q.value = 3.5;
      scratchFilterB.current = scFiltB;

      const scGainB = ctx.createGain();
      scGainB.gain.value = 0;
      scratchGainB.current = scGainB;

      scOscB.connect(scFiltB);
      scFiltB.connect(scGainB);
      scGainB.connect(cfB);
      try { scOscB.start(); } catch (_) {}

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

  // Scratch Interactions
  const startScratch = useCallback((deck: "A" | "B") => {
    setupWebAudio();
    resumeAudioContext();
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (!audioEl) return;

    if (deck === "A") {
      isScratchingA.current = true;
      wasPlayingBeforeScratchA.current = !audioEl.paused;
    } else {
      isScratchingB.current = true;
      wasPlayingBeforeScratchB.current = !audioEl.paused;
    }
  }, [setupWebAudio, resumeAudioContext]);

  const scratchMove = useCallback((deck: "A" | "B", velocity: number) => {
    resumeAudioContext();
    const audioEl = deck === "A" ? audioRefA.current : audioRefB.current;
    if (!audioEl) return;

    const ctx = audioContextRef.current;
    const now = ctx ? ctx.currentTime : 0;
    const scGain = deck === "A" ? scratchGainA.current : scratchGainB.current;
    const scFilt = deck === "A" ? scratchFilterA.current : scratchFilterB.current;
    const scOsc = deck === "A" ? scratchOscA.current : scratchOscB.current;

    const speed = Math.abs(velocity);

    // 1. Scrub through the song audio forward and backward in real time
    if (audioEl.duration && audioEl.duration > 0) {
      const stepSeconds = velocity * 0.18; // smooth scrub step
      const nextTime = Math.max(0, Math.min(audioEl.duration - 0.1, audioEl.currentTime + stepSeconds));
      audioEl.currentTime = nextTime;
    }

    // 2. Adjust playbackRate for forward acceleration vs backward scrub
    if (velocity > 0.05) {
      audioEl.playbackRate = Math.min(3.5, Math.max(0.3, speed * 1.5));
      if (audioEl.paused) audioEl.play().catch(() => {});
    } else if (velocity < -0.05) {
      audioEl.playbackRate = 0.05; // tiny forward rate while rewinding currentTime
    } else {
      audioEl.playbackRate = 0.01;
    }

    // 3. Modulate Scratch Acoustic Texture (Vinyl Doppler + Needle Grooves)
    if (ctx && scGain && scFilt && scOsc) {
      if (speed > 0.03) {
        const pitchFreq = Math.max(80, Math.min(1500, 180 + velocity * 420));
        const filterFreq = Math.max(400, Math.min(5800, 750 + speed * 2800));
        const gainVal = Math.min(0.85, speed * 0.5);

        scOsc.frequency.setTargetAtTime(pitchFreq, now, 0.008);
        scFilt.frequency.setTargetAtTime(filterFreq, now, 0.008);
        scGain.gain.setTargetAtTime(gainVal, now, 0.008);
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

    if (ctx && scGain) {
      scGain.gain.setTargetAtTime(0, now, 0.03);
    }

    const wasPlaying = deck === "A" ? wasPlayingBeforeScratchA.current : wasPlayingBeforeScratchB.current;
    const pitch = deck === "A" ? deckA.pitch : deckB.pitch;

    if (deck === "A") isScratchingA.current = false;
    else isScratchingB.current = false;

    if (audioEl) {
      audioEl.playbackRate = pitch;
      if (wasPlaying) {
        audioEl.play().catch(() => {});
        if (deck === "A") setDeckA(prev => ({ ...prev, isPlaying: true }));
        else setDeckB(prev => ({ ...prev, isPlaying: true }));
      }
    }
  }, [deckA.pitch, deckB.pitch]);

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
      setDeckA(prev => ({
        ...prev,
        track,
        isPlaying: autoPlay,
        currentTime: startTime,
        cuePoint: startTime
      }));
    } else {
      setDeckB(prev => ({
        ...prev,
        track,
        isPlaying: autoPlay,
        currentTime: startTime,
        cuePoint: startTime
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
