/**
 * gen-fixtures — 결정성 있는 프로그래매틱 픽스처 생성(fixture 태그).
 * 심사 결정: 픽스처는 회귀/결정성 전용이며 충실도 DoD 분모가 아니다.
 * 출력: test/fixtures/{sample.pdf, js.pdf, sample.docx}
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeDocx, makePptx, makeHwpx, makeXlsx } from "../test/util/zip.ts";
import { makeCfbWithPrvText } from "../test/util/cfb.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "test", "fixtures");
mkdirSync(outDir, { recursive: true });

/** 오프셋을 계산해 유효한 xref를 가진 최소 PDF를 만든다. */
function buildPdf(objects: string[], extraTrailer = ""): Uint8Array {
  const enc = new TextEncoder();
  let pdf = "%PDF-1.5\n";
  const offsets: number[] = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(enc.encode(pdf).length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = enc.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${extraTrailer} >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;
  return enc.encode(pdf);
}

// sample.pdf — 텍스트 "Hello doc-viewer" 1페이지
const stream = `BT /F1 24 Tf 72 700 Td (Hello doc-viewer) Tj ET`;
const samplePdf = buildPdf([
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
]);
writeFileSync(join(outDir, "sample.pdf"), samplePdf);

// js.pdf — /OpenAction JavaScript 포함(뷰어가 실행하지 않아야 함)
const jsPdf = buildPdf(
  [
    "<< /Type /Catalog /Pages 2 0 R /OpenAction 6 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /S /JavaScript /JS (app.alert\\('xss'\\);) >>",
  ]
);
writeFileSync(join(outDir, "js.pdf"), jsPdf);

// sample.docx — 헤딩/문단/표
const docx = makeDocx(
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>보고서 제목</w:t></w:r></w:p>
   <w:p><w:r><w:t>본문 문단 텍스트입니다.</w:t></w:r></w:p>
   <w:tbl><w:tr><w:tc><w:p><w:r><w:t>셀A</w:t></w:r></w:p></w:tc>
   <w:tc><w:p><w:r><w:t>셀B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`
);
writeFileSync(join(outDir, "sample.docx"), new Uint8Array(docx));

// sample.pptx — 슬라이드 2개
writeFileSync(
  join(outDir, "sample.pptx"),
  new Uint8Array(makePptx([["발표 제목", "요점 하나"], ["둘째 슬라이드", "요점 둘"]]))
);

// sample.hwpx — 한글(신형)
writeFileSync(
  join(outDir, "sample.hwpx"),
  new Uint8Array(makeHwpx(["한글 문서 제목", "본문 문단입니다."]))
);

// sample.hwp — 한글(바이너리, PrvText 미리보기)
writeFileSync(join(outDir, "sample.hwp"), new Uint8Array(makeCfbWithPrvText("한글 미리보기 텍스트")));

// sample.xlsx — 엑셀 표
writeFileSync(
  join(outDir, "sample.xlsx"),
  new Uint8Array(makeXlsx([["이름", "점수"], ["홍길동", "90"], ["김철수", "85"]]))
);

// sample.csv
writeFileSync(join(outDir, "sample.csv"), "이름,점수\n홍길동,90\n김철수,85\n");

console.log("fixtures written to", outDir);
