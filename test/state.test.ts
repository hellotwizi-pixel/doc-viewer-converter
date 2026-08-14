import { describe, it, expect } from "vitest";
import { transition, initialState } from "../src/core/state.ts";
import { ViewerError } from "../src/core/errors.ts";

describe("state machine (3상태, 편집 상태 없음)", () => {
  it("초기 상태는 fileselect", () => {
    expect(initialState().name).toBe("fileselect");
  });
  it("OPEN → viewport", () => {
    const s = transition(initialState(), { type: "OPEN", kind: "pdf", filename: "a.pdf" });
    expect(s.name).toBe("viewport");
    if (s.name === "viewport") expect(s.kind).toBe("pdf");
  });
  it("viewport에서 CLOSE → fileselect", () => {
    let s = transition(initialState(), { type: "OPEN", kind: "docx", filename: "a.docx" });
    s = transition(s, { type: "CLOSE" });
    expect(s.name).toBe("fileselect");
  });
  it("어느 상태에서든 FAIL → error", () => {
    const err = new ViewerError("corrupt");
    const s = transition(initialState(), { type: "FAIL", error: err, filename: "x" });
    expect(s.name).toBe("error");
    if (s.name === "error") expect(s.error.kind).toBe("corrupt");
  });
  it("error에서 RETRY → fileselect", () => {
    let s = transition(initialState(), { type: "FAIL", error: new ViewerError("empty") });
    s = transition(s, { type: "RETRY" });
    expect(s.name).toBe("fileselect");
  });
});
