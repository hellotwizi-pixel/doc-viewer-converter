/**
 * csvRenderer — CSV(ArrayBuffer) → HTML 표. CSV는 서식이 없어 표로 보면 원본과 동일.
 * 인코딩: UTF-8 우선, 깨지면 EUC-KR(CP949, 한국 엑셀 CSV) 재시도.
 * 값은 textContent로만 주입 → XSS 표면 없음.
 */
import { toViewerError, ViewerError } from "../core/errors.ts";

const MAX_ROWS = 2000;
const MAX_COLS = 60;

function decode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8.replace(/^﻿/, "");
  try {
    return new TextDecoder("euc-kr").decode(bytes); // 한국 엑셀 CSV 대응
  } catch {
    return utf8.replace(/^﻿/, "");
  }
}

/** 따옴표·콤마·개행을 처리하는 CSV 파서. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
      if (rows.length >= MAX_ROWS) break;
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}

export interface CsvResult {
  rows: string[][];
  truncated: boolean;
}

export function renderCsv(buf: ArrayBuffer): CsvResult {
  try {
    const rows = parseCsv(decode(buf));
    if (!rows.length) throw new ViewerError("unsupported", "CSV에서 표시할 내용을 찾지 못했습니다.");
    let truncated = rows.length >= MAX_ROWS;
    const clipped = rows.map((r) => {
      if (r.length > MAX_COLS) truncated = true;
      return r.slice(0, MAX_COLS);
    });
    return { rows: clipped, truncated };
  } catch (e) {
    throw toViewerError(e);
  }
}

export function mountCsv(container: HTMLElement, result: CsvResult): void {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "xlsx-scroll";
  const table = document.createElement("table");
  table.className = "xlsx-table";
  const maxCols = result.rows.reduce((m, r) => Math.max(m, r.length), 0);
  result.rows.forEach((row, ri) => {
    const tr = document.createElement("tr");
    for (let c = 0; c < maxCols; c++) {
      const cell = document.createElement(ri === 0 ? "th" : "td");
      cell.textContent = row[c] ?? "";
      tr.appendChild(cell);
    }
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  container.appendChild(wrap);
  if (result.truncated) {
    const note = document.createElement("div");
    note.className = "xlsx-note";
    note.textContent = "※ 일부 행/열은 생략되었습니다(미리보기).";
    container.appendChild(note);
  }
}
