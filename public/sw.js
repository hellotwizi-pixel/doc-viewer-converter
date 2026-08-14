/* doc-viewer service worker
 * 1) 앱 셸(HTML/CSS/JS)만 오프라인 캐시. 문서 바이트는 절대 캐시하지 않는다(프라이버시).
 * 2) Share Target(POST): 카톡 등에서 공유된 파일을 IndexedDB에 잠시 stash한 뒤
 *    앱으로 redirect한다. 문서는 서버로 보내지 않는다.
 */
const SHELL_CACHE = "shell-v1";
const SHELL_ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// --- Share Target: 공유된 파일을 IndexedDB에 stash ---
function idbPut(file) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("doc-viewer-share", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("inbox");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("inbox", "readwrite");
      tx.objectStore("inbox").put(file, "shared");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    };
  });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Share Target POST → stash 후 redirect
  if (event.request.method === "POST" && url.searchParams.get("share") === "1") {
    event.respondWith(
      (async () => {
        try {
          const form = await event.request.formData();
          const file = form.get("file");
          if (file && file instanceof File) await idbPut(file);
        } catch (_e) {
          /* 보너스 경로 — 실패해도 앱은 파일피커로 동작 */
        }
        return Response.redirect("./?share=1", 303);
      })()
    );
    return;
  }

  // GET 앱 셸: 캐시 우선, 없으면 네트워크 (문서 데이터는 캐시하지 않음)
  if (event.request.method === "GET" && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit || fetch(event.request))
    );
  }
});
