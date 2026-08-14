/**
 * cfb — 최소 Compound File Binary(OLE2) 리더. 이름으로 스트림 하나를 꺼낸다.
 * 용도: 바이너리 .hwp에서 "PrvText"(UTF-16LE 미리보기 텍스트) 추출 → 읽기수준 폴백.
 * 신뢰 불가 입력이므로 모든 경계에 상한/검증을 두고, 이상 시 null을 반환한다.
 */
const SIG = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const MAX_SECTORS = 1 << 20; // 방어적 상한

export function isCfb(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 8) return false;
  const b = new Uint8Array(buf, 0, 8);
  return SIG.every((v, i) => b[i] === v);
}

interface DirEntry {
  name: string;
  type: number; // 1=storage,2=stream,5=root
  start: number;
  size: number;
}

function u16(v: DataView, o: number) {
  return v.getUint16(o, true);
}
function u32(v: DataView, o: number) {
  return v.getUint32(o, true);
}

export function readCfbStream(buf: ArrayBuffer, target: string): Uint8Array | null {
  try {
    if (!isCfb(buf)) return null;
    const view = new DataView(buf);
    const sectorShift = u16(view, 30);
    const miniShift = u16(view, 32);
    const sectorSize = 1 << sectorShift;
    const miniSectorSize = 1 << miniShift;
    if (sectorSize < 128 || sectorSize > 65536) return null;
    const numFatSectors = u32(view, 44);
    const firstDirSector = u32(view, 48);
    const miniCutoff = u32(view, 56);
    const firstMiniFat = u32(view, 60);
    const firstDifat = u32(view, 68);
    const numDifatSectors = u32(view, 72);

    const sectorOffset = (s: number) => 512 + s * sectorSize;
    const sectorBytes = (s: number): Uint8Array => {
      const off = sectorOffset(s);
      if (off < 0 || off + sectorSize > buf.byteLength) throw new Error("sector oob");
      return new Uint8Array(buf, off, sectorSize);
    };

    // 1) DIFAT: 헤더 내 109개 + DIFAT 섹터 체인
    const fatSectorLocs: number[] = [];
    for (let i = 0; i < 109; i++) {
      const loc = u32(view, 76 + i * 4);
      if (loc === FREESECT || loc === ENDOFCHAIN) break;
      fatSectorLocs.push(loc);
    }
    let difatSec = firstDifat;
    let guard = 0;
    while (difatSec !== ENDOFCHAIN && difatSec !== FREESECT && guard++ < numDifatSectors + 1) {
      const s = sectorBytes(difatSec);
      const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
      const n = sectorSize / 4;
      for (let i = 0; i < n - 1; i++) {
        const loc = u32(dv, i * 4);
        if (loc !== FREESECT && loc !== ENDOFCHAIN) fatSectorLocs.push(loc);
      }
      difatSec = u32(dv, (n - 1) * 4);
    }
    if (fatSectorLocs.length < numFatSectors) {
      /* 헤더 109개로 충분한 경우가 대부분 — 계속 진행 */
    }

    // 2) FAT 배열
    const fat: number[] = [];
    for (const loc of fatSectorLocs) {
      const s = sectorBytes(loc);
      const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
      for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(dv, i * 4));
      if (fat.length > MAX_SECTORS) return null;
    }

    const chain = (start: number): number[] => {
      const out: number[] = [];
      let s = start;
      let g = 0;
      while (s !== ENDOFCHAIN && s !== FREESECT && g++ < MAX_SECTORS) {
        if (s < 0 || s >= fat.length) break;
        out.push(s);
        s = fat[s];
      }
      return out;
    };

    const readSectors = (start: number, size: number): Uint8Array => {
      const secs = chain(start);
      const out = new Uint8Array(secs.length * sectorSize);
      let p = 0;
      for (const s of secs) {
        out.set(sectorBytes(s), p);
        p += sectorSize;
      }
      return size > 0 ? out.slice(0, size) : out;
    };

    // 3) 디렉터리 엔트리
    const dirBytes = readSectors(firstDirSector, 0);
    const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
    const entries: DirEntry[] = [];
    for (let off = 0; off + 128 <= dirBytes.byteLength; off += 128) {
      const nameLen = u16(dirView, off + 64);
      const type = dirBytes[off + 66];
      if (type === 0) continue; // unused
      let name = "";
      for (let i = 0; i + 1 < Math.max(0, nameLen - 2); i += 2) {
        name += String.fromCharCode(u16(dirView, off + i));
      }
      entries.push({
        name,
        type,
        start: u32(dirView, off + 116),
        size: u32(dirView, off + 120),
      });
    }

    const root = entries.find((e) => e.type === 5);
    const wanted = entries.find((e) => e.type === 2 && e.name === target);
    if (!wanted) return null;

    // 4) 큰 스트림 → FAT, 작은 스트림 → mini stream
    if (wanted.size >= miniCutoff) {
      return readSectors(wanted.start, wanted.size);
    }
    if (!root) return null;
    const miniStream = readSectors(root.start, root.size);

    // miniFAT
    const miniFat: number[] = [];
    const miniFatBytes = firstMiniFat === ENDOFCHAIN ? new Uint8Array(0) : readSectors(firstMiniFat, 0);
    const mfView = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
    for (let i = 0; i + 4 <= miniFatBytes.byteLength; i += 4) miniFat.push(u32(mfView, i));

    const out = new Uint8Array(Math.ceil(wanted.size / miniSectorSize) * miniSectorSize);
    let s = wanted.start;
    let p = 0;
    let g = 0;
    while (s !== ENDOFCHAIN && s !== FREESECT && g++ < MAX_SECTORS) {
      const off = s * miniSectorSize;
      if (off + miniSectorSize > miniStream.byteLength) break;
      out.set(miniStream.subarray(off, off + miniSectorSize), p);
      p += miniSectorSize;
      if (s >= miniFat.length) break;
      s = miniFat[s];
    }
    return out.slice(0, wanted.size);
  } catch {
    return null;
  }
}
