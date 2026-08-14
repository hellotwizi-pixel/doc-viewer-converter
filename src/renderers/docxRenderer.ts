/**
 * docxRenderer — DOCX(ArrayBuffer) → 안전 HTML.
 * 파이프라인: zip 안전검사(폭탄/XXE) → mammoth 변환 → DOMPurify 정화.
 * raw HTML이 정화를 우회해 DOM에 들어가지 않도록, 반드시 sanitizeHtml을 거친 문자열만 반환한다.
 */
import mammoth from "mammoth";
import { sanitizeHtml } from "../core/sanitizer.ts";
import { guardDocxZip } from "../core/zipGuard.ts";
import { toViewerError } from "../core/errors.ts";

export interface DocxResult {
  html: string; // 이미 정화됨
  messages: string[];
}

export async function renderDocx(buf: ArrayBuffer): Promise<DocxResult> {
  try {
    await guardDocxZip(buf); // 폭탄/XXE 가드 (위반 시 ViewerError throw)
    // 브라우저 빌드는 arrayBuffer, Node 빌드는 buffer 키를 읽는다 → 둘 다 제공
    const { value, messages } = await mammoth.convertToHtml({
      arrayBuffer: buf,
      buffer: new Uint8Array(buf),
    } as { arrayBuffer: ArrayBuffer });
    const html = sanitizeHtml(value);
    return { html, messages: messages.map((m) => m.message) };
  } catch (e) {
    throw toViewerError(e);
  }
}

/** DOM에 안전하게 주입: 정화된 HTML만 innerHTML로 넣는다. */
export function mountDocx(container: HTMLElement, result: DocxResult): void {
  container.innerHTML = result.html;
}
