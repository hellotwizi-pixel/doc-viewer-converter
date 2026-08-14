/**
 * errors — 파일 처리 오류를 사용자 상태로 분류.
 * 파일 파서 입력은 신뢰 불가하므로, 예외를 사용자가 이해할 범주로 좁힌다.
 */
export type ViewerErrorKind =
  | "unsupported" // 지원하지 않는 포맷 (HWP 등) → 한컴뷰어 안내
  | "corrupt" // 파싱 실패(손상/포맷 불일치)
  | "empty" // 빈 파일
  | "too_large" // 크기 상한 초과
  | "zip_bomb" // 압축 폭탄 가드 발동
  | "convert_failed" // 변환 서버 호출 실패
  | "unknown";

export class ViewerError extends Error {
  kind: ViewerErrorKind;
  constructor(kind: ViewerErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ViewerError";
    this.kind = kind;
  }
}

/** 뷰어에서 열람 가능한 최대 원본 크기(기본 100MB). */
export const MAX_FILE_BYTES = 100 * 1024 * 1024;

/** 파일 자체(원본)에 대한 1차 검증. 통과하지 못하면 ViewerError를 던진다. */
export function assertOpenable(size: number): void {
  if (size <= 0) throw new ViewerError("empty", "빈 파일입니다.");
  if (size > MAX_FILE_BYTES) {
    throw new ViewerError("too_large", "파일이 너무 큽니다.");
  }
}

/** 임의 예외를 ViewerError로 정규화. 파서가 던진 일반 Error → corrupt. */
export function toViewerError(e: unknown): ViewerError {
  if (e instanceof ViewerError) return e;
  const msg = e instanceof Error ? e.message : String(e);
  return new ViewerError("corrupt", msg);
}

/** 사용자에게 보여줄 안내 문구(폴백 포함). */
export function userMessage(err: ViewerError): string {
  switch (err.kind) {
    case "unsupported":
      return "이 파일은 뷰어에서 바로 열기 어렵습니다. 스마트폰은 '다른 앱으로 열기', PC는 한컴/파워포인트 등으로 열어보세요.";
    case "corrupt":
      return "파일을 열 수 없습니다. 손상되었거나 형식이 올바르지 않습니다.";
    case "empty":
      return "빈 파일입니다.";
    case "too_large":
      return "파일이 너무 커서 열 수 없습니다.";
    case "zip_bomb":
      return "비정상적으로 큰 압축 파일이라 안전을 위해 열지 않았습니다.";
    case "convert_failed":
      return "원본 화질 변환에 실패했어요. 변환 서버 주소·인터넷 연결을 확인하세요.\n(" + err.message + ")";
    default:
      return "알 수 없는 오류가 발생했습니다.";
  }
}
