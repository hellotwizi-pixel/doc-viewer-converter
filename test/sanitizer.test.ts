import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "../src/core/sanitizer.ts";

/** 정화 결과를 DOM에 넣어 실제 위험 노드가 살아남는지 확인. */
function dom(html: string): HTMLDivElement {
  const d = document.createElement("div");
  d.innerHTML = sanitizeHtml(html);
  return d;
}

describe("sanitizer (DOMPurify config) — 보안 하드게이트", () => {
  it("script 태그 제거", () => {
    const d = dom('<p>hi</p><script>window.__x=1</script>');
    expect(d.querySelector("script")).toBeNull();
    expect(d.textContent).toContain("hi");
  });

  it("on* 이벤트 핸들러 제거", () => {
    const d = dom('<img src="data:image/png;base64,AAAA" onerror="alert(1)">');
    const img = d.querySelector("img");
    expect(img?.getAttribute("onerror")).toBeNull();
  });

  it("javascript: URL 차단", () => {
    const d = dom('<a href="javascript:alert(1)">x</a>');
    const a = d.querySelector("a");
    expect(a?.getAttribute("href") ?? "").not.toContain("javascript:");
  });

  it("data:image/svg+xml 차단 (SVG XSS 표면)", () => {
    const d = dom('<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">');
    const img = d.querySelector("img");
    // src가 제거되거나 이미지 자체가 사라져야 함
    expect(img?.getAttribute("src") ?? "").not.toContain("svg+xml");
  });

  it("data:text/html 차단", () => {
    const d = dom('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    const a = d.querySelector("a");
    expect(a?.getAttribute("href") ?? "").not.toContain("text/html");
  });

  it("허용 이미지 data URI(png)는 보존", () => {
    const d = dom('<img src="data:image/png;base64,iVBORw0KGgo=">');
    expect(d.querySelector("img")?.getAttribute("src")).toContain("data:image/png");
  });

  it("정상 서식(헤딩/굵게/표) 보존", () => {
    const d = dom("<h1>제목</h1><p><b>굵게</b></p><table><tr><td>셀</td></tr></table>");
    expect(d.querySelector("h1")?.textContent).toBe("제목");
    expect(d.querySelector("b")).not.toBeNull();
    expect(d.querySelector("td")?.textContent).toBe("셀");
  });

  it("알려진 XSS 벡터 목록 전부 무력화", () => {
    const vectors = [
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<iframe src="javascript:alert(1)">',
      '<body onload=alert(1)>',
      '<a href="jAvAsCrIpT:alert(1)">x</a>',
      '<math><mtext><script>alert(1)</script></mtext></math>',
      '<object data="javascript:alert(1)">',
    ];
    for (const v of vectors) {
      const out = sanitizeHtml(v);
      expect(out.toLowerCase()).not.toContain("javascript:");
      expect(out.toLowerCase()).not.toContain("onerror");
      expect(out.toLowerCase()).not.toContain("onload");
      expect(out.toLowerCase()).not.toContain("<script");
    }
  });
});
