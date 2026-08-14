import { describe, it, expect } from "vitest";
import { escapeFilename, displayName } from "../src/core/filename.ts";

describe("filename XSS 이스케이프", () => {
  it("악성 파일명 이스케이프", () => {
    const out = escapeFilename('<img onerror=alert(1)>.pdf');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });
  it("따옴표/앰퍼샌드 이스케이프", () => {
    expect(escapeFilename(`a"b'c&d`)).toBe("a&quot;b&#39;c&amp;d");
  });
  it("displayName은 경로 제거 후 basename만", () => {
    expect(displayName("/a/b/보고서.pdf")).toBe("보고서.pdf");
    expect(displayName("C:\\docs\\x.docx")).toBe("x.docx");
  });
  it("displayName도 이스케이프", () => {
    expect(displayName("<b>.pdf")).toContain("&lt;b&gt;");
  });
  it("빈 이름은 기본값", () => {
    expect(displayName("   ")).toBe("문서");
  });
});
