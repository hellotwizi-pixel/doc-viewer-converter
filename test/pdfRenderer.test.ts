import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as pdfjs from "pdfjs-dist";
import { loadPdf } from "../src/renderers/pdfRenderer.ts";

// Node/vitest에선 Vite의 ?url 워커 경로가 안 잡히므로 실제 워커 파일로 교체(같은 싱글턴).
beforeAll(() => {
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    join(__dirname, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs")
  ).href;
});

function fixture(name: string): ArrayBuffer {
  const b = readFileSync(join(__dirname, "fixtures", name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

describe("pdfRenderer (L2: 파싱/페이지수/텍스트레이어 — 픽셀은 E2E)", () => {
  it("정상 PDF → 페이지 수 + 텍스트레이어 non-empty", async () => {
    const pdf = await loadPdf(fixture("sample.pdf"));
    expect(pdf.numPages).toBe(1);
    const text = await pdf.getPageText(1);
    expect(text).toContain("Hello");
    await pdf.destroy();
  });

  it("내장 JS(/OpenAction) PDF도 스크립트 실행 없이 파싱 (isEvalSupported:false)", async () => {
    const g = globalThis as unknown as { __xss?: boolean };
    g.__xss = false;
    const pdf = await loadPdf(fixture("js.pdf"));
    expect(pdf.numPages).toBe(1);
    const text = await pdf.getPageText(1);
    expect(text).toContain("Hello");
    // 문서 내장 JS가 실행되지 않았다(우리 앱은 스크립팅을 호출하지 않음)
    expect(g.__xss).toBe(false);
    await pdf.destroy();
  });

  it("손상 PDF → 에러 throw", async () => {
    await expect(loadPdf(new TextEncoder().encode("%PDF-garbage").buffer)).rejects.toBeTruthy();
  });
});
