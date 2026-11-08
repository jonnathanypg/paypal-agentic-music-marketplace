"use client";
import React, { useEffect, useRef, useState } from "react";

// WhepViewer — previsualiza un path MediaMTX vía WHEP (<500ms).
// src: base del path, ej. `/live-preview/live/sala1/movil-1` (sin /whep).
export default function WhepViewer({
  src,
  label,
  muted = true,
}: {
  src: string;
  label: string;
  muted?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"conectando" | "en vivo" | "reintentando" | "sin señal">("conectando");

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let cancelled = false;
    let retries = 0;

    const connect = async () => {
      try {
        setState(retries === 0 ? "conectando" : "reintentando");
        pc?.close();
        pc = new RTCPeerConnection();
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });
        const remoteStream = new MediaStream();
        pc.ontrack = (ev) => {
          if (ev.track) remoteStream.addTrack(ev.track);
          if (ev.streams && ev.streams[0]) {
            ev.streams[0].getTracks().forEach((t) => {
              if (!remoteStream.getTracks().some((x) => x.id === t.id)) {
                remoteStream.addTrack(t);
              }
            });
          }
          if (videoRef.current && !cancelled) {
            videoRef.current.srcObject = remoteStream;
            videoRef.current.play().catch(() => {});
            setState("en vivo");
          }
        };
        await pc.setLocalDescription(await pc.createOffer());
        await new Promise<void>((res) => {
          if (!pc || pc.iceGatheringState === "complete") return res();
          const to = setTimeout(() => res(), 2000);
          pc.addEventListener("icegatheringstatechange", () => {
            if (pc?.iceGatheringState === "complete") {
              clearTimeout(to);
              res();
            }
          });
        });
        if (cancelled) return;
        const resp = await fetch(`${src}/whep`, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: pc.localDescription?.sdp || "",
        });
        if (resp.status !== 201 && resp.status !== 200) throw new Error(`WHEP ${resp.status}`);
        await pc.setRemoteDescription({ type: "answer", sdp: await resp.text() });
      } catch {
        if (cancelled) return;
        retries += 1;
        setState("sin señal");
        // Reintento con backoff (el invitado puede estar reconectando)
        setTimeout(() => {
          if (!cancelled) connect();
        }, Math.min(5000, 1000 * retries));
      }
    };

    connect();
    return () => {
      cancelled = true;
      try {
        pc?.close();
      } catch {}
    };
  }, [src]);

  return (
    <div className="relative bg-black rounded overflow-hidden">
      <video ref={videoRef} muted={muted} playsInline className="w-full aspect-video object-contain" />
      <div className="absolute bottom-1 left-1 flex gap-1 items-center">
        <span className="text-[10px] bg-black/70 rounded px-1.5 py-0.5">{label}</span>
        <span
          className={`text-[10px] rounded px-1.5 py-0.5 ${
            state === "en vivo" ? "bg-green-700" : state === "sin señal" ? "bg-zinc-700" : "bg-amber-700"
          }`}
        >
          {state}
        </span>
      </div>
    </div>
  );
}
