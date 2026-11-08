// WhipPublisher — publica un MediaStream a MediaMTX vía WHIP (POST SDP).
// Sin dependencias: fetch nativo. Códecs negociados por el navegador (H264+Opus).
export class WhipPublisher {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;

  async publish(stream: MediaStream, whipUrl: string): Promise<RTCPeerConnection> {
    this.stop();
    this.stream = stream;
    const pc = new RTCPeerConnection();
    this.pc = pc;
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((res) => {
      if (pc.iceGatheringState === "complete") return res();
      const to = setTimeout(() => res(), 2500);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(to);
          res();
        }
      });
    });
    const resp = await fetch(whipUrl, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription?.sdp || "",
    });
    if (resp.status !== 201 && resp.status !== 200) {
      throw new Error(`WHIP ${resp.status}: MediaMTX no aceptó la publicación`);
    }
    await pc.setRemoteDescription({ type: "answer", sdp: await resp.text() });
    return pc;
  }

  stop() {
    try {
      this.pc?.close();
    } catch {}
    this.pc = null;
    this.stream = null;
  }

  get connection(): RTCPeerConnection | null {
    return this.pc;
  }
}
