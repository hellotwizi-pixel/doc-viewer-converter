/**
 * sanitizer — mammoth가 만든 DOCX→HTML을 DOM에 넣기 전에 정화.
 * 하드 보안 게이트: 자체 화이트리스트를 손코딩하지 않고 검증된 DOMPurify를 쓴다(mXSS 회피).
 * 테스트 대상은 이 config다.
 */
import DOMPurify from "dompurify";

/** mammoth 출력에 실제로 등장하는 제한된 HTML 서브셋만 허용. */
const ALLOWED_TAGS = [
  "p", "br", "span", "div",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "strong", "b", "em", "i", "u", "s", "sub", "sup",
  "ul", "ol", "li",
  "table", "thead", "tbody", "tr", "td", "th",
  "a", "img", "blockquote", "pre", "code", "hr",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "colspan", "rowspan", "class"];

/** 허용 이미지 data: 서브타입. svg+xml은 스크립트 내장 가능 → 제외. */
const SAFE_IMAGE_DATA = /^data:image\/(png|jpe?g|gif|webp);/i;

let configured = false;

function configure(): void {
  if (configured) return;
  // 위험한 URI를 실은 속성을 훅에서 직접 제거(특히 data:image/svg+xml, data:text/html).
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    // 외부 링크는 안전하게
    if (el.tagName === "A" && el.getAttribute("href")) {
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
    }
    // 이미지 src는 허용 data:image 서브타입만 통과
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") ?? "";
      const isSafeData = SAFE_IMAGE_DATA.test(src);
      const isHttp = /^https?:\/\//i.test(src);
      if (!isSafeData && !isHttp) el.removeAttribute("src");
    }
  });
  configured = true;
}

export function sanitizeHtml(dirty: string): string {
  configure();
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // svg/mathml 마크업 자체를 파싱 대상에서 배제(SVG XSS 표면 제거)
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "svg", "math", "script", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
    // javascript:, data:text/html 등은 DOMPurify 기본 정책이 차단하며,
    // 위 afterSanitizeAttributes 훅이 이미지 data URI를 추가로 좁힌다.
  });
}
