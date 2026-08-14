# doc-viewer 전체 상태 보고 (CLI 개발 종료 시점, 2026-07-22)

> 사용자 지시: "끝까지 개발하고 마지막에 실기기 테스트." → CLI로 가능한 전 범위 구현·검증 완료. 남은 건 실기기/실파일 개입뿐.

## 최종 스코프 (사용자 4개 전제 충족)
- 폰·PC 둘 다 · PDF·PPT·워드·한글 뷰어 열기 · 고화질 우선/저화질 허용 · "바로 열기" 편의.

## 구현 완료 (전부 자동 검증)
| Phase | 내용 | 상태 |
|---|---|---|
| **P1** | PDF(pdf.js 고화질) + DOCX(mammoth 읽기수준) 순수 클라 PWA | ✅ 구현·검증 |
| **P2** | PC "바로 열기" — manifest file_handlers + launchQueue 소비자 | ✅ 구현 |
| **P3** | PPTX(슬라이드 텍스트) + HWP/HWPX(hwpx 텍스트 + 바이너리 PrvText) 읽기수준 렌더 + 자동 폴백 | ✅ 구현·검증 |
| **P4** | Android WebView 래퍼(intent-filter로 카톡 "다른 앱으로 열기" 노출, 동일 웹뷰어 재사용) | ✅ 소스 완비 |

## 포맷별 처리 방식
| 포맷 | 방식 | 화질 |
|---|---|---|
| PDF | pdf.js | ★★★ 고화질 |
| Word(DOCX) | mammoth → DOMPurify | ★★ 읽기수준 |
| PPT(PPTX) | 자체 슬라이드 텍스트 추출(zip+XML) | ★★ 읽기수준 |
| 한글 hwpx | 자체 OWPML 텍스트 추출 | ★~★★ 읽기수준 |
| 한글 .hwp(바이너리) | CFB PrvText 미리보기 추출 | ★ 읽기수준(미리보기) |
| 그 외/추출 실패 | "다른 앱으로 열기" 폴백 안내 | — |

- **자체 파서**로 구현 → 불안정한 외부 라이브러리(pptxjs/jQuery) 없이 번들 경량 유지(PPTX 0.78KB / HWP 1.87KB gzip 추가).
- 모든 추출 텍스트는 **textContent로만 주입** → XSS 표면 없음.

## 테스트 (실측)
- **단위/통합 (Vitest): 51 passed** — router/sanitizer/errors/state/filename/zipGuard/cfb/docx/pdf/pptx/hwp.
- **E2E (Playwright): 8 passed** — PDF/DOCX/PPTX/HWPX/바이너리HWP 열기, 폴백, **egress-0**, PWA.
- 보안 하드게이트 전부 PASS(신규 zip 파서에 폭탄/XXE 가드 재사용 검증 포함).

## 아키텍처
- 렌더 코드베이스 1개(웹뷰어) + 전달 셸: 설치형 PWA(PC·폰 브라우저) + Android WebView 래퍼(같은 웹뷰어 재사용).
- 백엔드 0 · 문서 외부 유출 0(egress-0) · 순수 클라이언트.

## 남은 것 = 전부 사용자 개입 (docs/user-intervention.md)
| 항목 | 무엇 | 왜 CLI 불가 |
|---|---|---|
| **UI-3** | 실 문서 15~20개로 충실도 확정(PDF·DOCX·PPTX·HWP) | 개인문서 없음 |
| **UI-6** | 데스크톱 PWA 설치 후 파일 더블클릭 "바로 열기" 확인 | OS 파일연결 |
| **UI-4** | Android 빌드+사이드로드+카톡 "열기" 실기기 확인 | JDK/SDK/실기기 |
| **UI-1** | Vercel 배포 | OAuth 로그인 |

## 실기기 테스트 절차 (마지막, 사용자 수행)
```bash
bash scripts/sync-android-web.sh          # 웹뷰어 → Android 에셋
cd android && ./gradlew assembleDebug     # (JDK17+SDK 필요)
adb install -r app/build/outputs/apk/debug/app-debug.apk
# 폰에서 카톡 파일 → "다른 앱으로 열기" → 바로열기 선택 → 열람 확인
```

## iOS (수용된 한계, RISK-A)
- 애플 정책상 "다른 앱으로 열기" 자동 등록 = Xcode+서명 벽(CLI-only 위반). iOS는 "공유 → 뷰어" 수동 한 단계로 한정.
