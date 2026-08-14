/**
 * sharedInbox — SW가 IndexedDB에 stash한 공유 파일을 꺼낸다(보너스 경로).
 * 실패해도 앱은 파일피커로 정상 동작한다.
 */
export function takeSharedFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const open = indexedDB.open("doc-viewer-share", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("inbox");
    open.onerror = () => resolve(null);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("inbox", "readwrite");
      const store = tx.objectStore("inbox");
      const getReq = store.get("shared");
      getReq.onsuccess = () => {
        const val = getReq.result as File | undefined;
        store.delete("shared");
        resolve(val ?? null);
      };
      getReq.onerror = () => resolve(null);
    };
  });
}
