import { describe, it, expect, beforeEach } from "vitest";
import { shouldConvert, getConverterUrl } from "../src/convert/converter.ts";

// jsdom 구성에 따라 localStorage가 없을 수 있어 결정적 스텁을 심는다.
function installStorage(): void {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
      clear: () => store.clear(),
    },
  });
}

describe("converter 설정", () => {
  beforeEach(() => {
    installStorage();
    delete (window as unknown as { __CONVERTER_URL?: string }).__CONVERTER_URL;
  });

  it("변환 대상 확장자만 true", () => {
    expect(shouldConvert("pptx")).toBe(true);
    expect(shouldConvert("hwp")).toBe(true);
    expect(shouldConvert("hwpx")).toBe(true);
    expect(shouldConvert("doc")).toBe(true);
    expect(shouldConvert("ppt")).toBe(true);
    expect(shouldConvert("pdf")).toBe(false);
    expect(shouldConvert("docx")).toBe(false);
  });

  it("URL 우선순위: 네이티브 > localStorage > 없음", () => {
    expect(getConverterUrl()).toBe("");
    window.localStorage.setItem("converterUrl", "https://ls.example");
    expect(getConverterUrl()).toBe("https://ls.example");
    (window as unknown as { __CONVERTER_URL?: string }).__CONVERTER_URL = "https://native.example";
    expect(getConverterUrl()).toBe("https://native.example");
  });
});
