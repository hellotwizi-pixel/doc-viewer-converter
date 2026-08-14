/**
 * pdfRenderer — PDF(ArrayBuffer) → 페이지 캔버스 렌더.
 * 보안: 내장 JS/실행 액션 비활성(isEvalSupported:false), 폼/스크립트 미실행.
 * 파싱/텍스트레이어 로직은 jsdom 단위테스트, 픽셀 렌더는 Playwright(실브라우저)에서 검증.
 */
import * as pdfjs from "pdfjs-dist";
// Vite: 워커를 URL로 번들
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { toViewerError, ViewerError } from "../core/errors.ts";

pdfjs.GlobalWorkerOptions.workerSrc = PdfWorker;

export interface LoadedPdf {
  numPages: number;
  getPageText(pageNum: number): Promise<string>;
  pageSize(pageNum: number): Promise<{ width: number; height: number }>;
  renderPage(pageNum: number, canvas: HTMLCanvasElement, scale: number): Promise<void>;
  destroy(): Promise<void>;
}

export async function loadPdf(buf: ArrayBuffer): Promise<LoadedPdf> {
  try {
    const task = pdfjs.getDocument({
      data: new Uint8Array(buf),
      // --- 보안 config ---
      isEvalSupported: false, // 내장 JS eval 금지
      disableAutoFetch: true,
      disableRange: false,
      // 스크립팅/외부 액션 비활성: 문서의 openAction/JS는 처리하지 않음
    });
    const doc = await task.promise;

    return {
      numPages: doc.numPages,
      async getPageText(pageNum: number): Promise<string> {
        const page = await doc.getPage(pageNum);
        const content = await page.getTextContent();
        return content.items.map((it) => ("str" in it ? it.str : "")).join(" ").trim();
      },
      async pageSize(pageNum: number): Promise<{ width: number; height: number }> {
        const page = await doc.getPage(pageNum);
        const vp = page.getViewport({ scale: 1 });
        return { width: vp.width, height: vp.height };
      },
      async renderPage(pageNum: number, canvas: HTMLCanvasElement, scale = 1.5): Promise<void> {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new ViewerError("unknown", "canvas 2d context 없음");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      },
      async destroy(): Promise<void> {
        await doc.destroy();
      },
    };
  } catch (e) {
    throw toViewerError(e);
  }
}
