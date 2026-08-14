import { describe, it, expect } from "vitest";
import { renderCsv } from "../src/renderers/csvRenderer.ts";

const enc = new TextEncoder();
const csv = (s: string) => enc.encode(s).buffer;

describe("csvRenderer", () => {
  it("기본 파싱", () => {
    const { rows } = renderCsv(csv("이름,점수\n홍길동,90\n김철수,85\n"));
    expect(rows[0]).toEqual(["이름", "점수"]);
    expect(rows[1]).toEqual(["홍길동", "90"]);
  });

  it("따옴표·콤마·개행 처리", () => {
    const { rows } = renderCsv(csv('a,"b,c","d\ne"\n1,2,3\n'));
    expect(rows[0]).toEqual(["a", "b,c", "d\ne"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });

  it("빈 CSV → 폴백", () => {
    expect(() => renderCsv(csv("\n\n"))).toThrow();
  });

  it("BOM 제거", () => {
    const { rows } = renderCsv(csv("﻿헤더1,헤더2\nv1,v2"));
    expect(rows[0][0]).toBe("헤더1");
  });
});
