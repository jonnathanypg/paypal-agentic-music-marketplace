// SceneMixer v5.0 — Motor mezclador profesional tipo OBS en el navegador con soporte de:
// 1. Transformación libre por capa con handles interactivos (redimensionar y arrastrar fijos).
// 2. Geometrías: rectángulo, círculo, cuadrado, esquinas redondeadas y formato vertical (9:16).
// 3. Persistencia independiente de encuadres para Horizontal (16:9) y Vertical (9:16).
// 4. Modo espejo horizontal.
// 5. LUTs / Filtros cinematográficos profesionales (Cinematic Warm, Teal & Orange, Noir B&W, Cyberpunk, Crisp Studio).
// 6. Motor Chroma Key (pantalla verde/azul) en tiempo real por pixel con tolerancia, suavizado y spill reduction.
// 7. Modos de desenfoque de fondo (Blur) y sustitución de fondo.
// 8. Audio multicanal WebAudio API.

export type LiveLayout =
  | "custom"
  | "fullscreen"
  | "pip"
  | "split2"
  | "interview"
  | "screen-cam"
  | "grid4"
  | "vertical-split"
  | "vertical-stack";

export type AspectMode = "horizontal" | "vertical";
export type LayerShape = "rect" | "circle" | "square" | "rounded" | "vertical";
export type ColorFilter = "none" | "cinematic" | "teal_orange" | "studio_crisp" | "noir" | "cyberpunk";

export interface ChromaConfig {
  enabled: boolean;
  color: "green" | "blue" | "custom";
  customHex?: string;
  similarity: number; // 0..1 (default: 0.35)
  smoothness: number; // 0..1 (default: 0.1)
  spill: number;      // 0..1 (default: 0.2)
}

export interface LayerTransform {
  sourceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible?: boolean;          // Visibilidad de la capa en escena (ojo OBS)
  fit: "cover" | "contain";
  shape: LayerShape;
  mirror: boolean;            // Modo espejo horizontal
  rotation?: 0 | 90 | 180 | 270; // Rotación en grados para enderezar cámaras móviles si el navegador omite cabeceras RTP
  borderRadius?: number;      // Radio de redondeo
  borderColor?: string;       // Color de borde cosmético
  borderWidth?: number;       // Ancho del borde cosmético
  filter: ColorFilter;        // LUT cinematográfico
  chroma: ChromaConfig;       // Chroma Key
  backgroundBlur: number;     // Desenfoque de fondo en px (0 = desactivado, 1..24 = blur)
  label?: string;
}

export type ResizeHandle = "nw" | "ne" | "se" | "sw" | "n" | "s" | "e" | "w";

export class SceneMixer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private videos = new Map<string, HTMLVideoElement>();
  private audioCtx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private gains = new Map<string, GainNode>();
  private analysers = new Map<string, AnalyserNode>();
  private delays = new Map<string, DelayNode>();

  // Canvas auxiliar offscreen para procesamiento de chroma key por píxel
  private offCanvas: HTMLCanvasElement | null = null;
  private offCtx: CanvasRenderingContext2D | null = null;

  // MediaPipe SelfieSegmentation para detección y recorte exacto de persona por IA
  private selfieSegmentation: any = null;
  private segmentationMasks = new Map<string, HTMLCanvasElement>();
  private segmentationRunning = false;
  private lastSegmentationTime = 0;

  slots: string[] = [];
  layout: LiveLayout = "fullscreen";
  aspectMode: AspectMode = "horizontal";
  bannerText: string = "";
  showLowerThird: boolean = false;

  // Persistencia de capas separada para horizontal y vertical (evita sobreescritura)
  private layersByAspect: Record<AspectMode, LayerTransform[]> = {
    horizontal: [],
    vertical: [],
  };

  selectedLayerId: string | null = null;
  private fade = 1;
  private streams = new Map<string, MediaStream>();

  constructor(canvas: HTMLCanvasElement, aspect: AspectMode = "horizontal") {
    this.canvas = canvas;
    this.aspectMode = aspect;
    this.updateCanvasResolution();
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D no disponible");
    this.ctx = ctx;

    if (typeof window !== "undefined") {
      this.offCanvas = document.createElement("canvas");
      this.offCtx = this.offCanvas.getContext("2d", { willReadFrequently: true });
    }
  }

  get layers(): LayerTransform[] {
    return this.layersByAspect[this.aspectMode];
  }

  set layers(val: LayerTransform[]) {
    this.layersByAspect[this.aspectMode] = val;
  }

  exportLayersState(): Record<AspectMode, LayerTransform[]> {
    return {
      horizontal: [...this.layersByAspect.horizontal],
      vertical: [...this.layersByAspect.vertical],
    };
  }

  importLayersState(state?: Partial<Record<AspectMode, LayerTransform[]>>) {
    if (!state) return;
    if (Array.isArray(state.horizontal)) {
      this.layersByAspect.horizontal = state.horizontal;
    }
    if (Array.isArray(state.vertical)) {
      this.layersByAspect.vertical = state.vertical;
    }
  }

  setAspectMode(mode: AspectMode) {
    if (this.aspectMode === mode) return;
    this.aspectMode = mode;
    this.updateCanvasResolution();

    // Si para este modo de aspecto aún no se han calculado capas, calcularlas
    if (this.layersByAspect[mode].length === 0 && this.slots.length > 0) {
      this.recomputeLayers();
    }
  }

  private updateCanvasResolution() {
    if (this.aspectMode === "vertical") {
      this.canvas.width = 1080;
      this.canvas.height = 1920;
    } else {
      this.canvas.width = 1920;
      this.canvas.height = 1080;
    }
  }

  private ensureAudio() {
    if (this.audioCtx) return;
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AC();
    this.master = this.audioCtx.createGain();
    this.master.gain.value = 1;
    this.dest = this.audioCtx.createMediaStreamDestination();
    this.master.connect(this.dest);
  }

  attachVideo(id: string, stream: MediaStream) {
    this.streams.set(id, stream);
    const hasVideo = stream.getVideoTracks().length > 0;

    if (hasVideo) {
      let el = this.videos.get(id);
      if (!el) {
        el = document.createElement("video");
        el.muted = true;
        el.playsInline = true;
        el.autoplay = true;
        // Chrome puede no decodificar vídeo WebRTC en <video> desconectados del DOM -> pantalla negra.
        el.setAttribute("playsinline", "");
        el.style.cssText = "position:fixed;left:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:-1";
        document.body.appendChild(el);
        this.videos.set(id, el);
      }
      el.srcObject = stream;
      el.play().catch(() => {});

      // Escuchar cuando lleguen nuevos tracks dinámicamente al stream (útil para WebRTC WHEP)
      stream.onaddtrack = () => {
        if (el) {
          el.srcObject = stream;
          el.play().catch(() => {});
        }
        this.recomputeLayers();
      };
      el.onloadedmetadata = () => {
        el?.play().catch(() => {});
        this.fitLayerToNativeVideo(id);
      };
      el.onresize = () => {
        this.fitLayerToNativeVideo(id);
      };

      // Watchdog: si tras 2.5s no hay frames, reasignar el stream y reintentar la reproducción
      let tries = 0;
      const wd = setInterval(() => {
        const v = this.videos.get(id);
        if (!v || v !== el || tries++ > 8) return clearInterval(wd);
        if (v.videoWidth > 0 && v.readyState >= 2) return clearInterval(wd);
        if (stream.getVideoTracks().length > 0) {
          v.srcObject = null;
          v.srcObject = stream;
          v.play().catch(() => {});
        }
      }, 2500);
    } else {
      // Si el stream llega inicialmente solo con audio pero después agrega pista de video (WHEP)
      stream.onaddtrack = (ev) => {
        if (ev.track.kind === "video") {
          this.attachVideo(id, stream);
        }
      };
    }

    // Audio
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0 && !this.analysers.has(id)) {
      this.ensureAudio();
      try {
        const ctx = this.audioCtx!;
        const src = ctx.createMediaStreamSource(stream);
        const delay = ctx.createDelay(3.0); // Soporta hasta 3000ms de buffer de desfase
        delay.delayTime.value = 0;
        const g = ctx.createGain();
        const an = ctx.createAnalyser();
        an.fftSize = 256;

        // Cadena de audio: Fuente -> Delay -> Gain -> Analyser -> Master
        src.connect(delay);
        delay.connect(g);
        g.connect(an);
        an.connect(this.master!);

        this.delays.set(id, delay);
        this.gains.set(id, g);
        this.analysers.set(id, an);
      } catch {}
    }

    // Solo agregar como capa visual en el lienzo si realmente contiene pista de video
    if (hasVideo && !this.slots.includes(id)) {
      this.slots.push(id);
      this.recomputeLayers();
    }
  }

  detach(id: string) {
    // 1. Detener activamente todos los tracks de hardware para apagar la luz de la cámara/mic
    const st = this.streams.get(id);
    if (st) {
      st.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.streams.delete(id);
    }

    const el = this.videos.get(id);
    if (el) {
      if (el.srcObject) {
        const ms = el.srcObject as MediaStream;
        if (ms.getTracks) {
          ms.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
        }
      }
      el.srcObject = null;
      try { el.remove(); } catch {}
      this.videos.delete(id);
    }
    this.gains.delete(id);
    this.analysers.delete(id);
    this.delays.delete(id);
    this.slots = this.slots.filter((s) => s !== id);
    this.layersByAspect.horizontal = this.layersByAspect.horizontal.filter((l) => l.sourceId !== id);
    this.layersByAspect.vertical = this.layersByAspect.vertical.filter((l) => l.sourceId !== id);
    if (this.selectedLayerId === id) this.selectedLayerId = null;
  }

  setScene(layout: LiveLayout, slots: string[], resetGeometry = false) {
    this.layout = layout;
    this.slots = slots;
    this.recomputeLayers(resetGeometry);
  }

  private getDefaultLayerProps() {
    return {
      visible: true,
      shape: "rect" as LayerShape,
      mirror: false,
      rotation: 0 as 0 | 90 | 180 | 270,
      borderRadius: 16,
      borderColor: "#3b82f6",
      borderWidth: 0,
      filter: "none" as ColorFilter,
      backgroundBlur: 0,
      chroma: {
        enabled: false,
        color: "green" as const,
        similarity: 0.35,
        smoothness: 0.08,
        spill: 0.25,
      },
    };
  }

  recomputeLayers(resetGeometry = false) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    // Ignorar fuentes de solo audio (ej. mic-*) para que nunca generen un cuadro visual en el canvas
    const active = this.slots.filter((id) => {
      if (!id || id.startsWith("mic-")) return false;
      const st = this.streams.get(id);
      if (st && st.getVideoTracks().length === 0 && !id.startsWith("remote-")) return false;
      return true;
    });

    if (active.length === 0) {
      this.layers = [];
      return;
    }

    const [a, b, c, d] = active;
    const newLayers: LayerTransform[] = [];
    const defaultProps = this.getDefaultLayerProps();

    if (this.aspectMode === "vertical") {
      switch (this.layout) {
        case "fullscreen":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W, height: H, zIndex: 1, fit: "cover", ...defaultProps });
          active.slice(1).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: Math.max(40, W - 400 - idx * 30),
              y: Math.max(40, H - 560 - idx * 30),
              width: 360,
              height: 480,
              zIndex: idx + 2,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 24,
              borderWidth: 4,
            });
          });
          break;
        case "split2":
        case "vertical-split":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W, height: H / 2 - 2, zIndex: 1, fit: "cover", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: 0, y: H / 2 + 2, width: W, height: H / 2 - 2, zIndex: 2, fit: "cover", ...defaultProps });
          active.slice(2).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: W - 380 - idx * 30,
              y: H / 2 - 220 + idx * 30,
              width: 340,
              height: 440,
              zIndex: idx + 3,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 24,
              borderWidth: 4,
            });
          });
          break;
        case "interview":
        case "vertical-stack":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W, height: H * 0.58, zIndex: 1, fit: "cover", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: 0, y: H * 0.58 + 4, width: W / 2 - 2, height: H * 0.42 - 4, zIndex: 2, fit: "cover", ...defaultProps });
          if (c) newLayers.push({ sourceId: c, x: W / 2 + 2, y: H * 0.58 + 4, width: W / 2 - 2, height: H * 0.42 - 4, zIndex: 3, fit: "cover", ...defaultProps });
          active.slice(3).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: W / 2 - 180 + idx * 25,
              y: H * 0.58 - 200 + idx * 25,
              width: 360,
              height: 360,
              zIndex: idx + 4,
              fit: "cover",
              ...defaultProps,
              shape: "circle",
              borderWidth: 4,
            });
          });
          break;
        case "screen-cam":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 120, width: W, height: H * 0.52, zIndex: 1, fit: "contain", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: 40, y: H - 540, width: W - 80, height: 480, zIndex: 2, fit: "cover", ...defaultProps, shape: "rounded", borderRadius: 28 });
          active.slice(2).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: W - 380 - idx * 30,
              y: 140 + idx * 30,
              width: 340,
              height: 440,
              zIndex: idx + 3,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 24,
              borderWidth: 4,
            });
          });
          break;
        case "grid4":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W, height: H / 4 - 2, zIndex: 1, fit: "cover", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: 0, y: H * 0.25 + 2, width: W, height: H / 4 - 2, zIndex: 2, fit: "cover", ...defaultProps });
          if (c) newLayers.push({ sourceId: c, x: 0, y: H * 0.5 + 2, width: W, height: H / 4 - 2, zIndex: 3, fit: "cover", ...defaultProps });
          if (d) newLayers.push({ sourceId: d, x: 0, y: H * 0.75 + 2, width: W, height: H / 4 - 2, zIndex: 4, fit: "cover", ...defaultProps });
          active.slice(4).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: W - 380 - idx * 30,
              y: H - 500 - idx * 30,
              width: 340,
              height: 440,
              zIndex: idx + 5,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 24,
              borderWidth: 4,
            });
          });
          break;
        default: // pip vertical
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W, height: H, zIndex: 1, fit: "cover", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: W - 420, y: H - 560, width: 380, height: 500, zIndex: 2, fit: "cover", ...defaultProps, shape: "rounded", borderRadius: 24, borderWidth: 4 });
          active.slice(2).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: 40 + idx * 30,
              y: H - 560 - idx * 30,
              width: 360,
              height: 480,
              zIndex: idx + 3,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 24,
              borderWidth: 4,
            });
          });
          break;
      }
    } else {
      switch (this.layout) {
        case "fullscreen":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W, height: H, zIndex: 1, fit: "cover", ...defaultProps });
          // Cualquier fuente adicional en la escena se renderiza como capa superpuesta tipo OBS
          active.slice(1).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: Math.max(40, W - 520 - idx * 40),
              y: Math.max(40, H - 360 - idx * 40),
              width: 480,
              height: 320,
              zIndex: idx + 2,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 20,
              borderWidth: 4,
            });
          });
          break;
        case "pip":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W, height: H, zIndex: 1, fit: "cover", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: W - 520, y: H - 340, width: 480, height: 300, zIndex: 2, fit: "cover", ...defaultProps, shape: "circle", borderWidth: 4 });
          active.slice(2).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: 40 + idx * 40,
              y: H - 340 - idx * 40,
              width: 440,
              height: 280,
              zIndex: idx + 3,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 20,
              borderWidth: 4,
            });
          });
          break;
        case "split2":
        case "vertical-split":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W / 2 - 2, height: H, zIndex: 1, fit: "cover", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: W / 2 + 2, y: 0, width: W / 2 - 2, height: H, zIndex: 2, fit: "cover", ...defaultProps });
          active.slice(2).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: W / 2 - 240 + idx * 40,
              y: H - 340 - idx * 40,
              width: 480,
              height: 300,
              zIndex: idx + 3,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 20,
              borderWidth: 4,
            });
          });
          break;
        case "interview":
        case "vertical-stack":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W / 2 - 2, height: H - 280, zIndex: 1, fit: "cover", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: W / 2 + 2, y: 0, width: W / 2 - 2, height: H - 280, zIndex: 2, fit: "cover", ...defaultProps });
          if (c) newLayers.push({ sourceId: c, x: 200, y: H - 260, width: W - 400, height: 240, zIndex: 3, fit: "contain", ...defaultProps });
          active.slice(3).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: W - 500 - idx * 40,
              y: H - 340 - idx * 40,
              width: 460,
              height: 280,
              zIndex: idx + 4,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 20,
              borderWidth: 4,
            });
          });
          break;
        case "screen-cam":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W, height: H, zIndex: 1, fit: "contain", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: W - 480, y: 40, width: 440, height: 280, zIndex: 2, fit: "cover", ...defaultProps, shape: "rounded", borderRadius: 24, borderWidth: 4 });
          active.slice(2).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: W - 480 - idx * 40,
              y: H - 340 - idx * 40,
              width: 440,
              height: 280,
              zIndex: idx + 3,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 24,
              borderWidth: 4,
            });
          });
          break;
        case "grid4":
          if (a) newLayers.push({ sourceId: a, x: 0, y: 0, width: W / 2 - 2, height: H / 2 - 2, zIndex: 1, fit: "cover", ...defaultProps });
          if (b) newLayers.push({ sourceId: b, x: W / 2 + 2, y: 0, width: W / 2 - 2, height: H / 2 - 2, zIndex: 2, fit: "cover", ...defaultProps });
          if (c) newLayers.push({ sourceId: c, x: 0, y: H / 2 + 2, width: W / 2 - 2, height: H / 2 - 2, zIndex: 3, fit: "cover", ...defaultProps });
          if (d) newLayers.push({ sourceId: d, x: W / 2 + 2, y: H / 2 + 2, width: W / 2 - 2, height: H / 2 - 2, zIndex: 4, fit: "cover", ...defaultProps });
          active.slice(4).forEach((sId, idx) => {
            newLayers.push({
              sourceId: sId,
              x: W / 2 - 220 + idx * 40,
              y: H / 2 - 150 + idx * 40,
              width: 440,
              height: 300,
              zIndex: idx + 5,
              fit: "cover",
              ...defaultProps,
              shape: "rounded",
              borderRadius: 20,
              borderWidth: 4,
            });
          });
          break;
      }
    }

    // Preservar configuraciones de usuario (chroma, mirror, filtros, etc.)
    const currentList = this.layersByAspect[this.aspectMode];
    const existingMap = new Map(currentList.map((l) => [l.sourceId, l]));

    this.layers = newLayers.map((l, idx) => {
      const prev = existingMap.get(l.sourceId);
      const orderZ = idx + 1; // El orden en active (this.slots) define el apilamiento Z
      if (prev) {
        return {
          ...l,
          zIndex: orderZ,
          visible: prev.visible ?? true,
          x: resetGeometry ? l.x : (prev.x ?? l.x),
          y: resetGeometry ? l.y : (prev.y ?? l.y),
          width: resetGeometry ? l.width : (prev.width ?? l.width),
          height: resetGeometry ? l.height : (prev.height ?? l.height),
          fit: resetGeometry ? l.fit : (prev.fit ?? l.fit),
          shape: resetGeometry ? l.shape : (prev.shape ?? l.shape),
          mirror: prev.mirror ?? l.mirror,
          rotation: prev.rotation ?? 0,
          borderRadius: prev.borderRadius ?? l.borderRadius,
          borderColor: prev.borderColor ?? l.borderColor,
          borderWidth: prev.borderWidth ?? l.borderWidth,
          filter: prev.filter ?? l.filter,
          chroma: prev.chroma ?? l.chroma,
          backgroundBlur: prev.backgroundBlur ?? l.backgroundBlur,
        };
      }
      return { ...l, zIndex: orderZ, visible: true };
    });

    // Asegurar que los elementos <video> de las capas activas estén reproduciéndose en tiempo real
    active.forEach((id) => {
      const v = this.videos.get(id);
      const st = this.streams.get(id);
      if (v && st) {
        if (v.srcObject !== st) v.srcObject = st;
        if (v.paused) v.play().catch(() => {});
      }
      if (resetGeometry && id.startsWith("screen-")) {
        this.fitLayerToNativeVideo(id, true);
      }
    });
  }

  /**
   * Ajusta la caja de la capa exactamente a la proporción real del video entrante
   * (ej. pestaña, ventana recortada o pantalla vertical/horizontal) ocupando el máximo
   * ancho o alto del lienzo sin deformar ni dejar bordes sobrantes en el gizmo.
   */
  private lastVideoRatio = new Map<string, string>();

  fitLayerToNativeVideo(sourceId: string, forceMaximize = false) {
    const el = this.videos.get(sourceId);
    if (!el || !el.videoWidth || !el.videoHeight) return;

    const layer = this.layers.find((l) => l.sourceId === sourceId);
    if (!layer) return;

    const W = this.canvas.width;
    const H = this.canvas.height;
    const rot = layer.rotation ?? 0;
    const isRot90 = rot === 90 || rot === 270;
    const effVideoW = isRot90 ? el.videoHeight : el.videoWidth;
    const effVideoH = isRot90 ? el.videoWidth : el.videoHeight;
    const vr = effVideoW / effVideoH;
    const canvasRatio = W / H;

    const isScreen = sourceId.startsWith("screen-") || sourceId.includes("-screen");
    const isFullCanvasLayer =
      forceMaximize ||
      isScreen ||
      (layer.x === 0 && layer.y === 0 && layer.width === W && layer.height === H);

    // Proporción real actual del video (cambia cuando el celular gira vertical <-> horizontal)
    const ratioKey = vr.toFixed(2);
    const ratioChanged = this.lastVideoRatio.get(sourceId) !== ratioKey;
    this.lastVideoRatio.set(sourceId, ratioKey);

    const fitInsideCanvas = () => {
      let newW = W;
      let newH = H;
      if (vr > canvasRatio) {
        newW = W;
        newH = Math.round(W / vr);
      } else {
        newH = H;
        newW = Math.round(H * vr);
      }
      return { newW, newH };
    };

    if (isFullCanvasLayer) {
      // Ocupa el máximo ancho (horizontal) o el máximo alto (vertical) del visualizador
      const { newW, newH } = fitInsideCanvas();
      this.updateLayer(sourceId, {
        x: Math.round((W - newW) / 2),
        y: Math.round((H - newH) / 2),
        width: newW,
        height: newH,
        fit: "contain",
        shape: vr < 1 ? "vertical" : "rect",
      });
    } else if (ratioChanged && layer.shape !== "square" && layer.shape !== "circle") {
      // El usuario NO forzó una forma cuadrada/circular: la capa sigue la orientación real del video (9:16 <-> 16:9).
      const layerArea = (layer.width || 1) * (layer.height || 1);
      let newW: number;
      let newH: number;
      if (layerArea >= W * H * 0.5 || (layer.height || 0) >= H * 0.9 || (layer.width || 0) >= W * 0.9) {
        ({ newW, newH } = fitInsideCanvas());
      } else {
        // Capa flotante: conserva su tamaño aproximado (misma área) con la nueva proporción
        newW = Math.round(Math.sqrt(layerArea * vr));
        newH = Math.round(newW / vr);
      }
      const cx = layer.x + (layer.width || 1) / 2;
      const cy = layer.y + (layer.height || 1) / 2;
      this.updateLayer(sourceId, {
        x: Math.max(0, Math.min(W - newW, Math.round(cx - newW / 2))),
        y: Math.max(0, Math.min(H - newH, Math.round(cy - newH / 2))),
        width: newW,
        height: newH,
        fit: "contain",
        shape: vr < 1 ? "vertical" : "rect",
      });
    }
  }

  toggleLayerVisible(sourceId: string): boolean {
    const layer = this.layers.find((l) => l.sourceId === sourceId);
    if (!layer) return true;
    const next = !(layer.visible ?? true);
    this.updateLayer(sourceId, { visible: next });
    return next;
  }

  isLayerVisible(sourceId: string): boolean {
    const layer = this.layers.find((l) => l.sourceId === sourceId);
    return layer ? (layer.visible ?? true) : true;
  }

  reorderSlots(newSlots: string[]) {
    this.slots = newSlots;
    // Actualizar zIndex según el nuevo orden sin alterar coordenadas ni tamaños
    const zMap = new Map(newSlots.map((id, idx) => [id, idx + 1]));
    this.layers = this.layers.map((l) => ({
      ...l,
      zIndex: zMap.get(l.sourceId) ?? l.zIndex,
    }));
  }

  updateLayer(sourceId: string, updates: Partial<LayerTransform>) {
    this.layers = this.layers.map((l) => (l.sourceId === sourceId ? { ...l, ...updates } : l));
  }

  setLayerShape(sourceId: string, shape: LayerShape) {
    const layer = this.layers.find((l) => l.sourceId === sourceId);
    if (!layer) return;

    const W = this.canvas.width;
    const H = this.canvas.height;
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    let updates: Partial<LayerTransform> = { shape, fit: "cover" };

    if (shape === "square" || shape === "circle") {
      const side = Math.max(360, Math.min(layer.width, layer.height, H));
      updates.width = side;
      updates.height = side;
      updates.x = Math.max(0, Math.min(W - side, Math.round(cx - side / 2)));
      updates.y = Math.max(0, Math.min(H - side, Math.round(cy - side / 2)));
    } else if (shape === "vertical") {
      // Proporción 9:16 vertical fija para la cámara
      const isLarge = layer.height >= H * 0.85 || layer.width >= W * 0.85;
      const h = isLarge ? H : Math.min(H, Math.max(layer.height, 640));
      const w = Math.round((h * 9) / 16);
      updates.width = w;
      updates.height = h;
      updates.x = isLarge ? Math.round((W - w) / 2) : Math.max(0, Math.min(W - w, Math.round(cx - w / 2)));
      updates.y = isLarge ? Math.round((H - h) / 2) : Math.max(0, Math.min(H - h, Math.round(cy - h / 2)));
    } else if (shape === "rect") {
      // Al pulsar Horizontal / Nativo: usa la relación de aspecto nativa del video (considerando rotación)
      const el = this.videos.get(sourceId);
      const rot = layer.rotation ?? 0;
      const isRot90 = rot === 90 || rot === 270;
      const effW = el ? (isRot90 ? el.videoHeight : el.videoWidth) : 16;
      const effH = el ? (isRot90 ? el.videoWidth : el.videoHeight) : 9;
      const vr = effW && effH ? effW / effH : 16 / 9;
      const isLarge = layer.height >= H * 0.85 || layer.width >= W * 0.85;
      if (isLarge) {
        const canvasRatio = W / H;
        const w = vr > canvasRatio ? W : Math.round(H * vr);
        const h = vr > canvasRatio ? Math.round(W / vr) : H;
        updates.width = w;
        updates.height = h;
        updates.x = Math.round((W - w) / 2);
        updates.y = Math.round((H - h) / 2);
      } else {
        const w = Math.min(W, Math.max(layer.width, 560));
        const h = Math.round(w / vr);
        updates.width = w;
        updates.height = h;
        updates.x = Math.max(0, Math.min(W - w, Math.round(cx - w / 2)));
        updates.y = Math.max(0, Math.min(H - h, Math.round(cy - h / 2)));
      }
    }
    this.updateLayer(sourceId, updates);
  }

  toggleLayerMirror(sourceId: string) {
    const layer = this.layers.find((l) => l.sourceId === sourceId);
    if (!layer) return;
    this.updateLayer(sourceId, { mirror: !layer.mirror });
  }

  private sourceFacing = new Map<string, "user" | "environment">();

  setSourceFacing(sourceId: string, facing: "user" | "environment") {
    const prev = this.sourceFacing.get(sourceId);
    this.sourceFacing.set(sourceId, facing);
    // Cuando el usuario cambia entre cámara Frontal y Trasera con el móvil acostado (rotación 90° o 270°),
    // los sensores físico frontal y trasero están montados a 180° opuestos entre sí (90° <-> 270°).
    // Si ya había rotado a 90° o 270°, invertimos automáticamente entre 90° y 270° para que no quede patas arriba.
    if (prev && prev !== facing) {
      const layer = this.layers.find((l) => l.sourceId === sourceId);
      if (layer && (layer.rotation === 90 || layer.rotation === 270)) {
        const flippedRot = (layer.rotation === 90 ? 270 : 90) as 90 | 270;
        this.updateLayer(sourceId, { rotation: flippedRot });
      }
    }
  }

  rotateLayer(sourceId: string, step: 90 | -90 = -90): 0 | 90 | 180 | 270 {
    const layer = this.layers.find((l) => l.sourceId === sourceId);
    if (!layer) return 0;
    const cur = layer.rotation ?? 0;
    const facing = this.sourceFacing.get(sourceId);
    let next: 0 | 90 | 180 | 270;
    // Si está en 0° (vertical) y pulsa Girar por primera vez, ir directo al ángulo horizontal correcto
    // según sea cámara trasera (270° en 1 solo clic) o frontal (90° en 1 solo clic).
    if (cur === 0 && facing) {
      next = facing === "environment" ? 270 : 90;
    } else {
      next = (((cur + step) % 360 + 360) % 360) as 0 | 90 | 180 | 270;
    }
    const W = this.canvas.width;
    const H = this.canvas.height;

    // Si la forma no es cuadrada ni circular, intercambiar el ancho y alto de la capa al rotar 90°
    if (layer.shape !== "square" && layer.shape !== "circle") {
      const cx = layer.x + layer.width / 2;
      const cy = layer.y + layer.height / 2;
      const isFull = layer.width >= W * 0.85 || layer.height >= H * 0.85;
      const el = this.videos.get(sourceId);
      const isRot90 = next === 90 || next === 270;
      const effW = el && el.videoWidth ? (isRot90 ? el.videoHeight : el.videoWidth) : layer.height;
      const effH = el && el.videoHeight ? (isRot90 ? el.videoWidth : el.videoHeight) : layer.width;
      const vr = effW / (effH || 1);

      let newW = layer.height;
      let newH = layer.width;
      if (isFull) {
        if (vr > W / H) {
          newW = W;
          newH = Math.round(W / vr);
        } else {
          newH = H;
          newW = Math.round(H * vr);
        }
      }
      const newX = isFull ? Math.round((W - newW) / 2) : Math.max(0, Math.min(W - newW, Math.round(cx - newW / 2)));
      const newY = isFull ? Math.round((H - newH) / 2) : Math.max(0, Math.min(H - newH, Math.round(cy - newH / 2)));
      this.updateLayer(sourceId, {
        rotation: next,
        width: newW,
        height: newH,
        x: newX,
        y: newY,
        shape: newH > newW ? "vertical" : "rect",
      });
    } else {
      this.updateLayer(sourceId, { rotation: next });
    }
    return next;
  }

  setLayerFilter(sourceId: string, filter: ColorFilter) {
    this.updateLayer(sourceId, { filter });
  }

  setLayerChroma(sourceId: string, chroma: Partial<ChromaConfig>) {
    const layer = this.layers.find((l) => l.sourceId === sourceId);
    if (!layer) return;
    this.updateLayer(sourceId, { chroma: { ...layer.chroma, ...chroma } });
  }

  private segmentationDisabled = false;

  private async initSelfieSegmentation() {
    if (this.selfieSegmentation || this.segmentationDisabled || typeof window === "undefined") return;
    try {
      // Verificar primero si el navegador del usuario tiene WebGL2 / Aceleración por Hardware habilitada.
      // Si no la tiene, no cargamos MediaPipe WebGL para evitar el error "Failed to create WebGL canvas context"
      // y usamos directamente el motor de desenfoque de fondo por Canvas 2D (100% compatible sin GPU).
      const testCanvas = document.createElement("canvas");
      const gl = testCanvas.getContext("webgl2") || testCanvas.getContext("webgl");
      if (!gl) {
        this.segmentationDisabled = true;
        return;
      }

      // Cargar MediaPipe SelfieSegmentation dinámicamente si no está en window
      if (!(window as any).SelfieSegmentation) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js";
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("No se pudo cargar MediaPipe"));
          document.head.appendChild(script);
        });
      }

      const SS = (window as any).SelfieSegmentation;
      if (!SS) return;

      const seg = new SS({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });

      seg.setOptions({
        modelSelection: 1, // 0 = general (más rápido), 1 = landscape (máxima precisión de bordes)
        selfieMode: false,
      });

      this.selfieSegmentation = seg;
    } catch {
      this.segmentationDisabled = true;
      this.selfieSegmentation = null;
    }
  }

  setLayerBackgroundBlur(sourceId: string, backgroundBlur: number) {
    if (backgroundBlur > 0) {
      this.initSelfieSegmentation();
    }
    this.updateLayer(sourceId, { backgroundBlur });
  }

  // Comprueba si un punto (x, y) cae sobre algún control de redimensionamiento
  getHandleAtPoint(clickX: number, clickY: number, handleRadius = 16): { layerId: string; handle: ResizeHandle } | null {
    if (!this.selectedLayerId) return null;
    const l = this.layers.find((layer) => layer.sourceId === this.selectedLayerId);
    if (!l) return null;

    const { x, y, width: w, height: h } = l;
    const handles: { handle: ResizeHandle; hx: number; hy: number }[] = [
      { handle: "nw", hx: x, hy: y },
      { handle: "ne", hx: x + w, hy: y },
      { handle: "se", hx: x + w, hy: y + h },
      { handle: "sw", hx: x, hy: y + h },
      { handle: "n", hx: x + w / 2, hy: y },
      { handle: "s", hx: x + w / 2, hy: y + h },
      { handle: "w", hx: x, hy: y + h / 2 },
      { handle: "e", hx: x + w, hy: y + h / 2 },
    ];

    for (const item of handles) {
      const dx = clickX - item.hx;
      const dy = clickY - item.hy;
      if (dx * dx + dy * dy <= handleRadius * handleRadius) {
        return { layerId: l.sourceId, handle: item.handle };
      }
    }
    return null;
  }

  autoTransition(layout: LiveLayout, slots: string[]) {
    this.fade = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 150);
      this.fade = 1 - k;
      if (k < 1) {
        requestAnimationFrame(step);
      } else {
        this.setScene(layout, slots);
        const t1 = performance.now();
        const step2 = (t2: number) => {
          const k2 = Math.min(1, (t2 - t1) / 150);
          this.fade = k2;
          if (k2 < 1) requestAnimationFrame(step2);
        };
        requestAnimationFrame(step2);
      }
    };
    requestAnimationFrame(step);
  }

  setAudioDelay(id: string, delayMs: number) {
    const d = this.delays.get(id);
    if (d && this.audioCtx) {
      const sec = Math.max(0, Math.min(3.0, delayMs / 1000));
      d.delayTime.setValueAtTime(sec, this.audioCtx.currentTime);
    }
  }

  setGain(id: string, v01: number) {
    this.gains.get(id)?.gain.setValueAtTime(Math.max(0, Math.min(1, v01)), this.audioCtx?.currentTime || 0);
  }

  setMuted(id: string, muted: boolean) {
    const g = this.gains.get(id);
    if (g && this.audioCtx) {
      g.gain.setValueAtTime(muted ? 0 : 1, this.audioCtx.currentTime);
    }
  }

  level(id: string): number {
    const an = this.analysers.get(id);
    if (!an) return 0;
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / buf.length) * 3);
  }

  getProgramStream(fps = 30): MediaStream {
    const vs = this.canvas.captureStream(fps);
    const out = new MediaStream();
    vs.getVideoTracks().forEach((t) => out.addTrack(t));
    if (this.dest) {
      this.dest.stream.getAudioTracks().forEach((t) => out.addTrack(t));
    }
    return out;
  }

  setOverlay(banner: string, show: boolean) {
    this.bannerText = banner;
    this.showLowerThird = show;
  }

  // Aplicar LUTs cinematográficos profesionales mediante Canvas Filters
  private getFilterString(filter: ColorFilter): string {
    switch (filter) {
      case "cinematic":
        // Tonos cálidos de cine, contraste alto, saturación cuidada
        return "contrast(1.15) brightness(1.04) saturate(1.18) sepia(0.08)";
      case "teal_orange":
        // Teal & Orange cinematográfico de Hollywood
        return "contrast(1.22) saturate(1.3) hue-rotate(-12deg) brightness(1.02)";
      case "studio_crisp":
        // Look Streamer profesional: gran nitidez, sombras limpias, tez natural
        return "contrast(1.08) brightness(1.06) saturate(1.12)";
      case "noir":
        // Blanco y negro dramático
        return "grayscale(1) contrast(1.35) brightness(0.95)";
      case "cyberpunk":
        // Neón vibrante
        return "contrast(1.3) saturate(1.5) hue-rotate(25deg)";
      default:
        return "none";
    }
  }

  // Procesador Chroma Key en tiempo real por pixel
  private processChroma(offCtx: CanvasRenderingContext2D, w: number, h: number, config: ChromaConfig) {
    const imgData = offCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const isGreen = config.color === "green";
    const sim = config.similarity;
    const smooth = config.smoothness;
    const spill = config.spill;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      let mask = 0;
      if (isGreen) {
        // Distancia euclídea normalizada a verde puro (0, 255, 0)
        const diff = Math.sqrt(r * r + (255 - g) * (255 - g) + b * b) / 441.67;
        if (diff < sim) {
          mask = 0; // Transparente total
        } else if (diff < sim + smooth) {
          mask = (diff - sim) / smooth; // Borde suave
        } else {
          mask = 1;
        }

        // Reducción de reflejo verde (Spill suppression)
        if (mask > 0 && g > (r + b) / 2) {
          data[i + 1] = Math.min(g, (r + b) / 2 + (1 - spill) * 20);
        }
      } else {
        // Azul puro (0, 0, 255)
        const diff = Math.sqrt(r * r + g * g + (255 - b) * (255 - b)) / 441.67;
        if (diff < sim) {
          mask = 0;
        } else if (diff < sim + smooth) {
          mask = (diff - sim) / smooth;
        } else {
          mask = 1;
        }
        if (mask > 0 && b > (r + g) / 2) {
          data[i + 2] = Math.min(b, (r + g) / 2);
        }
      }

      data[i + 3] = Math.round(data[i + 3] * mask);
    }
    offCtx.putImageData(imgData, 0, 0);
  }

  start() {
    const applyClipShape = (layer: LayerTransform) => {
      const { x, y, width: w, height: h, shape, borderRadius = 20 } = layer;
      this.ctx.beginPath();
      if (shape === "circle") {
        const radius = Math.min(w, h) / 2;
        this.ctx.arc(x + w / 2, y + h / 2, radius, 0, Math.PI * 2);
      } else if (shape === "rounded") {
        const r = Math.min(borderRadius, w / 2, h / 2);
        this.ctx.roundRect(x, y, w, h, r);
      } else {
        // rect, square o vertical estándar
        this.ctx.rect(x, y, w, h);
      }
      this.ctx.closePath();
    };

    const drawVideoLayer = (layerInput: LayerTransform) => {
      const el = this.videos.get(layerInput.sourceId);
      if (el && el.readyState >= 2 && el.videoWidth > 0) {
        // Detectar continuamente cambios en la proporción real del video entrante (ej. cuando el móvil
        // gira entre Vertical 9:16 y Horizontal 16:9 en pleno vivo) y adaptar la caja automáticamente.
        const curRot = layerInput.rotation ?? 0;
        const curIs90 = curRot === 90 || curRot === 270;
        const curEffW = curIs90 ? el.videoHeight : el.videoWidth;
        const curEffH = curIs90 ? el.videoWidth : el.videoHeight;
        const curRatioKey = (curEffW / (curEffH || 1)).toFixed(2);
        if (this.lastVideoRatio.get(layerInput.sourceId) !== curRatioKey) {
          this.fitLayerToNativeVideo(layerInput.sourceId);
        }
      }
      const layer = this.layers.find((l) => l.sourceId === layerInput.sourceId) || layerInput;
      const {
        x,
        y,
        width: w,
        height: h,
        fit,
        mirror,
        borderColor,
        borderWidth,
        shape,
        filter,
        chroma,
        backgroundBlur = 0,
      } = layer;

      this.ctx.save();

      // Recorte según forma geométrica
      applyClipShape(layer);
      this.ctx.clip();

      // Si no hay Chroma activo, pintar fondo base oscuro
      if (!chroma?.enabled) {
        this.ctx.fillStyle = "#111827";
        this.ctx.fillRect(x, y, w, h);
      }

      if (el && el.readyState >= 2 && el.videoWidth > 0) {
        // Si el usuario aplicó rotación manual (90°, 180°, 270°) para enderezar un sensor móvil,
        // pre-rotamos el frame en un canvas intermedio para que encaje perfecto con contain, cover, chroma y blur.
        let srcSource: HTMLVideoElement | HTMLCanvasElement = el;
        let srcW = el.videoWidth;
        let srcH = el.videoHeight;
        const rot = layer.rotation ?? 0;

        if (rot !== 0) {
          let rotCanvas = (this as any)._rotCanvas as HTMLCanvasElement | undefined;
          if (!rotCanvas) {
            rotCanvas = document.createElement("canvas");
            (this as any)._rotCanvas = rotCanvas;
          }
          const is90 = rot === 90 || rot === 270;
          srcW = is90 ? el.videoHeight : el.videoWidth;
          srcH = is90 ? el.videoWidth : el.videoHeight;
          rotCanvas.width = srcW;
          rotCanvas.height = srcH;
          const rctx = rotCanvas.getContext("2d");
          if (rctx) {
            rctx.save();
            rctx.translate(srcW / 2, srcH / 2);
            rctx.rotate((rot * Math.PI) / 180);
            rctx.drawImage(el, -el.videoWidth / 2, -el.videoHeight / 2, el.videoWidth, el.videoHeight);
            rctx.restore();
            srcSource = rotCanvas;
          }
        }

        // Cálculo de dimensiones de video manteniendo aspect ratio exacto
        const vr = srcW / srcH;
        const br = w / h;
        let dw = w;
        let dh = h;
        let sx = 0;
        let sy = 0;
        let sw = srcW;
        let sh = srcH;

        if (fit === "contain") {
          if (vr > br) {
            dh = w / vr;
          } else {
            dw = h * vr;
          }
        } else {
          // cover
          if (vr > br) {
            sw = srcH * br;
            sx = (srcW - sw) / 2;
          } else {
            sh = srcW / br;
            sy = (srcH - sh) / 2;
          }
        }

        const dx = (w - dw) / 2;
        const dy = (h - dh) / 2;

        if (chroma && chroma.enabled && this.offCanvas && this.offCtx) {
          // ── Render Chroma Key preservando aspecto ──
          const targetW = Math.round(fit === "contain" ? dw : w);
          const targetH = Math.round(fit === "contain" ? dh : h);
          this.offCanvas.width = targetW;
          this.offCanvas.height = targetH;
          this.offCtx.clearRect(0, 0, targetW, targetH);

          this.offCtx.save();
          if (mirror) {
            this.offCtx.translate(targetW, 0);
            this.offCtx.scale(-1, 1);
          }
          if (fit === "contain") {
            this.offCtx.drawImage(srcSource, 0, 0, srcW, srcH, 0, 0, targetW, targetH);
          } else {
            this.offCtx.drawImage(srcSource, sx, sy, sw, sh, 0, 0, targetW, targetH);
          }
          this.offCtx.restore();

          this.processChroma(this.offCtx, targetW, targetH, chroma);

          this.ctx.save();
          this.ctx.filter = this.getFilterString(filter);
          const renderX = fit === "contain" ? x + dx : x;
          const renderY = fit === "contain" ? y + dy : y;
          this.ctx.drawImage(this.offCanvas, renderX, renderY, targetW, targetH);
          this.ctx.restore();
        } else if (backgroundBlur > 0) {
          // ── Modo Blur de Fondo Inteligente (Segmentación de Persona tipo Google Meet / Zoom) ──
          this.ctx.save();
          if (mirror) {
            this.ctx.translate(x + w, y);
            this.ctx.scale(-1, 1);
          } else {
            this.ctx.translate(x, y);
          }

          // Ejecutar segmentación por IA si está disponible (procesa a ~25-30fps)
          const now = performance.now();
          if (
            this.selfieSegmentation &&
            !this.segmentationDisabled &&
            !this.segmentationRunning &&
            now - this.lastSegmentationTime > 33
          ) {
            this.segmentationRunning = true;
            this.lastSegmentationTime = now;
            this.selfieSegmentation.onResults((results: any) => {
              if (results && results.segmentationMask) {
                let maskCanvas = this.segmentationMasks.get(layer.sourceId);
                if (!maskCanvas) {
                  maskCanvas = document.createElement("canvas");
                  this.segmentationMasks.set(layer.sourceId, maskCanvas);
                }
                maskCanvas.width = results.segmentationMask.width || 320;
                maskCanvas.height = results.segmentationMask.height || 180;
                const mctx = maskCanvas.getContext("2d");
                if (mctx) {
                  mctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
                  mctx.drawImage(results.segmentationMask, 0, 0, maskCanvas.width, maskCanvas.height);
                }
              }
              this.segmentationRunning = false;
            });
            try {
              this.selfieSegmentation.send({ image: srcSource }).catch(() => {
                // Si el navegador falla al crear el contexto WebGL al pasar el frame, desactivar MediaPipe
                // para no repetir el error en cada frame y usar el motor Blur Canvas 2D automático.
                this.segmentationDisabled = true;
                this.selfieSegmentation = null;
                this.segmentationRunning = false;
              });
            } catch {
              this.segmentationDisabled = true;
              this.selfieSegmentation = null;
              this.segmentationRunning = false;
            }
          }

          const maskCanvas = this.segmentationMasks.get(layer.sourceId);

          if (maskCanvas && this.offCanvas && this.offCtx) {
            // ── Segmentación Neuronal Precisa Activa ──
            const targetW = Math.round(fit === "contain" ? dw : w);
            const targetH = Math.round(fit === "contain" ? dh : h);
            this.offCanvas.width = targetW;
            this.offCanvas.height = targetH;
            this.offCtx.clearRect(0, 0, targetW, targetH);

            // 1. Dibujar el sujeto nítido recortado con la máscara de MediaPipe
            if (fit === "contain") {
              this.offCtx.drawImage(srcSource, 0, 0, srcW, srcH, 0, 0, targetW, targetH);
            } else {
              this.offCtx.drawImage(srcSource, sx, sy, sw, sh, 0, 0, targetW, targetH);
            }

            // Aplicar máscara: solo retener los píxeles de la silueta de la persona
            this.offCtx.globalCompositeOperation = "destination-in";
            this.offCtx.drawImage(maskCanvas, 0, 0, targetW, targetH);
            this.offCtx.globalCompositeOperation = "source-over";

            // 2. En el canvas principal: Dibujar todo el fondo desenfocado
            this.ctx.save();
            this.ctx.filter = `blur(${backgroundBlur}px) ${this.getFilterString(filter)}`;
            if (fit === "contain") {
              this.ctx.drawImage(srcSource, 0, 0, srcW, srcH, dx, dy, dw, dh);
            } else {
              this.ctx.drawImage(srcSource, sx, sy, sw, sh, 0, 0, w, h);
            }
            this.ctx.restore();

            // 3. Superponer a la persona nítida con sus bordes exactos (cabeza, hombros, manos)
            this.ctx.save();
            this.ctx.filter = this.getFilterString(filter);
            const renderX = fit === "contain" ? dx : 0;
            const renderY = fit === "contain" ? dy : 0;
            this.ctx.drawImage(this.offCanvas, renderX, renderY, targetW, targetH);
            this.ctx.restore();
          } else {
            // Mientras inicializa el modelo o en navegadores sin soporte: difuminado suave con degradado radial
            this.ctx.save();
            this.ctx.filter = `blur(${backgroundBlur}px) ${this.getFilterString(filter)}`;
            if (fit === "contain") {
              this.ctx.drawImage(srcSource, 0, 0, srcW, srcH, dx, dy, dw, dh);
            } else {
              this.ctx.drawImage(srcSource, sx, sy, sw, sh, 0, 0, w, h);
            }
            this.ctx.restore();

            this.ctx.save();
            let gCanvas = (this as any)._blurFallbackCanvas as HTMLCanvasElement | undefined;
            if (!gCanvas) {
              gCanvas = document.createElement("canvas");
              (this as any)._blurFallbackCanvas = gCanvas;
            }
            if (gCanvas.width !== w) gCanvas.width = w;
            if (gCanvas.height !== h) gCanvas.height = h;
            const gctx = gCanvas.getContext("2d");
            if (gctx) {
              gctx.globalCompositeOperation = "source-over";
              gctx.clearRect(0, 0, w, h);
              const cx = fit === "contain" ? dx + dw / 2 : w / 2;
              const cy = fit === "contain" ? dy + dh * 0.5 : h * 0.5;
              const rad = Math.min(w, h) * 0.48;
              const radG = gctx.createRadialGradient(cx, cy, rad * 0.35, cx, cy, rad);
              radG.addColorStop(0, "rgba(0,0,0,1)");
              radG.addColorStop(0.7, "rgba(0,0,0,0.85)");
              radG.addColorStop(1, "rgba(0,0,0,0)");
              gctx.fillStyle = radG;
              gctx.fillRect(0, 0, w, h);
              gctx.globalCompositeOperation = "source-in";
              if (fit === "contain") {
                gctx.drawImage(srcSource, 0, 0, srcW, srcH, dx, dy, dw, dh);
              } else {
                gctx.drawImage(srcSource, sx, sy, sw, sh, 0, 0, w, h);
              }
              this.ctx.filter = this.getFilterString(filter);
              this.ctx.drawImage(gCanvas, 0, 0);
            }
            this.ctx.restore();
          }

          this.ctx.restore(); // Salir del transform espejo/posición
        } else {
          // ── Render Directo Estándar ──
          this.ctx.save();
          this.ctx.filter = this.getFilterString(filter);
          if (mirror) {
            this.ctx.translate(x + w, y);
            this.ctx.scale(-1, 1);
          } else {
            this.ctx.translate(x, y);
          }

          if (fit === "contain") {
            this.ctx.drawImage(srcSource, 0, 0, srcW, srcH, dx, dy, dw, dh);
          } else {
            this.ctx.drawImage(srcSource, sx, sy, sw, sh, 0, 0, w, h);
          }
          this.ctx.restore();
        }
      } else {
        this.ctx.fillStyle = "#1e293b";
        this.ctx.fillRect(x, y, w, h);
        this.ctx.fillStyle = "#64748b";
        this.ctx.font = `${Math.max(16, Math.min(28, w / 15))}px sans-serif`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText("Esperando señal...", x + w / 2, y + h / 2);
      }

      this.ctx.restore(); // Salir del clip

      // Borde cosmético si está configurado
      if (borderWidth && borderWidth > 0 && borderColor) {
        this.ctx.save();
        applyClipShape(layer);
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = borderWidth;
        this.ctx.stroke();
        this.ctx.restore();
      }

      // Indicadores y Gizmo OBS interactivo si la capa está seleccionada
      if (this.selectedLayerId === layer.sourceId) {
        this.ctx.save();
        this.ctx.strokeStyle = "#38bdf8";
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([8, 4]);

        if (shape === "circle") {
          const radius = Math.min(w, h) / 2;
          this.ctx.beginPath();
          this.ctx.arc(x + w / 2, y + h / 2, radius + 2, 0, Math.PI * 2);
          this.ctx.stroke();
        } else {
          this.ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
        }
        this.ctx.setLineDash([]);

        // Dibujar Handles interactivos (Esquinas y costados para redimensionar)
        const handleSize = 14;
        const half = handleSize / 2;
        const handles = [
          { hx: x, hy: y },
          { hx: x + w, hy: y },
          { hx: x + w, hy: y + h },
          { hx: x, hy: y + h },
          { hx: x + w / 2, hy: y },
          { hx: x + w / 2, hy: y + h },
          { hx: x, hy: y + h / 2 },
          { hx: x + w, hy: y + h / 2 },
        ];

        this.ctx.fillStyle = "#ffffff";
        this.ctx.strokeStyle = "#0284c7";
        this.ctx.lineWidth = 2;
        for (const pt of handles) {
          this.ctx.fillRect(pt.hx - half, pt.hy - half, handleSize, handleSize);
          this.ctx.strokeRect(pt.hx - half, pt.hy - half, handleSize, handleSize);
        }

        // Etiqueta flotante con dimensiones y estado
        this.ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
        this.ctx.font = "bold 16px sans-serif";
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "top";
        const info = `${Math.round(w)}x${Math.round(h)} px | ${shape.toUpperCase()}${mirror ? " [🪞]" : ""}${filter !== "none" ? ` [${filter.toUpperCase()}]` : ""}${chroma?.enabled ? " [CHROMA]" : ""}`;
        const tw = this.ctx.measureText(info).width;
        this.ctx.fillRect(x, Math.max(0, y - 28), tw + 16, 24);
        this.ctx.fillStyle = "#38bdf8";
        this.ctx.fillText(info, x + 8, Math.max(4, y - 24));

        this.ctx.restore();
      }
    };

    const drawOverlays = (W: number, H: number) => {
      if (this.showLowerThird && this.bannerText) {
        this.ctx.save();
        const barH = this.aspectMode === "vertical" ? 140 : 90;
        const barY = H - barH - 40;
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
        this.ctx.fillRect(40, barY, W - 80, barH);
        this.ctx.fillStyle = "#ef4444";
        this.ctx.fillRect(40, barY, 12, barH);
        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = `bold ${this.aspectMode === "vertical" ? "42px" : "32px"} sans-serif`;
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(this.bannerText, 70, barY + barH / 2);
        this.ctx.restore();
      }
    };

    const loop = () => {
      const W = this.canvas.width;
      const H = this.canvas.height;

      this.ctx.save();
      this.ctx.globalAlpha = this.fade;
      this.ctx.fillStyle = "#090d16";
      this.ctx.fillRect(0, 0, W, H);

      if (this.layers.length === 0) {
        this.ctx.fillStyle = "#1e293b";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.font = "bold 36px sans-serif";
        this.ctx.fillText("🎛 ESCENA VACÍA", W / 2, H / 2 - 20);
        this.ctx.font = "22px sans-serif";
        this.ctx.fillStyle = "#64748b";
        this.ctx.fillText("Asigna fuentes a esta escena en el panel inferior", W / 2, H / 2 + 30);
      } else {
        const sorted = [...this.layers].sort((m, n) => m.zIndex - n.zIndex);
        for (const l of sorted) {
          if (l.visible === false) continue;
          drawVideoLayer(l);
        }
      }

      drawOverlays(W, H);
      this.ctx.restore();
      this.raf = requestAnimationFrame(loop);
    };

    cancelAnimationFrame(this.raf);
    loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}
