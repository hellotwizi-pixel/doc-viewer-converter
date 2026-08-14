/**
 * Minimal store-only (method 0) ZIP writer for tests/fixtures.
 * store-only zip은 유효한 DOCX 컨테이너로 mammoth가 읽을 수 있고, zipGuard 검사 대상이 된다.
 */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** 테스트용: 중앙 디렉터리의 uncompressedSize를 조작(압축 폭탄 시뮬레이션). */
  fakeUncompressed?: number;
}

const enc = new TextEncoder();

export function makeStoreZip(entries: ZipEntry[]): ArrayBuffer {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    // local file header
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0, true);
    lh.setUint16(8, 0, true); // stored
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    const localHeaderOffset = offset;
    chunks.push(new Uint8Array(lh.buffer), nameBytes, e.data);
    offset += 30 + nameBytes.length + size;

    // central directory header
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true); // stored
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, e.fakeUncompressed ?? size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, 0, true);
    ch.setUint32(38, 0, true);
    ch.setUint32(42, localHeaderOffset, true);
    central.push(new Uint8Array(ch.buffer), nameBytes);
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) cdSize += c.length;

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, entries.length, true);
  eocd.setUint16(10, entries.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdStart, true);
  eocd.setUint16(20, 0, true);

  const all = [...chunks, ...central, new Uint8Array(eocd.buffer)];
  let total = 0;
  for (const c of all) total += c.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of all) {
    out.set(c, p);
    p += c.length;
  }
  return out.buffer;
}

/** 최소 유효 DOCX(store-only). body 문단/헤딩/표 포함. */
export function makeDocx(bodyXml?: string): ArrayBuffer {
  const body =
    bodyXml ??
    `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>제목</w:t></w:r></w:p>
     <w:p><w:r><w:t>본문 문단입니다.</w:t></w:r></w:p>`;
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>${body}</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return makeStoreZip([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rels) },
    { name: "word/document.xml", data: enc.encode(documentXml) },
  ]);
}

const PRES_XML = `<?xml version="1.0"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
   xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
<p:sldSz cx="9144000" cy="6858000"/></p:presentation>`;

const NS = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;

/** 최소 PPTX(store-only). 각 문단을 위치 있는 텍스트 도형으로 배치. */
export function makePptx(slides: string[][]): ArrayBuffer {
  const entries: ZipEntry[] = [
    { name: "[Content_Types].xml", data: enc.encode(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`) },
    { name: "ppt/presentation.xml", data: enc.encode(PRES_XML) },
  ];
  slides.forEach((paras, i) => {
    const sps = paras
      .map((t, j) => {
        const y = 500000 + j * 900000;
        return `<p:sp><p:spPr><a:xfrm><a:off x="500000" y="${y}"/><a:ext cx="8000000" cy="800000"/></a:xfrm></p:spPr>
<p:txBody><a:p><a:r><a:rPr sz="2000"/><a:t>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a:t></a:r></a:p></p:txBody></p:sp>`;
      })
      .join("");
    const xml = `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>${sps}</p:spTree></p:cSld></p:sld>`;
    entries.push({ name: `ppt/slides/slide${i + 1}.xml`, data: enc.encode(xml) });
  });
  return makeStoreZip(entries);
}

/** 최소 XLSX(store-only). 첫 행은 헤더(문자열), 이후는 값. */
export function makeXlsx(rows: string[][], sheetName = "시트1"): ArrayBuffer {
  const strings: string[] = [];
  const idxOf = (s: string) => {
    let i = strings.indexOf(s);
    if (i < 0) { i = strings.length; strings.push(s); }
    return i;
  };
  const col = (n: number) => String.fromCharCode(65 + n);
  const rowXml = rows
    .map((r, ri) => {
      const cells = r
        .map((val, ci) => {
          if (val === "") return "";
          const ref = `${col(ci)}${ri + 1}`;
          if (/^-?\d+(\.\d+)?$/.test(val)) return `<c r="${ref}"><v>${val}</v></c>`;
          return `<c r="${ref}" t="s"><v>${idxOf(val)}</v></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  const sheet = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
  const sst = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map((s) => `<si><t>${s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></si>`).join("")}</sst>`;
  const wb = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  return makeStoreZip([
    { name: "[Content_Types].xml", data: enc.encode(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`) },
    { name: "xl/workbook.xml", data: enc.encode(wb) },
    { name: "xl/sharedStrings.xml", data: enc.encode(sst) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(sheet) },
  ]);
}

// 1x1 빨강 PNG
const TINY_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x9a, 0x0b, 0x1a, 0x8b, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

/** 이미지 1개를 배치한 1슬라이드 PPTX. */
export function makePptxWithImage(): ArrayBuffer {
  const slide = `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>
<p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill>
<p:spPr><a:xfrm><a:off x="1000000" y="1000000"/><a:ext cx="4000000" cy="3000000"/></a:xfrm></p:spPr></p:pic>
</p:spTree></p:cSld></p:sld>`;
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>`;
  return makeStoreZip([
    { name: "[Content_Types].xml", data: enc.encode(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>`) },
    { name: "ppt/presentation.xml", data: enc.encode(PRES_XML) },
    { name: "ppt/slides/slide1.xml", data: enc.encode(slide) },
    { name: "ppt/slides/_rels/slide1.xml.rels", data: enc.encode(rels) },
    { name: "ppt/media/image1.png", data: TINY_PNG },
  ]);
}

/** 최소 HWPX(store-only). 섹션 하나에 문단들 주입. */
export function makeHwpx(paras: string[]): ArrayBuffer {
  const body = paras
    .map((t) => `<hp:p><hp:run><hp:t>${t.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</hp:t></hp:run></hp:p>`)
    .join("");
  const section = `<?xml version="1.0" encoding="UTF-8"?>
<hp:sec xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">${body}</hp:sec>`;
  return makeStoreZip([
    { name: "mimetype", data: enc.encode("application/hwp+zip") },
    { name: "Contents/section0.xml", data: enc.encode(section) },
  ]);
}
