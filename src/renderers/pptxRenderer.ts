/**
 * pptxRenderer — PPTX → 슬라이드 시각 렌더(위치 있는 텍스트 + 이미지).
 * 완벽한 고화질(차트/스마트아트/애니메이션)은 아니지만, 텍스트·이미지·배치를 살려
 * "슬라이드처럼" 보여준다. zip+XML 자체 파싱, 폭탄/XXE 가드 재사용.
 * 텍스트는 textContent로만 주입 → XSS 표면 없음.
 */
import { extractZipEntries } from "../core/zipGuard.ts";
import { toViewerError, ViewerError } from "../core/errors.ts";

interface TextLine {
  text: string;
  sizePct: number; // 슬라이드 높이 대비 % (cqh)
  bold: boolean;
}
interface Shape {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  kind: "text" | "image";
  lines?: TextLine[];
  src?: string;
}
export interface PptxSlide {
  shapes: Shape[];
  flow: string[]; // 위치 정보 없는(레이아웃 상속) 텍스트
}
export interface PptxResult {
  aspect: number; // cx/cy
  slides: PptxSlide[];
}

const SLIDE_RE = /^ppt\/slides\/slide(\d+)\.xml$/i;
const RELS_RE = /^ppt\/slides\/_rels\/slide(\d+)\.xml\.rels$/i;
const MEDIA_RE = /^ppt\/media\//i;

const MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", bmp: "image/bmp",
};

const num = (v: string | null) => (v ? parseInt(v, 10) : 0);
const slideNo = (n: string) => num(n.match(/(\d+)\.xml/)?.[1] ?? "0");

function toDataUrl(name: string, bytes: Uint8Array): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) return null; // emf/wmf 등은 브라우저 미표시 → 생략
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(bin)}`;
}

function xfrmOf(el: Element): { x: number; y: number; cx: number; cy: number } | null {
  const off = el.getElementsByTagName("a:off")[0];
  const ext = el.getElementsByTagName("a:ext")[0];
  if (!off || !ext) return null;
  return { x: num(off.getAttribute("x")), y: num(off.getAttribute("y")), cx: num(ext.getAttribute("cx")), cy: num(ext.getAttribute("cy")) };
}

function linesOf(sp: Element, slideCyEmu: number): TextLine[] {
  const slideHeightPt = slideCyEmu / 12700; // EMU→pt
  const out: TextLine[] = [];
  const paras = sp.getElementsByTagName("a:p");
  for (let i = 0; i < paras.length; i++) {
    const runs = paras[i].getElementsByTagName("a:r");
    let text = "";
    let sz = 0;
    let bold = false;
    for (let j = 0; j < runs.length; j++) {
      const t = runs[j].getElementsByTagName("a:t")[0]?.textContent ?? "";
      text += t;
      const rPr = runs[j].getElementsByTagName("a:rPr")[0];
      sz = Math.max(sz, num(rPr?.getAttribute("sz") ?? "0"));
      if (rPr?.getAttribute("b") === "1") bold = true;
    }
    text = text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const pt = sz ? sz / 100 : 18; // 기본 18pt
    out.push({ text, sizePct: (pt / slideHeightPt) * 100, bold });
  }
  return out;
}

export async function renderPptx(buf: ArrayBuffer): Promise<PptxResult> {
  try {
    const entries = await extractZipEntries(
      buf,
      (n) => n === "ppt/presentation.xml" || SLIDE_RE.test(n) || RELS_RE.test(n) || MEDIA_RE.test(n)
    );
    const dec = new TextDecoder("utf-8");
    const textOf = (name: string) => {
      const e = entries.find((x) => x.name === name);
      return e ? dec.decode(e.bytes) : "";
    };
    const parse = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

    // 슬라이드 크기
    const pres = parse(textOf("ppt/presentation.xml"));
    const sldSz = pres.getElementsByTagName("p:sldSz")[0];
    const cxEmu = num(sldSz?.getAttribute("cx")) || 9144000;
    const cyEmu = num(sldSz?.getAttribute("cy")) || 6858000;
    const aspect = cxEmu / cyEmu;

    // 미디어 dataURL 맵
    const media = new Map<string, string>();
    for (const e of entries) {
      if (MEDIA_RE.test(e.name)) {
        const url = toDataUrl(e.name, e.bytes);
        if (url) media.set(e.name.replace(/^ppt\//, ""), url); // "media/imageN.png"
      }
    }

    const slideNames = entries.map((e) => e.name).filter((n) => SLIDE_RE.test(n)).sort((a, b) => slideNo(a) - slideNo(b));
    const slides: PptxSlide[] = [];

    for (const sname of slideNames) {
      const n = slideNo(sname);
      // rId → media 경로
      const rels = parse(textOf(`ppt/slides/_rels/slide${n}.xml.rels`));
      const relMap = new Map<string, string>();
      const rl = rels.getElementsByTagName("Relationship");
      for (let i = 0; i < rl.length; i++) {
        const id = rl[i].getAttribute("Id") ?? "";
        const tgt = (rl[i].getAttribute("Target") ?? "").replace(/^(\.\.\/)+/, ""); // "media/imageN.png"
        relMap.set(id, tgt);
      }

      const doc = parse(textOf(sname));
      const shapes: Shape[] = [];
      const flow: string[] = [];

      // 이미지
      const pics = doc.getElementsByTagName("p:pic");
      for (let i = 0; i < pics.length; i++) {
        const xf = xfrmOf(pics[i]);
        const embed = pics[i].getElementsByTagName("a:blip")[0]?.getAttribute("r:embed") ?? "";
        const src = media.get(relMap.get(embed) ?? "");
        if (xf && src) {
          shapes.push({
            xPct: (xf.x / cxEmu) * 100, yPct: (xf.y / cyEmu) * 100,
            wPct: (xf.cx / cxEmu) * 100, hPct: (xf.cy / cyEmu) * 100,
            kind: "image", src,
          });
        }
      }

      // 텍스트 도형
      const sps = doc.getElementsByTagName("p:sp");
      for (let i = 0; i < sps.length; i++) {
        const lines = linesOf(sps[i], cyEmu);
        if (lines.length === 0) continue;
        const xf = xfrmOf(sps[i]);
        if (xf) {
          shapes.push({
            xPct: (xf.x / cxEmu) * 100, yPct: (xf.y / cyEmu) * 100,
            wPct: (xf.cx / cxEmu) * 100, hPct: (xf.cy / cyEmu) * 100,
            kind: "text", lines,
          });
        } else {
          for (const l of lines) flow.push(l.text); // 위치 상속 텍스트는 흐름으로
        }
      }
      slides.push({ shapes, flow });
    }

    const hasContent = slides.some((s) => s.shapes.length > 0 || s.flow.length > 0);
    if (!hasContent) throw new ViewerError("unsupported", "슬라이드에서 표시할 내용을 찾지 못했습니다.");
    return { aspect, slides };
  } catch (e) {
    throw toViewerError(e);
  }
}

export function mountPptx(container: HTMLElement, result: PptxResult): void {
  container.innerHTML = "";
  result.slides.forEach((slide, idx) => {
    const box = document.createElement("section");
    box.className = "slide";
    box.style.aspectRatio = String(result.aspect);

    for (const sh of slide.shapes) {
      const el = document.createElement("div");
      el.className = "slide-shape";
      el.style.left = sh.xPct + "%";
      el.style.top = sh.yPct + "%";
      el.style.width = sh.wPct + "%";
      el.style.height = sh.hPct + "%";
      if (sh.kind === "image" && sh.src) {
        const img = document.createElement("img");
        img.src = sh.src;
        img.loading = "lazy";
        el.appendChild(img);
      } else if (sh.lines) {
        for (const line of sh.lines) {
          const p = document.createElement("p");
          p.textContent = line.text;
          p.style.fontSize = `calc(${line.sizePct.toFixed(2)} * 1cqh)`;
          if (line.bold) p.style.fontWeight = "700";
          el.appendChild(p);
        }
      }
      box.appendChild(el);
    }

    if (slide.flow.length) {
      const fl = document.createElement("div");
      fl.className = "slide-flow";
      for (const t of slide.flow) {
        const p = document.createElement("p");
        p.textContent = t;
        fl.appendChild(p);
      }
      box.appendChild(fl);
    }

    const wrap = document.createElement("div");
    wrap.className = "slide-wrap";
    const num = document.createElement("div");
    num.className = "slide-num";
    num.textContent = `슬라이드 ${idx + 1}`;
    wrap.appendChild(num);
    wrap.appendChild(box);
    container.appendChild(wrap);
  });
}
