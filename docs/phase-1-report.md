# Phase 1 완료 보고 — MVP: PDF + DOCX 설치형 PWA

> 심사 원칙: "출하됨"이 아니라 **"측정됨"**이 Phase 1의 끝. 아래는 측정 결과다.

## 구현 산출물
- `src/core/` — router, errors, state(3상태 머신), filename(XSS 이스케이프), sanitizer(DOMPurify), zipGuard(폭탄/XXE).
- `src/renderers/` — pdfRenderer(pdf.js, 보안 config), docxRenderer(mammoth+guard+DOMPurify).
- `src/main.ts` — 셸 오케스트레이션, 파일피커(주경로)+드래그&드롭, 렌더러 코드 스플리팅.
- PWA: `public/manifest.webmanifest`(installable, share_target POST, file_handlers), `public/sw.js`(앱셸 캐시 + Share Target stash — 문서는 캐시/업로드 안 함).
- 하네스: `scripts/gen-fixtures.ts`, `scripts/corpus-score.ts`.

## 테스트 결과 (자동, 실측)
- **단위/통합 (Vitest): 40 passed** — router/sanitizer/errors/state/filename/zipGuard/docxRenderer/pdfRenderer.
- **E2E (Playwright): 5 passed** — PDF 캔버스 픽셀 렌더, DOCX 본문, 미지원(.hwp) 폴백+한컴안내, **egress-0**, PWA(manifest+SW).

## 보안 하드게이트 — 전부 PASS
| 게이트 | 검증 | 결과 |
|---|---|---|
| sanitizer XSS 무력화 | sanitizer.test (벡터 목록 + SVG/data:text/html 차단) | ✅ |
| 프라이버시 egress-0 | E2E 교차 출처 요청 0건 | ✅ |
| zip bomb 가드 | zipGuard.test (과대 uncompressed 거부) | ✅ |
| XXE/DTD 방지 | zipGuard.test (DOCTYPE/ENTITY 거부) | ✅ |
| PDF 내장 JS 비활성 | pdfRenderer.test (OpenAction JS 미실행, isEvalSupported:false) | ✅ |
| 파일명 XSS 이스케이프 | filename.test + main.ts textContent 주입 | ✅ |

## 축1 (전달 경로 마찰) — 개발자측 측정 완료
- 인앱 파일피커 **2탭**, 초기 셸 **≈5.7KB gzip**, 로그인/광고/문서유출 **0**. (`docs/axis1-scorecard.md` A섹션)
- 렌더러는 코드 스플리팅 → 초기 설치 무게에 미포함.

## DoD 상태 (정직한 판정)
| 항목 | 상태 | 근거 |
|---|---|---|
| 보안 하드게이트 6종 | **PASS** | 자동 테스트 |
| 축1 개발자측 계측 + 카톡 프로토콜 인계 | **완료** | axis1 A섹션 + user-intervention UI-2 |
| 렌더 충실도 (PDF 100% / DOCX ≥90%) | **UNVERIFIED** | real 코퍼스 0 < 15 (규칙상 PASS 불가). 픽스처는 회귀지표. |
| H1 (대체재 대비 마찰) | **UNVERIFIED** | 사용자측 실기기·카톡 데이터 필요 → UI-2 인계 |

## 남은 사용자 개입 (프로덕션/판정 완결에 필요)
- **UI-1**: Vercel 로그인/배포(로컬 preview로는 전 기능 검증 완료).
- **UI-2**: 실기기 카톡 경로 탭 수 계측(축1 B섹션).
- **UI-3**: 실 코퍼스 ≥15개 확보 → `npm run corpus:score`로 충실도 DoD 확정.

## 로컬 실행/검증
```
npm install
npm test           # 40 unit/integration
npm run test:e2e   # 5 e2e (egress-0 포함)
npm run build && npx vite preview   # 실제 뷰어 로컬 구동
npm run corpus:score  # 충실도 채점(현재 UNVERIFIED)
```
