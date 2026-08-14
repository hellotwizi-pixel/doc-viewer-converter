import { describe, it, expect } from "vitest";
import { routeFile, extensionOf } from "../src/core/router.ts";

describe("router", () => {
  it("확장자로 라우팅", () => {
    expect(routeFile("a.pdf")).toBe("pdf");
    expect(routeFile("보고서.docx")).toBe("docx");
  });
  it("PPTX/HWP/HWPX/XLSX는 각 렌더러로 라우팅", () => {
    expect(routeFile("발표.pptx")).toBe("pptx");
    expect(routeFile("문서.hwp")).toBe("hwp");
    expect(routeFile("문서.hwpx")).toBe("hwp");
    expect(routeFile("표.xlsx")).toBe("xlsx");
    expect(routeFile("data.csv")).toBe("csv");
    expect(routeFile("x", "text/csv")).toBe("csv");
  });
  it("구형 바이너리(.doc/.ppt)는 미지원(폴백)", () => {
    expect(routeFile("old.doc")).toBe("unsupported");
    expect(routeFile("old.ppt")).toBe("unsupported");
  });
  it("MIME으로 pptx/hwp 보강", () => {
    expect(routeFile("noext", "application/vnd.openxmlformats-officedocument.presentationml.presentation")).toBe("pptx");
    expect(routeFile("noext", "application/x-hwp")).toBe("hwp");
  });
  it("대문자 확장자 처리", () => {
    expect(routeFile("A.PDF")).toBe("pdf");
    expect(routeFile("B.DocX")).toBe("docx");
  });
  it("확장자 없으면 MIME으로 보강", () => {
    expect(routeFile("noext", "application/pdf")).toBe("pdf");
    expect(
      routeFile("noext", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    ).toBe("docx");
    expect(routeFile("noext", "application/pdf; charset=binary")).toBe("pdf");
  });
  it("알 수 없는 타입은 unsupported", () => {
    expect(routeFile("x.zip")).toBe("unsupported");
    expect(routeFile("x", "application/octet-stream")).toBe("unsupported");
    expect(routeFile("x")).toBe("unsupported");
  });
  it("extensionOf 경계", () => {
    expect(extensionOf("a.b.pdf")).toBe("pdf");
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf("trailingdot.")).toBe("");
    expect(extensionOf("/path/to/file.DOCX")).toBe("docx");
  });
});
