/**
 * router — 파일 확장자/MIME 타입을 렌더러 종류로 라우팅.
 * 편집 불가 뷰어이므로 "무엇으로 열지"만 판단한다.
 */
export type RendererKind = "pdf" | "docx" | "pptx" | "hwp" | "xlsx" | "csv" | "unsupported";

const EXT_MAP: Record<string, RendererKind> = {
  pdf: "pdf",
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx", // 엑셀(신형) → 자체 표 렌더(오프라인)
  csv: "csv", // CSV → 자체 표 렌더(원본과 동일)
  hwp: "hwp", // 바이너리 .hwp (읽기수준, CFB PrvText)
  hwpx: "hwp", // .hwpx (읽기수준, OWPML 텍스트)
  // 구형 바이너리 포맷은 스코프 아웃(변환 서버 있으면 그쪽으로)
  doc: "unsupported",
  ppt: "unsupported",
  xls: "unsupported",
};

const MIME_MAP: Record<string, RendererKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/x-hwp": "hwp",
  "application/haansofthwp": "hwp",
  "application/vnd.hancom.hwpx": "hwp",
};

/** 파일명에서 소문자 확장자 추출(없으면 ""). */
export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  if (dot < 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * 확장자를 우선하고, 없거나 미지의 확장자면 MIME으로 보강한다.
 * 둘 다 실패하면 "unsupported".
 */
export function routeFile(filename: string, mime?: string): RendererKind {
  const ext = extensionOf(filename);
  if (ext && ext in EXT_MAP) return EXT_MAP[ext];

  const m = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (m && m in MIME_MAP) return MIME_MAP[m];

  return "unsupported";
}
