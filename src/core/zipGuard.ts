/**
 * zipGuard — DOCX(=zip) 안전 검사. mammoth에 넘기기 전에 실행.
 *  - 압축 폭탄: 총 해제 크기 / 압축비 / 엔트리 수 상한.
 *  - XXE/billion-laughs: .xml 파트를 해제해 DOCTYPE/ENTITY 선언을 거부.
 * 순수 파싱 로직이라 단위 테스트 대상이다.
 */
import { ViewerError } from "./errors.ts";

export const LIMITS = {
  maxTotalUncompressed: 500 * 1024 * 1024, // 500MB
  maxRatio: 200, // 해제/압축 비
  maxEntries: 5000,
  xmlScanBytes: 64 * 1024, // XXE 스캔은 각 xml 앞부분만
};

interface CentralEntry {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  compressionMethod: number;
}

const u16 = (b: DataView, o: number) => b.getUint16(o, true);
const u32 = (b: DataView, o: number) => b.getUint32(o, true);

/** End Of Central Directory 레코드를 뒤에서부터 찾는다. */
function findEOCD(view: DataView): number {
  const SIG = 0x06054b50;
  const minOff = Math.max(0, view.byteLength - (22 + 0xffff));
  for (let i = view.byteLength - 22; i >= minOff; i--) {
    if (u32(view, i) === SIG) return i;
  }
  return -1;
}

function readCentralDirectory(buf: ArrayBuffer): CentralEntry[] {
  const view = new DataView(buf);
  const eocd = findEOCD(view);
  if (eocd < 0) throw new ViewerError("corrupt", "ZIP EOCD를 찾을 수 없습니다.");
  const count = u16(view, eocd + 10);
  let off = u32(view, eocd + 16);
  if (count > LIMITS.maxEntries) {
    throw new ViewerError("zip_bomb", `엔트리 수 초과: ${count}`);
  }
  const entries: CentralEntry[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (u32(view, off) !== 0x02014b50) {
      throw new ViewerError("corrupt", "중앙 디렉터리 시그니처 불일치");
    }
    const compressionMethod = u16(view, off + 10);
    const compressedSize = u32(view, off + 20);
    const uncompressedSize = u32(view, off + 24);
    const nameLen = u16(view, off + 28);
    const extraLen = u16(view, off + 30);
    const commentLen = u16(view, off + 32);
    const localHeaderOffset = u32(view, off + 42);
    const name = dec.decode(new Uint8Array(buf, off + 46, nameLen));
    entries.push({ name, compressedSize, uncompressedSize, localHeaderOffset, compressionMethod });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function assertNoBomb(entries: CentralEntry[]): void {
  let totalUncompressed = 0;
  let totalCompressed = 0;
  for (const e of entries) {
    totalUncompressed += e.uncompressedSize;
    totalCompressed += e.compressedSize;
  }
  if (totalUncompressed > LIMITS.maxTotalUncompressed) {
    throw new ViewerError("zip_bomb", `해제 크기 초과: ${totalUncompressed}`);
  }
  // 압축비는 압축 데이터가 어느 정도 있을 때만 의미가 있음(작은 파일 오탐 방지)
  if (totalCompressed > 1024 && totalUncompressed / totalCompressed > LIMITS.maxRatio) {
    throw new ViewerError("zip_bomb", `압축비 초과: ${totalUncompressed / totalCompressed}`);
  }
}

/** local file header에서 실제 압축 데이터 슬라이스를 얻는다. */
function rawData(buf: ArrayBuffer, e: CentralEntry): Uint8Array {
  const view = new DataView(buf);
  const lo = e.localHeaderOffset;
  if (u32(view, lo) !== 0x04034b50) {
    throw new ViewerError("corrupt", "local header 시그니처 불일치");
  }
  const nameLen = u16(view, lo + 26);
  const extraLen = u16(view, lo + 28);
  const start = lo + 30 + nameLen + extraLen;
  return new Uint8Array(buf, start, e.compressedSize);
}

async function inflatePrefix(data: Uint8Array, method: number, maxBytes: number): Promise<Uint8Array> {
  if (method === 0) return data.slice(0, maxBytes); // stored
  // DecompressionStream은 Node 18+/모던 브라우저에서 사용 가능 (deflate-raw).
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (got < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.byteLength;
  }
  reader.cancel().catch(() => {});
  const out = new Uint8Array(got);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.byteLength;
  }
  return out.slice(0, maxBytes);
}

/** 엔트리 전체를 해제한다(총 해제 크기는 assertNoBomb로 상한 보장됨). */
async function inflateFull(data: Uint8Array, method: number): Promise<Uint8Array> {
  if (method === 0) return data; // stored
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total > LIMITS.maxTotalUncompressed) throw new ViewerError("zip_bomb", "해제 크기 초과");
  }
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.byteLength;
  }
  return out;
}

/**
 * zip 안전검사 후, predicate에 맞는 엔트리들을 바이트로 해제해 반환(폭탄/XXE 가드 포함).
 */
export async function extractZipEntries(
  buf: ArrayBuffer,
  predicate: (name: string) => boolean
): Promise<{ name: string; bytes: Uint8Array }[]> {
  const entries = readCentralDirectory(buf);
  assertNoBomb(entries);
  await assertNoXxe(buf, entries);
  const out: { name: string; bytes: Uint8Array }[] = [];
  for (const e of entries) {
    if (!predicate(e.name)) continue;
    out.push({ name: e.name, bytes: await inflateFull(rawData(buf, e), e.compressionMethod) });
  }
  return out;
}

/** extractZipEntries의 텍스트 버전(UTF-8). */
export async function extractZipText(
  buf: ArrayBuffer,
  predicate: (name: string) => boolean
): Promise<{ name: string; text: string }[]> {
  const dec = new TextDecoder("utf-8");
  return (await extractZipEntries(buf, predicate)).map((e) => ({
    name: e.name,
    text: dec.decode(e.bytes),
  }));
}

const XXE_RE = /<!DOCTYPE|<!ENTITY/i;

async function assertNoXxe(buf: ArrayBuffer, entries: CentralEntry[]): Promise<void> {
  const dec = new TextDecoder();
  for (const e of entries) {
    if (!e.name.toLowerCase().endsWith(".xml") && !e.name.toLowerCase().endsWith(".rels")) continue;
    const prefix = await inflatePrefix(rawData(buf, e), e.compressionMethod, LIMITS.xmlScanBytes);
    if (XXE_RE.test(dec.decode(prefix))) {
      throw new ViewerError("corrupt", `외부 엔티티/DTD 선언 감지: ${e.name}`);
    }
  }
}

/** DOCX ArrayBuffer를 mammoth에 넘기기 전 안전 검사. 위반 시 ViewerError. */
export async function guardDocxZip(buf: ArrayBuffer): Promise<void> {
  const entries = readCentralDirectory(buf);
  assertNoBomb(entries);
  await assertNoXxe(buf, entries);
}
