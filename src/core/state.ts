/**
 * state — 뷰어의 3상태 머신 (심사 확정: 순수 뷰어는 사실상 3상태).
 *   fileselect ⇄ viewport, 어느 상태에서든 → error, error → fileselect(재시도)
 * 편집 상태가 없다는 점이 "순수 뷰어" 불변식이다.
 */
import type { ViewerError } from "./errors.ts";
import type { RendererKind } from "./router.ts";

export type ViewerState =
  | { name: "fileselect" }
  | { name: "viewport"; kind: Exclude<RendererKind, "unsupported">; filename: string }
  | { name: "error"; error: ViewerError; filename?: string };

export type ViewerEvent =
  | { type: "OPEN"; kind: Exclude<RendererKind, "unsupported">; filename: string }
  | { type: "FAIL"; error: ViewerError; filename?: string }
  | { type: "CLOSE" }
  | { type: "RETRY" };

export function initialState(): ViewerState {
  return { name: "fileselect" };
}

/** 순수 전이 함수. 부작용 없음 → 단위 테스트 대상. */
export function transition(state: ViewerState, event: ViewerEvent): ViewerState {
  switch (event.type) {
    case "OPEN":
      return { name: "viewport", kind: event.kind, filename: event.filename };
    case "FAIL":
      // 어느 상태에서든 오류로 진입 가능
      return { name: "error", error: event.error, filename: event.filename };
    case "CLOSE":
    case "RETRY":
      return { name: "fileselect" };
    default:
      return state;
  }
}
