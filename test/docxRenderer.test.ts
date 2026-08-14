import { describe, it, expect } from "vitest";
import { renderDocx } from "../src/renderers/docxRenderer.ts";
import { makeDocx } from "./util/zip.ts";

const enc = new TextEncoder();

describe("docxRenderer (mammoth + guard + sanitize)", () => {
  it("정상 DOCX → non-empty sanitized HTML", async () => {
    const { html } = await renderDocx(makeDocx());
    expect(html).toContain("제목");
    expect(html).toContain("본문");
    // 정화됨: script 없음
    expect(html.toLowerCase()).not.toContain("<script");
  });

  it("압축 폭탄은 렌더 전에 거부", async () => {
    const { makeStoreZip } = await import("./util/zip.ts");
    const bomb = makeStoreZip([
      { name: "word/document.xml", data: enc.encode("<a/>"), fakeUncompressed: 600 * 1024 * 1024 },
    ]);
    await expect(renderDocx(bomb)).rejects.toMatchObject({ kind: "zip_bomb" });
  });

  it("손상 DOCX → 에러 throw (corrupt)", async () => {
    await expect(renderDocx(enc.encode("garbage").buffer)).rejects.toMatchObject({ kind: "corrupt" });
  });
});
