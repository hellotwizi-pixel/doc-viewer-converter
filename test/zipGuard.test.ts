import { describe, it, expect } from "vitest";
import { guardDocxZip } from "../src/core/zipGuard.ts";
import { ViewerError } from "../src/core/errors.ts";
import { makeStoreZip, makeDocx } from "./util/zip.ts";

const enc = new TextEncoder();

describe("zipGuard — 압축 폭탄 / XXE 하드게이트", () => {
  it("정상 DOCX는 통과", async () => {
    await expect(guardDocxZip(makeDocx())).resolves.toBeUndefined();
  });

  it("압축 폭탄(과대 uncompressed 선언) 거부", async () => {
    const bomb = makeStoreZip([
      { name: "word/document.xml", data: enc.encode("<a/>"), fakeUncompressed: 600 * 1024 * 1024 },
    ]);
    await expect(guardDocxZip(bomb)).rejects.toMatchObject({ kind: "zip_bomb" });
  });

  it("XXE/DTD 선언(DOCTYPE) 거부", async () => {
    const xxe = makeDocx(
      `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><w:p><w:r><w:t>&xxe;</w:t></w:r></w:p>`
    );
    await expect(guardDocxZip(xxe)).rejects.toBeInstanceOf(ViewerError);
  });

  it("EOCD 없는 손상 zip 거부", async () => {
    await expect(guardDocxZip(enc.encode("not a zip").buffer)).rejects.toMatchObject({ kind: "corrupt" });
  });
});
