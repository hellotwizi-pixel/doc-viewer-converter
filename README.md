# 바로열기 (doc-viewer)

카톡·메일로 받은 **PDF·PPT·Word·한글(HWP)** 문서를 편집 없이 바로 열어보는 순수 뷰어.
폰·PC 둘 다 · 설치형 PWA + Android 래퍼 · 백엔드 0 · 문서는 기기를 떠나지 않음(egress-0).

## 특징
- **편집 불가, 뷰어 전용** — 순수 3상태(파일선택 / 뷰포트 / 폴백) UI.
- **4포맷** — PDF([pdf.js], 고화질), Word([mammoth]+[DOMPurify]), PPT(슬라이드 텍스트), 한글(hwpx 텍스트 / .hwp 미리보기) — 읽기수준 저화질 허용, 추출 실패 시 "다른 앱으로 열기" 폴백.
- **순수 클라이언트** — 모든 렌더가 브라우저 내. 서버 업로드 없음(프라이버시). PPT/HWP도 외부 라이브러리 없이 자체 파서.
- **경량 설치** — 초기 셸 ≈3.4KB gzip, 렌더러는 첫 열람 시 코드 스플리팅 로드.
- **보안 우선** — 파일 파서는 신뢰 불가 입력으로 취급: XSS 정화, 압축 폭탄/XXE 가드, PDF 내장 JS 비활성, 파일명 이스케이프. 텍스트는 textContent로만 주입.
- **"바로 열기"** — PC는 설치형 PWA file_handlers(더블클릭), Android는 WebView 래퍼 intent-filter(카톡 "다른 앱으로 열기"). iOS는 공유 한 단계(RISK-A).

## 개발
```bash
npm install
npm run dev            # 개발 서버
npm test               # 단위/통합 (Vitest)
npm run test:e2e       # E2E (Playwright, egress-0 포함)
npm run build          # tsc + vite (dist/)
npm run preview        # 빌드 결과 로컬 구동
npm run corpus:gen     # 결정성 픽스처 생성
npm run corpus:score   # 렌더 충실도 채점(코퍼스 DoD)
```

## 로드맵 / 상태 (전체 CLI 구현 완료 → `docs/status-report.md`)
- **P1**: PDF+DOCX 순수 클라 PWA. ✅ 구현·검증 (충실도 DoD는 실코퍼스 대기)
- **P2**: PC "바로 열기" (file_handlers). ✅ 구현
- **P3**: PPTX + HWP/HWPX 읽기수준 렌더 + 폴백. ✅ 구현·검증
- **P4**: Android WebView 래퍼(카톡 "다른 앱으로 열기"). ✅ 소스 완비 (`android/`, 빌드=user-intervention)
- 남은 것 = 실파일 충실도 확정 + 실기기 테스트(전부 user-intervention). → `docs/user-intervention.md`

## 문서
- 계획·게이트: `tasks/MAIN_TASK.md`, `docs/plan-draft.md`
- 테스트 전략: `docs/testing.md`
- 비즈니스 리스크(H1/kill switch): `docs/business-risk.md`
- 사용자 개입 예약: `docs/user-intervention.md`

[pdf.js]: https://mozilla.github.io/pdf.js/
[mammoth]: https://github.com/mwilliamson/mammoth.js
[DOMPurify]: https://github.com/cure53/DOMPurify
