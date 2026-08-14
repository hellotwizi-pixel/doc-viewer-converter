/**
 * xlsxRenderer — XLSX(ArrayBuffer) → 시트별 HTML 표(읽기 전용) + 셀 색/글자색.
 * 표 데이터는 스크롤 표가 유용 → 서버 없이 자체 파싱(zip+XML). styles.xml/theme로 색 재현.
 * 폭탄/XXE 가드 재사용, 값은 textContent로만 주입 → XSS 표면 없음.
 */
import { extractZipText } from "../core/zipGuard.ts";
import { toViewerError, ViewerError } from "../core/errors.ts";

interface Cell {
  t: string;
  bg?: string;
  fg?: string;
}
export interface XlsxSheet {
  name: string;
  rows: Cell[][];
  truncated: boolean;
}
export interface XlsxResult {
  sheets: XlsxSheet[];
}

const MAX_ROWS = 500;
const MAX_COLS = 50;
const SHEET_RE = /^xl\/worksheets\/sheet(\d+)\.xml$/i;
const num = (n: string) => parseInt(n.match(/(\d+)\.xml/)?.[1] ?? "0", 10);

function colIndex(ref: string): number {
  const m = ref.match(/^([A-Za-z]+)/);
  if (!m) return 0;
  let idx = 0;
  for (const ch of m[1].toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64);
  return idx - 1;
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const si = doc.getElementsByTagName("si");
  const out: string[] = [];
  for (let i = 0; i < si.length; i++) {
    const ts = si[i].getElementsByTagName("t");
    let s = "";
    for (let j = 0; j < ts.length; j++) s += ts[j].textContent ?? "";
    out.push(s);
  }
  return out;
}

// ---- 색: 테마 + styles ----
function hex6(v: string | null): string | undefined {
  if (!v) return undefined;
  const h = v.length === 8 ? v.slice(2) : v; // ARGB → RGB
  return /^[0-9a-fA-F]{6}$/.test(h) ? "#" + h.toLowerCase() : undefined;
}
function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const f = (x: number) => (tint < 0 ? x * (1 + tint) : x * (1 - tint) + 255 * tint);
  r = Math.round(f(r)); g = Math.round(f(g)); b = Math.round(f(b));
  const h = (x: number) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

/** 테마 색 배열(styles의 theme 인덱스 순서: lt1,dk1,lt2,dk2,accent1..6,hlink,folHlink). */
function parseTheme(xml: string): string[] {
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const scheme = doc.getElementsByTagName("a:clrScheme")[0];
  if (!scheme) return [];
  const get = (tag: string): string | undefined => {
    const el = scheme.getElementsByTagName("a:" + tag)[0];
    if (!el) return undefined;
    const sys = el.getElementsByTagName("a:sysClr")[0];
    const srgb = el.getElementsByTagName("a:srgbClr")[0];
    return hex6(sys?.getAttribute("lastClr") ?? srgb?.getAttribute("val") ?? null);
  };
  const dk1 = get("dk1"), lt1 = get("lt1"), dk2 = get("dk2"), lt2 = get("lt2");
  return [
    lt1, dk1, lt2, dk2, // 0..3 (swapped per spec)
    get("accent1"), get("accent2"), get("accent3"), get("accent4"), get("accent5"), get("accent6"),
    get("hlink"), get("folHlink"),
  ].map((c) => c ?? "") as string[];
}

function colorFrom(el: Element | undefined, theme: string[]): string | undefined {
  if (!el) return undefined;
  const rgb = hex6(el.getAttribute("rgb"));
  if (rgb) return rgb;
  const t = el.getAttribute("theme");
  if (t !== null) {
    const base = theme[parseInt(t, 10)];
    if (base) return applyTint(base, parseFloat(el.getAttribute("tint") ?? "0") || 0);
  }
  return undefined;
}

interface Styles {
  bg: (string | undefined)[]; // by xf index
  fg: (string | undefined)[];
}
function parseStyles(xml: string, theme: string[]): Styles {
  const empty: Styles = { bg: [], fg: [] };
  if (!xml) return empty;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const fills = doc.getElementsByTagName("fills")[0];
  const fillColors: (string | undefined)[] = [];
  if (fills) {
    const fs = fills.getElementsByTagName("fill");
    for (let i = 0; i < fs.length; i++) {
      const pf = fs[i].getElementsByTagName("patternFill")[0];
      const type = pf?.getAttribute("patternType");
      fillColors.push(type === "solid" ? colorFrom(pf.getElementsByTagName("fgColor")[0], theme) : undefined);
    }
  }
  const fontsEl = doc.getElementsByTagName("fonts")[0];
  const fontColors: (string | undefined)[] = [];
  if (fontsEl) {
    const fs = fontsEl.getElementsByTagName("font");
    for (let i = 0; i < fs.length; i++) fontColors.push(colorFrom(fs[i].getElementsByTagName("color")[0], theme));
  }
  const cellXfs = doc.getElementsByTagName("cellXfs")[0];
  const bg: (string | undefined)[] = [];
  const fg: (string | undefined)[] = [];
  if (cellXfs) {
    const xfs = cellXfs.getElementsByTagName("xf");
    for (let i = 0; i < xfs.length; i++) {
      const xf = xfs[i];
      bg.push(xf.getAttribute("applyFill") !== "0" ? fillColors[num2(xf.getAttribute("fillId"))] : undefined);
      fg.push(xf.getAttribute("applyFont") !== "0" ? fontColors[num2(xf.getAttribute("fontId"))] : undefined);
    }
  }
  return { bg, fg };
}
const num2 = (v: string | null) => (v ? parseInt(v, 10) : 0);

function parseSheet(xml: string, shared: string[], styles: Styles): { rows: Cell[][]; truncated: boolean } {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return { rows: [], truncated: false };
  const rowEls = doc.getElementsByTagName("row");
  const rows: Cell[][] = [];
  let truncated = false;
  for (let i = 0; i < rowEls.length && rows.length < MAX_ROWS; i++) {
    const cells = rowEls[i].getElementsByTagName("c");
    const row: Cell[] = [];
    for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      const col = colIndex(c.getAttribute("r") ?? "");
      if (col >= MAX_COLS) { truncated = true; continue; }
      const t = c.getAttribute("t");
      let val = "";
      if (t === "inlineStr") val = c.getElementsByTagName("t")[0]?.textContent ?? "";
      else {
        const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
        val = t === "s" ? shared[parseInt(v, 10)] ?? "" : v;
      }
      const s = num2(c.getAttribute("s"));
      row[col] = { t: val, bg: styles.bg[s], fg: styles.fg[s] };
    }
    for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = { t: "" };
    rows.push(row);
  }
  if (rowEls.length > MAX_ROWS) truncated = true;
  return { rows, truncated };
}

export async function renderXlsx(buf: ArrayBuffer): Promise<XlsxResult> {
  try {
    const parts = await extractZipText(
      buf,
      (n) =>
        SHEET_RE.test(n) ||
        n === "xl/sharedStrings.xml" ||
        n === "xl/workbook.xml" ||
        n === "xl/styles.xml" ||
        n === "xl/theme/theme1.xml"
    );
    const textOf = (name: string) => parts.find((p) => p.name === name)?.text ?? "";
    const shared = parseSharedStrings(textOf("xl/sharedStrings.xml"));
    const theme = parseTheme(textOf("xl/theme/theme1.xml"));
    const styles = parseStyles(textOf("xl/styles.xml"), theme);

    const wbDoc = new DOMParser().parseFromString(textOf("xl/workbook.xml"), "application/xml");
    const sheetEls = wbDoc.getElementsByTagName("sheet");
    const names: string[] = [];
    for (let i = 0; i < sheetEls.length; i++) names.push(sheetEls[i].getAttribute("name") ?? `시트 ${i + 1}`);

    const sheetNames = parts.map((p) => p.name).filter((n) => SHEET_RE.test(n)).sort((a, b) => num(a) - num(b));
    const sheets: XlsxSheet[] = [];
    sheetNames.forEach((sn, i) => {
      const { rows, truncated } = parseSheet(textOf(sn), shared, styles);
      if (rows.length) sheets.push({ name: names[i] ?? `시트 ${i + 1}`, rows, truncated });
    });

    if (!sheets.length) throw new ViewerError("unsupported", "엑셀에서 표시할 표를 찾지 못했습니다.");
    return { sheets };
  } catch (e) {
    throw toViewerError(e);
  }
}

export function mountXlsx(container: HTMLElement, result: XlsxResult): void {
  container.innerHTML = "";
  for (const sheet of result.sheets) {
    const h = document.createElement("div");
    h.className = "xlsx-name";
    h.textContent = sheet.name;
    container.appendChild(h);

    const wrap = document.createElement("div");
    wrap.className = "xlsx-scroll";
    const table = document.createElement("table");
    table.className = "xlsx-table";
    const maxCols = sheet.rows.reduce((m, r) => Math.max(m, r.length), 0);
    sheet.rows.forEach((row, ri) => {
      const tr = document.createElement("tr");
      for (let c = 0; c < maxCols; c++) {
        const cell = row[c] ?? { t: "" };
        const td = document.createElement(ri === 0 ? "th" : "td");
        td.textContent = cell.t;
        if (cell.bg) td.style.background = cell.bg;
        if (cell.fg) td.style.color = cell.fg;
        tr.appendChild(td);
      }
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    container.appendChild(wrap);
    if (sheet.truncated) {
      const note = document.createElement("div");
      note.className = "xlsx-note";
      note.textContent = "※ 일부 행/열은 생략되었습니다(미리보기).";
      container.appendChild(note);
    }
  }
}
