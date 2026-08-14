/**
 * main — 뷰어 셸 오케스트레이션. 파일 입력 → 라우팅 → 렌더 → 상태 반영.
 * 편집 기능 없음(순수 뷰어). 문서 바이트는 네트워크로 나가지 않는다(egress-0).
 */
import { routeFile, extensionOf } from "./core/router.ts";
import { getConverterUrl, shouldConvert, convertToPdf } from "./convert/converter.ts";
import { assertOpenable, toViewerError, userMessage, ViewerError } from "./core/errors.ts";
import { transition, initialState, type ViewerState } from "./core/state.ts";
import { displayName } from "./core/filename.ts";
import type { LoadedPdf } from "./renderers/pdfRenderer.ts";

// 렌더러는 첫 파일 열람 시에만 로드(코드 스플리팅) → 초기 셸/설치 무게 최소화(축1).
const lazyPdf = () => import("./renderers/pdfRenderer.ts");
const lazyDocx = () => import("./renderers/docxRenderer.ts");
const lazyPptx = () => import("./renderers/pptxRenderer.ts");
const lazyHwp = () => import("./renderers/hwpRenderer.ts");
const lazyXlsx = () => import("./renderers/xlsxRenderer.ts");
const lazyCsv = () => import("./renderers/csvRenderer.ts");

let state: ViewerState = initialState();
let currentPdf: LoadedPdf | null = null;
let lastFile: File | null = null;

function showBusy(text: string): void {
  const b = document.getElementById("busy");
  if (b) {
    const t = document.getElementById("busy-text");
    if (t) t.textContent = text;
    b.hidden = false;
  }
}
function hideBusy(): void {
  const b = document.getElementById("busy");
  if (b) b.hidden = true;
}
function updateConvStatus(): void {
  const el = document.getElementById("conv-status");
  if (!el) return;
  const url = getConverterUrl();
  if (url) {
    el.textContent = "✓ 고화질 변환 서버 연결됨 (PPT·한글 원본 화질)";
    el.className = "conv-status on";
  } else {
    el.textContent = "○ 고화질 변환 서버 꺼짐 — ⚙︎에서 주소를 넣으면 PPT·한글이 원본 화질로 열립니다";
    el.className = "conv-status off";
  }
}

const $ = (id: string) => document.getElementById(id)!;
const views = {
  fileselect: () => $("view-fileselect"),
  viewport: () => $("view-viewport"),
  error: () => $("view-error"),
};

function show(state: ViewerState): void {
  for (const v of Object.values(views)) v().hidden = true;
  $("close-btn").hidden = state.name !== "viewport";
  $("pdf-toolbar").hidden = !(state.name === "viewport" && state.kind === "pdf");
  const title = $("doc-title");
  if (state.name === "viewport") {
    title.textContent = ""; // 파일명은 신뢰 불가 → textContent로만 주입
    title.textContent = state.filename;
  } else {
    title.textContent = "";
  }

  if (state.name === "fileselect") {
    views.fileselect().hidden = false;
    updateConvStatus();
  } else if (state.name === "viewport") {
    views.viewport().hidden = false;
  } else {
    views.error().hidden = false;
    $("error-msg").textContent = userMessage(state.error);
    // 못 연 파일(미지원/손상)은 "다른 앱으로 열기" 안내를 함께 노출
    const offerFallback = state.error.kind === "unsupported" || state.error.kind === "corrupt";
    $("hwp-fallback").hidden = !offerFallback;
    // 변환 실패 시 "그래도 근사 렌더로 보기" 노출
    $("offline-btn").hidden = state.error.kind !== "convert_failed";
  }
}

function dispatch(event: Parameters<typeof transition>[1]): void {
  state = transition(state, event);
  show(state);
}

async function openFile(file: File, forceOffline = false): Promise<void> {
  // 이전 PDF 정리
  if (currentPdf) {
    await currentPdf.destroy().catch(() => {});
    currentPdf = null;
  }
  lastFile = file;
  const name = displayName(file.name);
  try {
    assertOpenable(file.size);
    const ext = extensionOf(file.name);
    const kind = routeFile(file.name, file.type);

    // 원본 충실도: 변환 서버가 있으면 PPT/HWP/구형 포맷은 PDF로 변환해서 본다.
    const converterUrl = getConverterUrl();
    if (!forceOffline && converterUrl && shouldConvert(ext)) {
      try {
        showBusy("원본 화질로 변환 중… (첫 실행은 서버 준비로 조금 걸려요)");
        const pdfBuf = await convertToPdf(file, converterUrl);
        const { loadPdf } = await lazyPdf();
        const pdf = await loadPdf(pdfBuf);
        currentPdf = pdf;
        dispatch({ type: "OPEN", kind: "pdf", filename: name });
        await openPdf(pdf);
        return;
      } catch (err) {
        // 변환 서버를 설정했는데 실패 → 조용히 넘기지 않고 원인을 보여준다
        const reason = err instanceof Error ? err.message : String(err);
        dispatch({ type: "FAIL", error: new ViewerError("convert_failed", reason), filename: name });
        return;
      } finally {
        hideBusy();
      }
    }

    if (kind === "unsupported") {
      throw new ViewerError("unsupported");
    }
    const buf = await file.arrayBuffer();

    if (kind === "pdf") {
      const { loadPdf } = await lazyPdf();
      const pdf = await loadPdf(buf);
      currentPdf = pdf;
      dispatch({ type: "OPEN", kind: "pdf", filename: name });
      await openPdf(pdf);
      return;
    }

    // pdf 외 포맷은 공통 HTML 컨테이너(docx-container)에 텍스트/HTML로 렌더
    const html = showContentContainer();
    if (kind === "docx") {
      const { renderDocx, mountDocx } = await lazyDocx();
      const result = await renderDocx(buf);
      dispatch({ type: "OPEN", kind: "docx", filename: name });
      mountDocx(html, result);
    } else if (kind === "pptx") {
      const { renderPptx, mountPptx } = await lazyPptx();
      const result = await renderPptx(buf);
      dispatch({ type: "OPEN", kind: "pptx", filename: name });
      mountPptx(html, result);
    } else if (kind === "xlsx") {
      const { renderXlsx, mountXlsx } = await lazyXlsx();
      const result = await renderXlsx(buf);
      dispatch({ type: "OPEN", kind: "xlsx", filename: name });
      mountXlsx(html, result);
    } else if (kind === "csv") {
      const { renderCsv, mountCsv } = await lazyCsv();
      const result = renderCsv(buf);
      dispatch({ type: "OPEN", kind: "csv", filename: name });
      mountCsv(html, result);
    } else {
      const { renderHwp, mountHwp } = await lazyHwp();
      const result = await renderHwp(buf);
      dispatch({ type: "OPEN", kind: "hwp", filename: name });
      mountHwp(html, result);
    }
  } catch (e) {
    const err = toViewerError(e);
    dispatch({ type: "FAIL", error: err, filename: name });
  }
}

// pdf 외 포맷 공통 HTML 컨테이너 표시 → 렌더 대상 엘리먼트 반환
function showContentContainer(): HTMLElement {
  const pdfC = $("pdf-container");
  const docxC = $("docx-container");
  pdfC.hidden = true;
  docxC.hidden = false;
  return docxC;
}

let pdfScale = 1;
let pdfPageWidth1 = 0;

function fitScale(): number {
  const pdfC = $("pdf-container");
  const avail = (pdfC.clientWidth || window.innerWidth) - 24;
  if (!pdfPageWidth1) return 1;
  return Math.max(0.4, Math.min(3, avail / pdfPageWidth1));
}

async function openPdf(pdf: LoadedPdf): Promise<void> {
  const pdfC = $("pdf-container");
  const docxC = $("docx-container");
  docxC.hidden = true;
  pdfC.hidden = false;
  pdfPageWidth1 = (await pdf.pageSize(1)).width;
  pdfScale = fitScale(); // 처음엔 가로 맞춤
  await renderPdf();
}

async function renderPdf(): Promise<void> {
  const pdf = currentPdf;
  if (!pdf) return;
  const pdfC = $("pdf-container");
  pdfC.innerHTML = "";
  $("zoom-label").textContent = Math.round(pdfScale * 100) + "%";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  for (let p = 1; p <= pdf.numPages; p++) {
    const canvas = document.createElement("canvas");
    pdfC.appendChild(canvas);
    await pdf.renderPage(p, canvas, pdfScale * dpr);
    canvas.style.width = Math.round(canvas.width / dpr) + "px"; // 논리 픽셀 = 선명
  }
}

function zoomBy(factor: number): void {
  pdfScale = Math.max(0.3, Math.min(4, pdfScale * factor));
  void renderPdf();
}

function wireUi(): void {
  const input = $("file-input") as HTMLInputElement;
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) void openFile(f);
    input.value = "";
  });

  const dz = $("dropzone");
  ["dragenter", "dragover"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.add("dragover");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    dz.addEventListener(ev, (e) => {
      e.preventDefault();
      dz.classList.remove("dragover");
    })
  );
  dz.addEventListener("drop", (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0];
    if (f) void openFile(f);
  });

  $("close-btn").addEventListener("click", () => dispatch({ type: "CLOSE" }));
  $("retry-btn").addEventListener("click", () => dispatch({ type: "RETRY" }));
  $("offline-btn").addEventListener("click", () => {
    if (lastFile) void openFile(lastFile, true); // 변환 건너뛰고 오프라인 렌더
  });

  // PPT·한글 고화질 변환 서버 주소 설정(선택). WebView는 prompt를 못 띄우므로 인앱 패널 사용.
  const panel = $("settings-panel");
  const urlInput = $("settings-url") as HTMLInputElement;
  const status = $("settings-status");
  $("settings-btn").addEventListener("click", () => {
    urlInput.value = getConverterUrl();
    status.textContent = "";
    panel.hidden = false;
    urlInput.focus();
  });
  $("settings-cancel").addEventListener("click", () => {
    panel.hidden = true;
  });
  panel.addEventListener("click", (e) => {
    if (e.target === panel) panel.hidden = true; // 바깥 탭 → 닫기
  });
  $("settings-save").addEventListener("click", () => {
    const v = urlInput.value.trim().replace(/\/$/, "");
    try {
      if (v) window.localStorage.setItem("converterUrl", v);
      else window.localStorage.removeItem("converterUrl");
    } catch {
      /* ignore */
    }
    status.textContent = v ? "저장됨 · 이제 PPT·한글이 원본 화질로 열립니다." : "저장됨 · 서버 없이 근사 렌더로 봅니다.";
    updateConvStatus();
    setTimeout(() => (panel.hidden = true), 900);
  });

  // PDF 줌 컨트롤
  $("zoom-in").addEventListener("click", () => zoomBy(1.25));
  $("zoom-out").addEventListener("click", () => zoomBy(1 / 1.25));
  $("zoom-fit").addEventListener("click", () => {
    pdfScale = fitScale();
    void renderPdf();
  });
}

// Share Target(보너스): SW가 stash한 파일을 IndexedDB에서 꺼내 연다.
async function consumeSharedFile(): Promise<void> {
  const url = new URL(window.location.href);
  if (url.searchParams.get("share") !== "1") return;
  try {
    const { takeSharedFile } = await import("./share/sharedInbox.ts");
    const file = await takeSharedFile();
    if (file) await openFile(file);
  } catch {
    /* 보너스 경로 — 실패해도 파일피커로 생존 */
  } finally {
    history.replaceState(null, "", url.pathname);
  }
}

// PC 설치형 PWA "바로 열기": OS에서 파일을 더블클릭해 앱이 실행되면 launchQueue로 파일이 전달된다.
// (데스크톱 Chrome/Edge의 File Handling API. 모바일은 무동작 → Android는 Phase 4 네이티브가 담당.)
interface LaunchParams {
  files?: FileSystemFileHandle[];
}
function consumeLaunchFiles(): void {
  const w = window as unknown as {
    launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void };
  };
  if (!w.launchQueue) return;
  w.launchQueue.setConsumer((params) => {
    void (async () => {
      const handle = params.files?.[0];
      if (!handle) return;
      try {
        const file = await handle.getFile();
        await openFile(file);
      } catch {
        /* 접근 실패 시 파일피커로 생존 */
      }
    })();
  });
}

function registerSw(): void {
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env?.DEV) return; // 개발 중엔 SW 생략
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// Android WebView 래퍼가 카톡 "다른 앱으로 열기"로 받은 파일을 넘겨주는 진입점.
// 네이티브가 파일 바이트를 base64로 주입 → 동일 웹뷰어의 openFile로 연다.
interface NativeBridge {
  __openFromNative(base64: string, filename: string, mime: string): void;
}
(window as unknown as NativeBridge).__openFromNative = (base64, filename, mime) => {
  try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    void openFile(new File([bytes], filename || "문서", { type: mime || "" }));
  } catch {
    /* 무시 — 파일피커로 생존 */
  }
};

wireUi();
show(state);
registerSw();
consumeLaunchFiles();
void consumeSharedFile();
