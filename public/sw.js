const CACHE_NAME = 'mediasuite-audio-cache-v2';
const PREFETCH_CACHE_NAME = 'mediasuite-audio-prefetch-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Helper to determine if it is an audio file request
const isAudioRequest = (url) => {
  return url.pathname.includes('/media-static/') && (url.pathname.endsWith('.mp3') || url.pathname.endsWith('.wav'));
};

// Handle standard Range requests from Cache Storage (Crucial for iOS Safari / Chrome Mobile)
const handleRangeRequest = async (request, cacheName) => {
  const cache = await caches.open(cacheName);
  let cachedResponse = await cache.match(request.url, { ignoreSearch: true });

  const rangeHeader = request.headers.get('Range');

  // Si no está en caché, si es un Range request, hacer bypass directo a la red sin bloquear
  // esperando la descarga del archivo completo en memoria.
  if (!cachedResponse) {
    if (rangeHeader) {
      // Disparar prefetch en segundo plano para las siguientes peticiones sin demorar el stream inicial
      fetch(request.url, { mode: 'cors' }).then(async (netRes) => {
        if (netRes.ok) {
          const c = await caches.open(cacheName);
          await c.put(request.url, netRes);
        }
      }).catch(() => {});
      return fetch(request);
    }

    try {
      const networkResponse = await fetch(request);
      if (networkResponse.ok) {
        await cache.put(request.url, networkResponse.clone());
        return networkResponse;
      }
      return networkResponse;
    } catch (err) {
      return fetch(request);
    }
  }

  if (!rangeHeader) {
    return cachedResponse;
  }

  const bytesMatch = rangeHeader.match(/^bytes=(\d+)-(\d+)?$/);
  if (!bytesMatch) {
    return cachedResponse;
  }

  const blob = await cachedResponse.blob();
  const fileLength = blob.size;
  const start = parseInt(bytesMatch[1], 10);
  const end = bytesMatch[2] ? parseInt(bytesMatch[2], 10) : fileLength - 1;

  const slicedBlob = blob.slice(start, end + 1, blob.type);
  
  return new Response(slicedBlob, {
    status: 206,
    statusText: 'Partial Content',
    headers: new Headers({
      'Content-Type': blob.type || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${fileLength}`,
      'Content-Length': String(slicedBlob.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000',
      'Access-Control-Allow-Origin': '*'
    })
  });
};

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isAudioRequest(url)) {
    event.respondWith(
      handleRangeRequest(event.request, CACHE_NAME).catch(() => fetch(event.request))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'PREFETCH_TRACKS') {
    const urls = event.data.urls || [];
    event.waitUntil(
      caches.open(PREFETCH_CACHE_NAME).then((cache) => {
        return Promise.all(
          urls.map(async (url) => {
            const hasStandard = await caches.open(CACHE_NAME).then(c => c.match(url));
            const hasPrefetch = await cache.match(url);
            if (hasStandard || hasPrefetch) return;

            try {
              const res = await fetch(new Request(url, {
                headers: new Headers({ 'Range': 'bytes=0-262143' })
              }));
              if (res.status === 206 || res.ok) {
                await cache.put(url, res);
              }
            } catch (e) {
              console.warn('Failed to prefetch track:', url, e);
            }
          })
        );
      })
    );
  }
});
