import { describe, it, expect } from "vitest";
import { renderXlsx } from "../src/renderers/xlsxRenderer.ts";
import { makeXlsx, makeStoreZip } from "./util/zip.ts";

const enc = new TextEncoder();

describe("xlsxRenderer (자체 표 렌더)", () => {
  it("문자열·숫자 셀을 표로 파싱", async () => {
    const { sheets } = await renderXlsx(
      makeXlsx([
        ["이름", "점수"],
        ["홍길동", "90"],
        ["김철수", "85"],
      ])
    );
    expect(sheets.length).toBe(1);
    expect(sheets[0].name).toBe("시트1");
    expect(sheets[0].rows[0].map((c) => c.t)).toEqual(["이름", "점수"]);
    expect(sheets[0].rows[1].map((c) => c.t)).toEqual(["홍길동", "90"]);
    expect(sheets[0].rows[2][0].t).toBe("김철수");
  });

  it("빈 시트는 폴백(unsupported)", async () => {
    await expect(renderXlsx(makeXlsx([]))).rejects.toMatchObject({ kind: "unsupported" });
  });

  it("압축 폭탄 방어(공통 zip 가드)", async () => {
    const bomb = makeStoreZip([
      { name: "xl/worksheets/sheet1.xml", data: enc.encode("<a/>"), fakeUncompressed: 600 * 1024 * 1024 },
    ]);
    await expect(renderXlsx(bomb)).rejects.toMatchObject({ kind: "zip_bomb" });
  });
});
