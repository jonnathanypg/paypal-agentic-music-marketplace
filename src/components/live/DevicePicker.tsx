"use client";
import React, { useEffect, useState } from "react";

// DevicePicker — enumera cámaras/mics/parlantes, toggle front/back (con stop previo),
// y preview de prueba. Sin dependencias.
export type DeviceChoice = {
  cameraId?: string;
  micId?: string;
  speakerId?: string;
  facing: "user" | "environment";
};

export default function DevicePicker({
  onChange,
}: {
  onChange?: (d: DeviceChoice) => void;
}) {
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [spks, setSpks] = useState<MediaDeviceInfo[]>([]);
  const [choice, setChoice] = useState<DeviceChoice>({ facing: "user" });
  const [needsPerm, setNeedsPerm] = useState(false);
  const [permCam, setPermCam] = useState("unknown");
  const [permMic, setPermMic] = useState("unknown");
  const previewRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const refresh = async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      setCams(devs.filter((d) => d.kind === "videoinput"));
      setMics(devs.filter((d) => d.kind === "audioinput"));
      setSpks(devs.filter((d) => d.kind === "audiooutput"));
      setNeedsPerm(devs.every((d) => !d.label));
      try {
        const q = navigator.permissions?.query;
        if (q) {
          const [c, m] = await Promise.all([
            q({ name: "camera" as PermissionName }).catch(() => null),
            q({ name: "microphone" as PermissionName }).catch(() => null),
          ]);
          if (c) setPermCam(c.state);
          if (m) setPermMic(m.state);
        }
      } catch {}
    } catch {
      setNeedsPerm(true);
    }
  };

  useEffect(() => {
    refresh();
    const h = () => refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", h);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", h);
  }, []);

  useEffect(() => {
    onChange?.(choice);
  }, [choice, onChange]);

  const requestPerm = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      s.getTracks().forEach((t) => t.stop());
      refresh();
    } catch {}
  };

  const test = async () => {
    try {
      // stop previo: en móvil no existen front+back a la vez
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const s = await navigator.mediaDevices.getUserMedia({
        video: choice.cameraId
          ? { deviceId: { exact: choice.cameraId } }
          : { facingMode: choice.facing, width: { ideal: 1280 } },
        audio: choice.micId ? { deviceId: { exact: choice.micId } } : true,
      });
      streamRef.current = s;
      if (previewRef.current) {
        previewRef.current.srcObject = s;
        try {
          const anyEl = previewRef.current as HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };
          if (choice.speakerId && anyEl.setSinkId) await anyEl.setSinkId(choice.speakerId);
        } catch {}
        previewRef.current.play().catch(() => {});
      }
      refresh();
    } catch {}
  };

  const setFacing = (f: "user" | "environment") => {
    // Apagar antes de girar (iOS/Safari lo exige)
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setChoice((c) => ({ ...c, facing: f, cameraId: undefined }));
  };

  return (
    <div className="text-sm space-y-2 bg-zinc-900 border border-zinc-800 rounded p-3">
      <div className="font-bold">🎛 Dispositivos</div>
      <div className="flex gap-1 text-[11px]">
        <span className={`rounded px-1.5 py-0.5 ${permCam === "granted" ? "bg-green-800" : permCam === "denied" ? "bg-red-800" : "bg-zinc-700"}`}>Cam: {permCam}</span>
        <span className={`rounded px-1.5 py-0.5 ${permMic === "granted" ? "bg-green-800" : permMic === "denied" ? "bg-red-800" : "bg-zinc-700"}`}>Mic: {permMic}</span>
      </div>
      {(permCam === "denied" || permMic === "denied") && (
        <div className="text-[11px] bg-red-950 border border-red-800 rounded p-2">
          Permiso bloqueado: candado 🔒 → Permitir → Reintentar. El navegador no vuelve a preguntar solo.
        </div>
      )}
      {needsPerm && (
        <button onClick={requestPerm} className="text-xs bg-amber-700 rounded px-2 py-1">
          Dar permiso para listar cámaras/mics
        </button>
      )}
      <label className="block">
        <span className="text-xs text-zinc-400">Cámara</span>
        <select
          value={choice.cameraId || ""}
          onChange={(e) => setChoice((c) => ({ ...c, cameraId: e.target.value || undefined }))}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
        >
          <option value="">Auto ({choice.facing === "user" ? "frontal" : "trasera"})</option>
          {cams.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-zinc-400">Micrófono</span>
        <select
          value={choice.micId || ""}
          onChange={(e) => setChoice((c) => ({ ...c, micId: e.target.value || undefined }))}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
        >
          <option value="">Predeterminado</option>
          {mics.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || d.deviceId.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      {spks.length > 0 && (
        <label className="block">
          <span className="text-xs text-zinc-400">Salida</span>
          <select
            value={choice.speakerId || ""}
            onChange={(e) => setChoice((c) => ({ ...c, speakerId: e.target.value || undefined }))}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
          >
            <option value="">Predeterminada</option>
            {spks.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || d.deviceId.slice(0, 8)}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-1">
        <button onClick={() => setFacing("user")} className={`text-xs px-2 py-1 rounded ${choice.facing === "user" ? "bg-red-600" : "bg-zinc-800"}`}>
          Frontal
        </button>
        <button onClick={() => setFacing("environment")} className={`text-xs px-2 py-1 rounded ${choice.facing === "environment" ? "bg-red-600" : "bg-zinc-800"}`}>
          Trasera
        </button>
        <button onClick={test} className="text-xs px-2 py-1 rounded bg-zinc-700 ml-auto">
          Probar
        </button>
      </div>
      <video ref={previewRef} muted playsInline className="w-full aspect-video bg-black rounded" />
    </div>
  );
}
