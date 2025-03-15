// Service Worker for Spotify v3 - Caching strategy for Railway
const CACHE_NAME = 'spotify-v3-cache-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/main.js',
  '/static/js/modules/AudioPlayer.js',
  '/static/js/modules/PlaylistManager.js',
  '/static/js/modules/SongListManager.js',
  '/static/js/modules/UIManager.js',
  '/static/images/default.png',
  '/static/images/placeholder.png'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('[Service Worker] Installing Service Worker');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('[Service Worker] Activating Service Worker');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log('[Service Worker] Removing old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    })
  );
  
  return self.clients.claim();
});

// Fetch event - handle network requests with cache strategy
self.addEventListener('fetch', event => {
  const requestUrl = new URL(event.request.url);
  
  // Skip cross-origin requests
  if (requestUrl.origin !== location.origin) {
    return;
  }
  
  // Handle API endpoints differently
  if (requestUrl.pathname.startsWith('/api/')) {
    // For audio streams - cache first, then network
    if (requestUrl.pathname.startsWith('/api/stream/')) {
      event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
          return cache.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              console.log('[Service Worker] Serving cached audio:', requestUrl.pathname);
              return cachedResponse;
            }
            
            return fetch(event.request).then(networkResponse => {
              if (networkResponse.ok) {
                // Clone the response and cache it
                const clonedResponse = networkResponse.clone();
                cache.put(event.request, clonedResponse);
                console.log('[Service Worker] Caching new audio:', requestUrl.pathname);
              }
              return networkResponse;
            }).catch(error => {
              console.error('[Service Worker] Fetch failed:', error);
              // If fetch fails, we should have a custom offline response
              return new Response('Audio unavailable offline', {
                status: 503,
                statusText: 'Service Unavailable'
              });
            });
          });
        })
      );
      return;
    }
    
    // For thumbnails - cache first, then network
    if (requestUrl.pathname.startsWith('/api/thumbnail/')) {
      event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
          return cache.match(event.request).then(cachedResponse => {
            if (cachedResponse) {
              console.log('[Service Worker] Serving cached thumbnail:', requestUrl.pathname);
              return cachedResponse;
            }
            
            return fetch(event.request).then(networkResponse => {
              if (networkResponse.ok) {
                // Clone the response and cache it
                const clonedResponse = networkResponse.clone();
                cache.put(event.request, clonedResponse);
                console.log('[Service Worker] Caching new thumbnail:', requestUrl.pathname);
              }
              return networkResponse;
            }).catch(error => {
              console.error('[Service Worker] Thumbnail fetch failed:', error);
              // Return default image for offline use
              return caches.match('/static/images/default.png');
            });
          });
        })
      );
      return;
    }
  }
  
  // For other requests - network first, then cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful GET responses
        if (response.ok && event.request.method === 'GET') {
          const clonedResponse = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clonedResponse);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Return default HTML for root path when offline
          if (event.request.url.endsWith('/')) {
            return caches.match('/');
          }
          
          return new Response('Content not available offline', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
}); 