import { test, expect } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "..", "test", "fixtures");
const ORIGIN = "localhost:4321";

test.describe("doc-viewer E2E", () => {
  test("파일피커로 PDF 열기 → 캔버스 렌더", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", join(FIX, "sample.pdf"));
    await expect(page.locator("#view-viewport")).toBeVisible();
    const canvas = page.locator("#pdf-container canvas").first();
    await expect(canvas).toBeVisible();
    // 픽셀 렌더 검증(L2에서 이관): 캔버스가 비어있지 않음
    const nonEmpty = await canvas.evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d")!;
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      return d.some((v, i) => i % 4 !== 3 && v !== 255 && v !== 0);
    });
    expect(nonEmpty).toBe(true);
  });

  test("파일피커로 DOCX 열기 → 본문 노출", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", join(FIX, "sample.docx"));
    await expect(page.locator("#docx-container")).toContainText("보고서 제목");
    await expect(page.locator("#docx-container table")).toBeVisible();
  });

  test("파일피커로 PPTX 열기 → 슬라이드 시각 렌더", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", join(FIX, "sample.pptx"));
    await expect(page.locator("#docx-container")).toContainText("발표 제목");
    await expect(page.locator(".slide").first()).toBeVisible();
    await expect(page.locator(".slide-shape").first()).toBeVisible();
  });

  test("변환서버 설정 패널: 입력→저장→localStorage", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#settings-panel")).toBeHidden();
    await page.click("#settings-btn");
    await expect(page.locator("#settings-panel")).toBeVisible();
    await page.fill("#settings-url", "https://example.run.app/");
    await page.click("#settings-save");
    const saved = await page.evaluate(() => window.localStorage.getItem("converterUrl"));
    expect(saved).toBe("https://example.run.app"); // 끝 슬래시 제거 확인
  });

  test("PDF 줌 컨트롤 동작", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", join(FIX, "sample.pdf"));
    await expect(page.locator("#pdf-toolbar")).toBeVisible();
    const before = await page.locator("#pdf-container canvas").first().evaluate((c) => (c as HTMLCanvasElement).width);
    await page.click("#zoom-in");
    await expect.poll(async () =>
      page.locator("#pdf-container canvas").first().evaluate((c) => (c as HTMLCanvasElement).width)
    ).toBeGreaterThan(before);
  });

  test("파일피커로 HWPX 열기 → 본문 텍스트", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", join(FIX, "sample.hwpx"));
    await expect(page.locator("#docx-container")).toContainText("한글 문서 제목");
  });

  test("파일피커로 XLSX 열기 → 표 렌더", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", join(FIX, "sample.xlsx"));
    await expect(page.locator(".xlsx-table")).toBeVisible();
    await expect(page.locator("#docx-container")).toContainText("홍길동");
    await expect(page.locator(".xlsx-table th").first()).toContainText("이름");
  });

  test("파일피커로 CSV 열기 → 표 렌더", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", {
      name: "data.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("이름,점수\n홍길동,90\n김철수,85\n"),
    });
    await expect(page.locator(".xlsx-table")).toBeVisible();
    await expect(page.locator("#docx-container")).toContainText("홍길동");
  });

  test("바이너리 .hwp 열기 → 미리보기 텍스트", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", join(FIX, "sample.hwp"));
    await expect(page.locator("#docx-container")).toContainText("한글 미리보기");
  });

  test("깨진/미지원 파일 → 폴백 + 다른 앱 안내", async ({ page }) => {
    await page.goto("/");
    await page.setInputFiles("#file-input", {
      name: "문서.hwp",
      mimeType: "application/octet-stream",
      buffer: Buffer.from("dummy not a real hwp"),
    });
    await expect(page.locator("#view-error")).toBeVisible();
    await expect(page.locator("#hwp-fallback")).toBeVisible();
  });

  test("프라이버시 egress-0: 문서 열람 중 교차 출처 요청 없음", async ({ page }) => {
    const foreign: string[] = [];
    page.on("request", (req) => {
      const host = new URL(req.url()).host;
      if (host && host !== ORIGIN && !req.url().startsWith("data:") && !req.url().startsWith("blob:")) {
        foreign.push(req.method() + " " + req.url());
      }
    });
    await page.goto("/");
    await page.setInputFiles("#file-input", join(FIX, "sample.pdf"));
    await expect(page.locator("#pdf-container canvas").first()).toBeVisible();
    await page.setInputFiles("#file-input", join(FIX, "sample.docx"));
    await expect(page.locator("#docx-container")).toContainText("보고서");
    // 문서 바이트가 외부로 나가는 요청이 0건이어야 함(순수 클라이언트)
    expect(foreign, `외부 요청 발생: ${foreign.join(", ")}`).toHaveLength(0);
  });

  test("PWA: manifest 유효 + SW 등록", async ({ page }) => {
    await page.goto("/");
    const manifestHref = await page.getAttribute('link[rel="manifest"]', "href");
    expect(manifestHref).toBeTruthy();
    const reg = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const r = await navigator.serviceWorker.getRegistration();
      return !!(r || (await navigator.serviceWorker.ready.catch(() => null)));
    });
    expect(reg).toBeTruthy();
  });
});
