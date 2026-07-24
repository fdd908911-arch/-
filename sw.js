"use strict";

const CACHE_PREFIX = "maneo-shell-";
const CACHE_NAME = `${CACHE_PREFIX}20260724-v87-volo-decline`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./chat.html",
  "./router.html",
  "./diary.html",
  "./memory.html",
  "./dream.html",
  "./connect.html",
  "./volo-status.html",
  "./world.html",
  "./inside.html",
  "./reading.html",
  "./reading-app/",
  "./manifest.webmanifest",
  "./styles.css",
  "./home.css",
  "./home-ins.css",
  "./chat-navigation.css",
  "./chat-views.css?v=20260724-terminal-restore-v1",
  "./chat-hub.css",
  "./router.css",
  "./ccc-sessions.css",
  "./diary.css",
  "./memory.css",
  "./status.css",
  "./drives-dashboard.css?v=20260721-drives-v3",
  "./world.css",
  "./clawd-pet.css",
  "./volo-call.css?v=20260724-volo-decline-v1",
  "./home.js",
  "./app.js",
  "./core/ccc-runtime.js?v=20260721-core-v1",
  "./ccc-api.js?v=20260724-thinking-v1",
  "./router.js",
  "./group.js",
  "./features/volo-media-status.js?v=20260724-voice-input-v1",
  "./features/volo-music.js?v=20260721-music-split-v2",
  "./features/volo-chat.js?v=20260724-live-call-v1",
  "./features/volo-composer.js?v=20260721-composer-split-v1",
  "./features/volo-sessions.js?v=20260724-session-clean-v1",
  "./features/volo-drawer.js?v=20260721-drawer-split-v1",
  "./features/volo-carrier.js?v=20260724-carrier-clean-v1",
  "./features/volo-voice.js?v=20260724-voice-input-v1",
  "./features/volo-usage.js?v=20260721-usage-split-v1",
  "./volo.js?v=20260724-volo-decline-v1",
  "./volo-call.js?v=20260724-volo-decline-v1",
  "./volo-ui-bridge.js?v=20260724-no-emoji-v1",
  "./memory-dashboard.js",
  "./status.js",
  "./drives-dashboard.js?v=20260721-drives-v3",
  "./world.js",
  "./terminal.js?v=20260724-terminal-restore-v1",
  "./volo-settings.js?v=20260724-terminal-entry-v1",
  "./diary.js",
  "./clawd-pet.js",
  "./pwa.css",
  "./pwa.js",
  "./assets/icons/icon-180.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
];

// A missing optional page or image should not prevent a new worker from
// installing. These files are the minimum useful offline entry point.
const CORE_SHELL = ["./", "./index.html", "./manifest.webmanifest"];
const OPTIONAL_SHELL = APP_SHELL.filter((asset) => !CORE_SHELL.includes(asset));

const API_PATHS = [
  "/hui-router/",
  "/hui-api/",
  "/ccc-api",
  "/api/voice/",
  "/api/music/",
  "/sessions",
  "/chat/",
  "/v1/thinking",
  "/volo/",
  "/tmux/",
  "/group/",
  "/diary/",
  "/health",
  "/settings",
  "/attachments/",
  "/tasks",
  "/usage"
];

function pathInsideScope(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return url.pathname;
  return `/${url.pathname.slice(scopePath.length)}`;
}

function isApiRequest(request, url) {
  // Authenticated requests are always live data, regardless of which URL
  // prefix a deployment uses for the API.
  if (request.headers.has("X-Auth-Token")) return true;
  const path = pathInsideScope(url);
  return API_PATHS.some((prefix) => path === prefix || path.startsWith(prefix));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(CORE_SHELL);
        const results = await Promise.allSettled(
          OPTIONAL_SHELL.map(async (asset) => {
            const request = new Request(asset, { cache: "reload" });
            const response = await fetch(request);
            if (!response.ok) {
              throw new Error(`${asset} returned HTTP ${response.status}`);
            }
            await cache.put(request, response);
          })
        );
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            console.warn("Optional app shell asset was not cached", OPTIONAL_SHELL[index], result.reason);
          }
        });
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { type: "incoming_call", opening: event.data ? event.data.text() : "" };
  }
  if (payload.type !== "incoming_call") return;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    windows.forEach((client) => {
      client.postMessage({ type: "VOLO_INCOMING_CALL", call: payload });
    });
    const callId = String(payload.call_id || "");
    const targetUrl = new URL(`./chat.html?incoming_call=${encodeURIComponent(callId)}#volo`, self.registration.scope).href;
    await self.registration.showNotification("Volo 来电", {
      body: String(payload.opening || "想听听你的声音。"),
      tag: `volo-call-${callId || "latest"}`,
      renotify: true,
      requireInteraction: true,
      silent: false,
      icon: "./assets/icons/icon-192.png",
      badge: "./assets/icons/icon-192.png",
      data: { type: "incoming_call", call: payload, url: targetUrl }
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  if (data.type !== "incoming_call") return;
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const chatClient = windows.find((client) => client.url.includes("/chat.html"));
    if (chatClient) {
      chatClient.postMessage({ type: "VOLO_INCOMING_CALL", call: data.call || {} });
      await chatClient.focus();
      return;
    }
    await self.clients.openWindow(data.url || "./chat.html#volo");
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isApiRequest(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          const home = await caches.match("./index.html");
          if (home) return home;
          return new Response("洄·Maneo 当前处于离线状态，请联网后重试。", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        })
    );
    return;
  }

  // Prefer the network for versioned app assets so an installed PWA cannot
  // keep serving an older CSS/JS file merely because ignoreSearch matched it.
  // The cached shell remains the offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type !== "opaque") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
