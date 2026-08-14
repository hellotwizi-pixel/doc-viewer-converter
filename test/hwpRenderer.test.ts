import { describe, it, expect } from "vitest";
import { renderHwp } from "../src/renderers/hwpRenderer.ts";
import { readCfbStream, isCfb } from "../src/core/cfb.ts";
import { makeHwpx } from "./util/zip.ts";
import { makeCfbWithPrvText } from "./util/cfb.ts";

describe("hwpRenderer — hwpx 텍스트 경로", () => {
  it("hwpx 섹션 문단 추출", async () => {
    const buf = makeHwpx(["한글 문서 제목", "본문 문단입니다"]);
    const r = await renderHwp(buf);
    expect(r.kind).toBe("hwpx");
    expect(r.paragraphs).toContain("한글 문서 제목");
    expect(r.paragraphs).toContain("본문 문단입니다");
  });

  it("텍스트 없는 hwpx → 폴백(unsupported)", async () => {
    const buf = makeHwpx([]);
    await expect(renderHwp(buf)).rejects.toMatchObject({ kind: "unsupported" });
  });
});

describe("cfb — 바이너리 .hwp PrvText 경로", () => {
  it("isCfb 감지", () => {
    expect(isCfb(makeCfbWithPrvText("미리보기"))).toBe(true);
    expect(isCfb(new TextEncoder().encode("PK not cfb").buffer)).toBe(false);
  });

  it("PrvText 미니 스트림 왕복 추출", () => {
    const bytes = readCfbStream(makeCfbWithPrvText("안녕 한글"), "PrvText");
    expect(bytes).not.toBeNull();
    const text = new TextDecoder("utf-16le").decode(bytes!);
    expect(text.startsWith("안녕 한글")).toBe(true);
  });

  it("renderHwp가 바이너리 .hwp PrvText를 읽어 문단화", async () => {
    const r = await renderHwp(makeCfbWithPrvText("계약서 미리보기"));
    expect(r.kind).toBe("hwp");
    expect(r.paragraphs.join(" ")).toContain("계약서 미리보기");
  });

  it("PrvText 없는(=비CFB) 입력 → 폴백", async () => {
    await expect(renderHwp(new TextEncoder().encode("garbage").buffer)).rejects.toBeTruthy();
  });
});
