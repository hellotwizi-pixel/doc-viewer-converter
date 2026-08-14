import { describe, it, expect } from "vitest";
import { renderPptx } from "../src/renderers/pptxRenderer.ts";
import { makePptx, makePptxWithImage, makeStoreZip } from "./util/zip.ts";

const enc = new TextEncoder();

function allText(slides: { shapes: { lines?: { text: string }[] }[]; flow: string[] }[]): string {
  return slides
    .map((s) => s.shapes.flatMap((sh) => (sh.lines ?? []).map((l) => l.text)).join(" ") + " " + s.flow.join(" "))
    .join(" ");
}

describe("pptxRenderer (시각 렌더: 위치 텍스트 + 이미지)", () => {
  it("슬라이드별 위치 있는 텍스트 도형 추출", async () => {
    const { slides, aspect } = await renderPptx(makePptx([["첫 슬라이드 제목", "본문 1"], ["둘째 슬라이드"]]));
    expect(slides.length).toBe(2);
    expect(aspect).toBeCloseTo(9144000 / 6858000, 3);
    const textShapes = slides[0].shapes.filter((s) => s.kind === "text");
    expect(textShapes.length).toBeGreaterThan(0);
    expect(textShapes[0].xPct).toBeGreaterThan(0); // 위치가 계산됨
    expect(allText(slides)).toContain("첫 슬라이드 제목");
    expect(allText(slides)).toContain("둘째 슬라이드");
  });

  it("이미지 슬라이드 → dataURL 이미지 도형", async () => {
    const { slides } = await renderPptx(makePptxWithImage());
    const img = slides[0].shapes.find((s) => s.kind === "image");
    expect(img).toBeTruthy();
    expect(img!.src).toMatch(/^data:image\/png;base64,/);
    expect(img!.wPct).toBeGreaterThan(0);
  });

  it("표시할 내용 없으면 폴백(unsupported)", async () => {
    const buf = makePptx([[]]);
    await expect(renderPptx(buf)).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("압축 폭탄 방어(공통 zip 가드 재사용)", async () => {
    const bomb = makeStoreZip([
      { name: "ppt/slides/slide1.xml", data: enc.encode("<a/>"), fakeUncompressed: 600 * 1024 * 1024 },
    ]);
    await expect(renderPptx(bomb)).rejects.toMatchObject({ kind: "zip_bomb" });
  });
});
