/**
 * converter — PPT/HWP 등을 변환 서버로 보내 PDF로 받아온다(원본 충실도).
 * 변환 서버 URL이 설정돼 있을 때만 사용하고, 없거나 실패하면 호출 측이 클라이언트 렌더러로 폴백한다.
 * URL 우선순위: 네이티브 주입(window.__CONVERTER_URL) > localStorage > 빌드 env(VITE_CONVERTER_URL).
 */
import { toViewerError } from "../core/errors.ts";

export function getConverterUrl(): string {
  const w = window as unknown as { __CONVERTER_URL?: string };
  if (w.__CONVERTER_URL) return w.__CONVERTER_URL;
  try {
    const ls = window.localStorage.getItem("converterUrl");
    if (ls) return ls;
  } catch {
    /* ignore */
  }
  return (import.meta.env?.VITE_CONVERTER_URL as string) || "";
}

/** 변환 서버가 다룰 수 있는(=변환 이점이 있는) 확장자. */
export function shouldConvert(ext: string): boolean {
  // xlsx는 자체 표 렌더가 더 유용 → 변환 대상에서 제외. 구형 xls는 변환.
  return ["pptx", "ppt", "hwp", "hwpx", "doc", "xls"].includes(ext);
}

/** 파일을 변환 서버에 보내 PDF ArrayBuffer로 받는다. 실패 시 throw. */
export async function convertToPdf(file: File, baseUrl: string): Promise<ArrayBuffer> {
  try {
    const res = await fetch(baseUrl.replace(/\/$/, "") + "/convert", {
      method: "POST",
      headers: { "X-Filename": encodeURIComponent(file.name) || "doc", "Content-Type": "application/octet-stream" },
      body: file,
    });
    if (!res.ok) throw new Error(`convert http ${res.status}`);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 5) throw new Error("empty pdf");
    return buf;
  } catch (e) {
    throw toViewerError(e);
  }
}
