/**
 * corpus-score — 렌더 충실도 DoD 검증 하네스 (테스트 아님).
 * 심사 규칙:
 *  - 각 파일 fixture|real 태그. corpus/ = real, test/fixtures/ = fixture.
 *  - 충실도 DoD 백분율은 REAL 부분집합으로만 산출. 픽스처는 회귀지표로만.
 *  - real 코퍼스가 <15개면 DoD 상태 = UNVERIFIED (소표본 100%를 PASS로 부르지 않음).
 * 자동 판정: broken(로드 실패) / readable(로드+내용 non-empty). "정상(normal)" 승급은 사람이 시각 확인 후 수기.
 */
import { readdirSync, readFileSync, existsSync, writeFileSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import * as pdfjs from "pdfjs-dist";
import mammoth from "mammoth";
import { JSDOM } from "jsdom";
import { guardDocxZip } from "../src/core/zipGuard.ts";
import { renderPptx } from "../src/renderers/pptxRenderer.ts";
import { renderHwp } from "../src/renderers/hwpRenderer.ts";
import { renderXlsx } from "../src/renderers/xlsxRenderer.ts";
import { renderCsv } from "../src/renderers/csvRenderer.ts";

// pptx/hwpx 렌더러는 DOMParser가 필요 → node 스크립트에 jsdom으로 주입
const g = globalThis as unknown as { DOMParser?: unknown };
if (!g.DOMParser) g.DOMParser = new JSDOM().window.DOMParser;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs")
).href;

type Grade = "broken" | "readable" | "normal";
interface Row {
  file: string;
  tag: "fixture" | "real";
  kind: string;
  grade: Grade;
  note: string;
}

function toArrayBuffer(p: string): ArrayBuffer {
  const b = readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

async function scorePdf(buf: ArrayBuffer): Promise<{ grade: Grade; note: string }> {
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
    let text = "";
    for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
      const c = await (await doc.getPage(p)).getTextContent();
      text += c.items.map((i) => ("str" in i ? i.str : "")).join(" ");
    }
    await doc.destroy();
    return { grade: "readable", note: `${doc.numPages}p, text ${text.trim().length}자` };
  } catch (e) {
    return { grade: "broken", note: (e as Error).message.slice(0, 80) };
  }
}

async function scoreDocx(buf: ArrayBuffer): Promise<{ grade: Grade; note: string }> {
  try {
    await guardDocxZip(buf);
    const { value } = await mammoth.convertToHtml({ arrayBuffer: buf, buffer: new Uint8Array(buf) } as {
      arrayBuffer: ArrayBuffer;
    });
    const len = value.replace(/<[^>]+>/g, "").trim().length;
    if (len === 0) return { grade: "broken", note: "빈 본문" };
    return { grade: "readable", note: `${len}자` };
  } catch (e) {
    return { grade: "broken", note: (e as Error).message.slice(0, 80) };
  }
}

async function scoreReadable(
  render: () => Promise<number>
): Promise<{ grade: Grade; note: string }> {
  try {
    const len = await render();
    if (len === 0) return { grade: "broken", note: "빈 본문" };
    return { grade: "readable", note: `${len}자` };
  } catch (e) {
    return { grade: "broken", note: (e as Error).message.slice(0, 80) };
  }
}

const SUPPORTED = new Set([".pdf", ".docx", ".pptx", ".hwp", ".hwpx", ".xlsx", ".csv"]);

async function scoreDir(dir: string, tag: "fixture" | "real", rows: Row[]): Promise<void> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isFile()) continue;
    const ext = extname(name).toLowerCase();
    if (!SUPPORTED.has(ext)) continue;
    const buf = toArrayBuffer(p);
    const kind = ext === ".hwpx" ? "hwp" : ext.slice(1);
    let r: { grade: Grade; note: string };
    if (ext === ".pdf") r = await scorePdf(buf);
    else if (ext === ".docx") r = await scoreDocx(buf);
    else if (ext === ".xlsx")
      r = await scoreReadable(async () => {
        const { sheets } = await renderXlsx(buf);
        return sheets.reduce((a, s) => a + s.rows.reduce((x, row) => x + row.map((c) => c.t).join("").length, 0), 0);
      });
    else if (ext === ".csv")
      r = await scoreReadable(async () => renderCsv(buf).rows.reduce((a, row) => a + row.join("").length, 0));
    else if (ext === ".pptx")
      r = await scoreReadable(async () => {
        const { slides } = await renderPptx(buf);
        return slides.reduce(
          (acc, s) =>
            acc +
            s.shapes.reduce((a, sh) => a + (sh.lines?.reduce((x, l) => x + l.text.length, 0) ?? (sh.kind === "image" ? 10 : 0)), 0) +
            s.flow.join("").length,
          0
        );
      });
    else r = await scoreReadable(async () => (await renderHwp(buf)).paragraphs.join("").length);
    rows.push({ file: name, tag, kind, grade: r.grade, note: r.note });
  }
}

function pct(rows: Row[], kind: string, pred: (g: Grade) => boolean): { n: number; ok: number } {
  const subset = rows.filter((r) => r.kind === kind);
  return { n: subset.length, ok: subset.filter((r) => pred(r.grade)).length };
}

async function main(): Promise<void> {
  const rows: Row[] = [];
  await scoreDir(join(root, "test", "fixtures"), "fixture", rows);
  await scoreDir(join(root, "corpus"), "real", rows);

  const real = rows.filter((r) => r.tag === "real");
  const fixture = rows.filter((r) => r.tag === "fixture");

  // DoD는 real 부분집합으로만
  const realPdf = pct(real, "pdf", (g) => g === "normal" || g === "readable");
  const realDocx = pct(real, "docx", (g) => g === "normal" || g === "readable");
  const realCount = real.length;
  const MIN = 15;

  const pdfPass = realPdf.n > 0 && realPdf.ok === realPdf.n; // PDF 정상 100%
  const docxPass = realDocx.n > 0 && realDocx.ok / realDocx.n >= 0.9; // DOCX ≥90%
  let status: string;
  if (realCount < MIN) status = "UNVERIFIED (real 코퍼스 < 15)";
  else if (pdfPass && docxPass) status = "PASS";
  else status = "FAIL";

  const report = {
    generatedAt: new Date().toISOString(),
    minRealSample: MIN,
    realCount,
    dod: {
      pdf: { rule: "정상 100%", ...realPdf },
      docx: { rule: "읽을수있음 ≥90%", ...realDocx },
      status,
    },
    fixtureRegression: pct(fixture, "pdf", (g) => g !== "broken"),
    rows,
  };
  writeFileSync(join(root, "docs", "corpus-scorecard.json"), JSON.stringify(report, null, 2));

  console.log("\n=== 코퍼스 충실도 채점 ===");
  console.table(rows.map((r) => ({ file: r.file, tag: r.tag, kind: r.kind, grade: r.grade, note: r.note })));
  console.log(`REAL PDF: ${realPdf.ok}/${realPdf.n} 정상,  REAL DOCX: ${realDocx.ok}/${realDocx.n} 읽을수있음`);
  console.log(`REAL 표본: ${realCount} (최소 ${MIN})`);
  console.log(`DoD 상태: ${status}`);
  console.log("→ docs/corpus-scorecard.json 기록됨");
  if (status.startsWith("UNVERIFIED")) {
    console.log("ℹ️  실 코퍼스는 user-intervention UI-3로 확보 필요(개인문서). 픽스처는 회귀지표일 뿐 DoD 분모가 아님.");
  }
}

void main();
