import type { Track } from "@/components/StreamPlayer";

const preloadedUrls = new Set<string>();
const warmAudioPool: HTMLAudioElement[] = [];
const MAX_POOL_SIZE = 4;

export function getAudioUrl(t: Track): string {
  if (!t?.file_path) return "";
  if (t.file_path.includes("media_library/")) {
    return t.file_path
      .substring(t.file_path.indexOf("media_library/"))
      .replace("media_library/", "/media-static/");
  }
  return t.file_path;
}

/**
 * Prefetches the audio of a track by warming up the initial buffer safely.
 * This primes the browser cache JIT (Just-In-Time) when the user hovers or touches a card.
 */
export function prefetchTrack(track: Track): void {
  if (typeof window === "undefined" || !track) return;
  const url = getAudioUrl(track);
  if (!url || preloadedUrls.has(url)) return;

  preloadedUrls.add(url);

  try {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "audio";
    link.href = url;
    document.head.appendChild(link);

    let audio: HTMLAudioElement;
    if (warmAudioPool.length < MAX_POOL_SIZE) {
      audio = new Audio();
      warmAudioPool.push(audio);
    } else {
      audio = warmAudioPool.shift()!;
      warmAudioPool.push(audio);
    }
    audio.preload = "auto";
    audio.src = url;
    audio.load();
  } catch (err) {
    console.warn("Failed to prefetch track:", err);
  }
}
