"use client";
import React, { useEffect, useRef, useState } from "react";

// Teleprompter — overlay HTML sobre el preview del director.
// NO sale al program salvo que se active como fuente. Control teclado/espacio.
export default function Teleprompter({
  initialText = "Bienvenidos al en vivo…\nHabla despacio, mira a cámara.",
  onClose,
}: {
  initialText?: string;
  onClose?: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(40); // px/s
  const [size, setSize] = useState(28);
  const [mirror, setMirror] = useState(false);
  const [edit, setEdit] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const offRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      if (running && !edit && boxRef.current) {
        offRef.current += speed * dt;
        const max = boxRef.current.scrollHeight - boxRef.current.clientHeight;
        if (offRef.current >= max) offRef.current = 0;
        boxRef.current.scrollTop = offRef.current;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const key = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setRunning((r) => !r);
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", key);
    };
  }, [running, edit, speed]);

  return (
    <div className="bg-black/90 border border-zinc-700 rounded p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <b>📜 Teleprompter</b>
        <span className="text-[11px] text-zinc-500">(solo director · espacio = pausa)</span>
        <button onClick={() => setRunning((r) => !r)} className="ml-auto text-xs bg-zinc-700 rounded px-2 py-1">
          {running ? "Pausar" : "Seguir"}
        </button>
        <button onClick={() => setEdit((e) => !e)} className="text-xs bg-zinc-700 rounded px-2 py-1">
          {edit ? "Ver" : "Editar"}
        </button>
        {onClose && (
          <button onClick={onClose} className="text-xs text-red-400 px-1">
            ✕
          </button>
        )}
      </div>
      {edit ? (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full h-32 bg-zinc-900 border border-zinc-700 rounded p-2"
        />
      ) : (
        <div
          ref={boxRef}
          className="h-48 overflow-hidden rounded bg-zinc-950 p-4 leading-relaxed whitespace-pre-wrap"
          style={{ fontSize: size, transform: mirror ? "scaleX(-1)" : undefined }}
        >
          {text}
        </div>
      )}
      <div className="flex gap-3 mt-2 text-xs items-center">
        <label>
          Vel. <input type="range" min={10} max={150} value={speed} onChange={(e) => setSpeed(+e.target.value)} />
        </label>
        <label>
          Tamaño <input type="range" min={16} max={56} value={size} onChange={(e) => setSize(+e.target.value)} />
        </label>
        <label className="flex gap-1 items-center">
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Espejo
        </label>
      </div>
    </div>
  );
}
