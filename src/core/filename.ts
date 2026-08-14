/**
 * filename — 수신 파일명을 UI에 안전하게 표시.
 * 파일명은 신뢰 불가 입력이다: `<img onerror=...>.pdf` 같은 이름으로 XSS가 가능하므로
 * DOM에 넣을 때는 반드시 textContent로 넣거나 이 함수로 이스케이프한다.
 */
export function escapeFilename(name: string): string {
  return name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 경로 구분자를 제거해 순수 표시용 basename을 만든다. */
export function displayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  return escapeFilename(base.trim() || "문서");
}
