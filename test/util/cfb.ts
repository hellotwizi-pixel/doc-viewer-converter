/**
 * 테스트용 최소 CFB(OLE2) writer — "PrvText" 미니 스트림 하나만 담은 파일 생성.
 * cfb.ts 리더의 바이너리 .hwp 경로를 end-to-end로 검증하는 데 쓴다.
 * 레이아웃(sectorSize=512, miniSector=64): sec0=FAT, sec1=Dir, sec2=miniFAT, sec3=mini stream.
 */
const ENDOFCHAIN = 0xfffffffe;
const FREESECT = 0xffffffff;
const FATSECT = 0xfffffffd;

export function makeCfbWithPrvText(text: string): ArrayBuffer {
  const sectorSize = 512;
  const miniSize = 64;
  // 텍스트는 짧게(한 미니섹터, <64B UTF-16 = <32자) 가정
  const prv = new Uint8Array(miniSize);
  for (let i = 0; i < text.length && i * 2 + 1 < miniSize; i++) {
    prv[i * 2] = text.charCodeAt(i) & 0xff;
    prv[i * 2 + 1] = (text.charCodeAt(i) >> 8) & 0xff;
  }
  const prvBytes = text.length * 2;

  const total = 512 + sectorSize * 4;
  const buf = new ArrayBuffer(total);
  const v = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // 헤더 시그니처
  [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1].forEach((b, i) => (u8[i] = b));
  v.setUint16(30, 9, true); // sector shift → 512
  v.setUint16(32, 6, true); // mini shift → 64
  v.setUint32(44, 1, true); // num FAT sectors
  v.setUint32(48, 1, true); // first dir sector
  v.setUint32(56, 4096, true); // mini cutoff
  v.setUint32(60, 2, true); // first miniFAT sector
  v.setUint32(64, 1, true); // num miniFAT sectors
  v.setUint32(68, ENDOFCHAIN, true); // first DIFAT
  v.setUint32(72, 0, true); // num DIFAT
  for (let i = 0; i < 109; i++) v.setUint32(76 + i * 4, i === 0 ? 0 : FREESECT, true);

  const secOff = (s: number) => 512 + s * sectorSize;

  // sec0: FAT
  const fat = [FATSECT, ENDOFCHAIN, ENDOFCHAIN, ENDOFCHAIN];
  for (let i = 0; i < sectorSize / 4; i++) {
    v.setUint32(secOff(0) + i * 4, i < fat.length ? fat[i] : FREESECT, true);
  }

  // sec1: directory (2 entries)
  const dir = secOff(1);
  const writeEntry = (idx: number, name: string, type: number, start: number, size: number) => {
    const base = dir + idx * 128;
    for (let i = 0; i < name.length; i++) v.setUint16(base + i * 2, name.charCodeAt(i), true);
    v.setUint16(base + name.length * 2, 0, true); // null term
    v.setUint16(base + 64, (name.length + 1) * 2, true); // name len (bytes)
    u8[base + 66] = type;
    u8[base + 67] = 1; // color
    v.setUint32(base + 68, FREESECT, true); // left
    v.setUint32(base + 72, FREESECT, true); // right
    v.setUint32(base + 76, FREESECT, true); // child
    v.setUint32(base + 116, start, true);
    v.setUint32(base + 120, size, true);
  };
  writeEntry(0, "Root Entry", 5, 3, miniSize); // root: mini stream at sec3, size 64
  writeEntry(1, "PrvText", 2, 0, prvBytes); // PrvText: mini-sector 0

  // sec2: miniFAT (1 entry → ENDOFCHAIN)
  for (let i = 0; i < sectorSize / 4; i++) {
    v.setUint32(secOff(2) + i * 4, i === 0 ? ENDOFCHAIN : FREESECT, true);
  }

  // sec3: mini stream container (first 64 bytes = PrvText)
  u8.set(prv, secOff(3));

  return buf;
}
