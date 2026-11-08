"use client";

import type { Track } from "@/components/StreamPlayer";

export interface UserHistory {
  plays: Record<number, number>;
  genres: Record<string, number>;
  artists: Record<string, number>;
  albums: Record<string, number>;
  addedToPlaylist: number[];
  listenTime: Record<number, number>;
}

const HISTORY_KEY = "mediasuite_recommender_history";

// Helper to get or initialize local history
export function getUserHistory(): UserHistory {
  if (typeof window === "undefined") {
    return { plays: {}, genres: {}, artists: {}, albums: {}, addedToPlaylist: [], listenTime: {} };
  }
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        plays: parsed.plays || {},
        genres: parsed.genres || {},
        artists: parsed.artists || {},
        albums: parsed.albums || {},
        addedToPlaylist: parsed.addedToPlaylist || [],
        listenTime: parsed.listenTime || {},
      };
    }
  } catch {}
  return { plays: {}, genres: {}, artists: {}, albums: {}, addedToPlaylist: [], listenTime: {} };
}

// Helper to save local history
export function saveUserHistory(history: UserHistory) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

// Track a play event
export function logTrackPlay(track: Track) {
  const history = getUserHistory();
  
  // Increment play count
  history.plays[track.id] = (history.plays[track.id] || 0) + 1;
  
  // Track genre
  if (track.genre) {
    history.genres[track.genre] = (history.genres[track.genre] || 0) + 1;
  }
  
  // Track artist/creator
  const artist = track.creator || track.artist;
  if (artist) {
    history.artists[artist] = (history.artists[artist] || 0) + 1;
  }
  
  // Track album
  if (track.album) {
    history.albums[track.album] = (history.albums[track.album] || 0) + 1;
  }
  
  saveUserHistory(history);
}

// Track listening time duration
export function logTrackListenTime(trackId: number, durationSeconds: number) {
  const history = getUserHistory();
  history.listenTime[trackId] = (history.listenTime[trackId] || 0) + durationSeconds;
  saveUserHistory(history);
}

// Track addition to playlist
export function logTrackAddedToPlaylist(trackId: number) {
  const history = getUserHistory();
  if (!history.addedToPlaylist.includes(trackId)) {
    history.addedToPlaylist.push(trackId);
    saveUserHistory(history);
  }
}

// Seeded pseudo-random generator to ensure consistent flow per 12-hour window
function seededRandom(seed: number) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function get12HourSeed(): number {
  // Changes every 12 hours
  return Math.floor(Date.now() / (12 * 60 * 60 * 1000));
}

// Get next track in catalog based on history and seeded random flow
export function getNextRecommendedTrack(
  currentTrackId: number,
  catalog: Track[],
  isAuthenticated: boolean
): Track {
  if (!catalog.length) {
    throw new Error("Catalog is empty");
  }
  
  const history = getUserHistory();
  const seed = get12HourSeed();
  
  // Filter out current track if catalog size allows it
  const eligibleTracks = catalog.filter(t => t.id !== currentTrackId);
  const candidates = eligibleTracks.length > 0 ? eligibleTracks : catalog;

  // Let's compute weights for all candidates
  const scored = candidates.map((track, index) => {
    // 1. Initial order based on seeded random (public 12-hour flow)
    const baseRandomVal = seededRandom(seed + track.id + index);
    let score = baseRandomVal * 10;
    
    // 2. Personalization based on local user interaction
    const totalPlays = Object.values(history.plays).reduce((a, b) => a + b, 0) || 1;
    
    // Genre boost
    if (track.genre && history.genres[track.genre]) {
      const genreAffinity = history.genres[track.genre] / totalPlays;
      score += genreAffinity * 15; // Up to +15 score points
    }
    
    // Creator/Artist boost
    const artist = track.creator || track.artist;
    if (artist && history.artists[artist]) {
      const artistAffinity = history.artists[artist] / totalPlays;
      score += artistAffinity * 20; // Up to +20 points
    }
    
    // Album boost
    if (track.album && history.albums[track.album]) {
      const albumAffinity = history.albums[track.album] / totalPlays;
      score += albumAffinity * 10; // Up to +10 points
    }
    
    // Playlist additions boost
    if (history.addedToPlaylist.includes(track.id)) {
      score += 12;
    }
    
    // Play frequency boost (but penalize if played too recently or too much to keep it fresh)
    const playCount = history.plays[track.id] || 0;
    if (playCount > 0) {
      // Repeat listen is positive, but want to keep the next recommendation fresh
      score += Math.min(playCount, 5) * 2;
    }

    // Match metadata similarity to current track
    const currentTrack = catalog.find(t => t.id === currentTrackId);
    if (currentTrack) {
      if (track.genre === currentTrack.genre) score += 8;
      if ((track.creator || track.artist) === (currentTrack.creator || currentTrack.artist)) score += 10;
    }

    return { track, score };
  });

  // Sort by highest score descending
  scored.sort((a, b) => b.score - a.score);
  return scored[0].track;
}

// Generate an array of recommendations for the specific user
export function getUserRecommendations(catalog: Track[], limit: number = 20): Track[] {
  if (!catalog.length) return [];
  
  const history = getUserHistory();
  const totalPlays = Object.values(history.plays).reduce((a, b) => a + b, 0) || 1;
  const seed = get12HourSeed();

  const scored = catalog.map((track, index) => {
    // Base seeded random
    const baseRandomVal = seededRandom(seed + track.id + index + 999);
    let score = baseRandomVal * 5;
    
    // Genre affinity
    if (track.genre && history.genres[track.genre]) {
      score += (history.genres[track.genre] / totalPlays) * 20;
    }
    
    // Creator affinity
    const artist = track.creator || track.artist;
    if (artist && history.artists[artist]) {
      score += (history.artists[artist] / totalPlays) * 25;
    }
    
    // Album affinity
    if (track.album && history.albums[track.album]) {
      score += (history.albums[track.album] / totalPlays) * 15;
    }
    
    // Saved in playlist
    if (history.addedToPlaylist.includes(track.id)) {
      score += 15;
    }
    
    // Play count
    const playCount = history.plays[track.id] || 0;
    if (playCount > 0) {
      score += Math.min(playCount, 8) * 3;
    }
    
    return { track, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(item => item.track);
}
