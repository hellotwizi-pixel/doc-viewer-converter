import { describe, it, expect } from "vitest";
import { assertOpenable, toViewerError, userMessage, ViewerError, MAX_FILE_BYTES } from "../src/core/errors.ts";

describe("errors", () => {
  it("빈 파일 → empty", () => {
    expect(() => assertOpenable(0)).toThrow(ViewerError);
    try {
      assertOpenable(0);
    } catch (e) {
      expect((e as ViewerError).kind).toBe("empty");
    }
  });
  it("상한 초과 → too_large", () => {
    try {
      assertOpenable(MAX_FILE_BYTES + 1);
    } catch (e) {
      expect((e as ViewerError).kind).toBe("too_large");
    }
  });
  it("정상 크기는 통과", () => {
    expect(() => assertOpenable(1000)).not.toThrow();
  });
  it("일반 예외 → corrupt로 정규화", () => {
    expect(toViewerError(new Error("boom")).kind).toBe("corrupt");
    expect(toViewerError("x").kind).toBe("corrupt");
  });
  it("ViewerError는 그대로 보존", () => {
    const e = new ViewerError("unsupported");
    expect(toViewerError(e)).toBe(e);
  });
  it("unsupported 안내 문구에 한컴뷰어 언급", () => {
    expect(userMessage(new ViewerError("unsupported"))).toContain("한컴");
  });
});
