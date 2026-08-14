# Phase 1: MVP — PDF + DOCX 설치형 PWA (순수 클라이언트)

## 목표
카톡/메일로 받은 PDF·DOCX를 앱 내 파일피커로 즉시 열람하는, 백엔드 없는 설치형 PWA를 완성하고,
보안 하드게이트를 통과하며, 축1(전달 경로 마찰) 개발자측 데이터를 계측하고 사용자측 측정 프로토콜을 인계한다.
핵심 원칙: 편집 UI 전무(순수 뷰어), 문서 바이트는 기기를 떠나지 않는다(egress-0).

## 세부 작업

### 1-1. 스캐폴드 / PWA 셸
```
✓ Vite + TypeScript 프로젝트 (UI는 바닐라 TS, 프레임워크 없음)
✓ manifest.webmanifest: installable, share_target(POST/multipart), file_handlers 선언
✓ service worker: 앱 셸 오프라인 캐시(문서 데이터는 캐시 안 함 — 프라이버시)
✓ 3상태 UI 셸: (a)파일선택 (b)렌더 뷰포트 (c)에러/폴백
```
**체크리스트:**
- [ ] Vite+TS 스캐폴드, `npm run dev` 정상
- [ ] manifest(installable) + SW 등록, 오프라인 앱셸 재로드 확인
- [ ] 3상태 셸 + 상태 머신 골격

### 1-2. 파일 입력 (파일피커=주경로)
```
✓ <input type=file> 피커 (주경로, 항상 동작) + 드래그&드롭
✓ 확장자/MIME → 렌더러 라우팅(router)
✓ [보너스, 낮은 우선순위] Share Target: SW가 POST(multipart/form-data) 가로채
  → 파일 Cache/IndexedDB stash → 뷰어로 redirect. 실패해도 파일피커로 생존.
```
**체크리스트:**
- [ ] 파일피커 + 드래그&드롭으로 파일 로드
- [ ] router: 확장자/MIME → pdf/docx/unsupported 분기
- [ ] (보너스) SW POST share_target 수신 → stash → redirect

### 1-3. PDF 렌더러 (pdf.js)
```
✓ pdf.js 통합, 페이지 캔버스 렌더, 확대/축소·페이지 이동, 대용량 지연 로드
✓ 보안 config: isEvalSupported:false, JS/annotation launch action 비활성
```
**체크리스트:**
- [ ] PDF 페이지 렌더 + 줌/페이지 이동
- [ ] 보안 config 적용(JS 내장 PDF 미실행)
- [ ] 손상 PDF → 에러 상태 전이

### 1-4. DOCX 렌더러 (mammoth + DOMPurify)
```
✓ mammoth.js(docx→HTML) → DOMPurify 정화 후 표시 (자체 화이트리스트 금지)
✓ 압축 폭탄 가드(해제 크기/비율 상한), XML 엔티티 확장/XXE 방지
✓ data:image/(png|jpeg|gif|webp) 허용, data:image/svg+xml·data:text/html 차단
```
**체크리스트:**
- [ ] DOCX → sanitized HTML 렌더(표/목록/헤딩 보존)
- [ ] DOMPurify config로 XSS 벡터 무력화
- [ ] zip bomb / XXE 가드
- [ ] 손상 DOCX → 에러 상태 전이

### 1-5. 에러/폴백 + 파일명 안전
```
✓ 미지원 포맷(HWP 등)·손상 파일 → 정직한 폴백 UI + "한컴뷰어로 열기" 안내/딥링크
✓ 파일명 표시 시 이스케이프(파일명 XSS 차단)
```
**체크리스트:**
- [ ] 미지원(.hwp) → 폴백 + 한컴뷰어 안내
- [ ] 파일명 이스케이프 표시

### 1-6. 테스트 (L1~L3) + 코퍼스 채점 (L4)
```
✓ Vitest: router/sanitizer/errors/state/filename (L1), pdfRenderer/docxRenderer (L2)
✓ Playwright: 파일피커 PDF/DOCX, 드롭, 미지원 폴백, PWA, [필수]egress-0, 픽셀 렌더 (L3)
✓ 코퍼스 채점 하네스: fixture|real 태그, DoD는 real 부분집합으로만 산출
```
**체크리스트:**
- [ ] L1 단위 테스트 통과
- [ ] L2 통합 테스트 통과(픽셀검사는 L3)
- [ ] L3 E2E 통과 (egress-0 하드게이트 포함)
- [ ] 프로그래매틱 픽스처 생성 스크립트 + `npm run corpus:score`

### 1-7. 축1 계측(개발자측) + 문서
**체크리스트:**
- [ ] axis1-scorecard.md A섹션(인앱 탭/번들·설치 무게/로그인·광고=0) 계측 기입
- [ ] business-risk.md(H1+kill switch), user-intervention.md(UI-2 카톡 프로토콜) 확정
- [ ] 카톡경로 측정 프로토콜 user-intervention 인계 완료

### 1-8. 빌드 / 로컬 검증
```
✓ npm run build → 번들 크기 확인(경량 목표) → vite preview로 PWA/렌더 로컬 검증
✓ 배포 인증(vercel login/link)은 user-intervention UI-1로 인계
```
**체크리스트:**
- [ ] 빌드 성공 + 번들 크기 기록
- [ ] 로컬 preview에서 전 기능 동작 확인

---

## 완료 정의(DoD)
- PDF 정상 100%, DOCX 읽을수있음 ≥90% — **real 코퍼스 기준**. real<15개면 상태=**UNVERIFIED**(픽스처 통과율은 별도 회귀지표).
- 보안 하드게이트 전부 통과: sanitizer(XSS)·**egress-0**·zip bomb·XXE·PDF내장JS비활성·파일명이스케이프.
- 축1 **개발자측 계측 완료 + 카톡경로 측정 프로토콜 user-intervention 인계**.
- **H1은 여기서 완결되지 않음**: 사용자측 실기기 데이터 필요. Phase 1 = "H1 판정용 개발자측 데이터 + 측정 프로토콜 인계까지". 실세계 잔여 리스크는 business-risk.md에 기록.
- ⚠️ "출하됨"이 아니라 "측정됨"이 Phase 1의 끝.

## 산출물
- `/src/`(뷰어), `/test/`(L1~L3), 코퍼스 채점 하네스, `/dist/`(빌드), 채운 axis1-scorecard.

## 다음: Phase 2 (PC "바로 열기" file_handlers) — 상세는 `phase-2.md`
> 재설계(2026-07-21): HWP는 P3(포맷 확장)로 이동. P2는 이미 되는 PDF+DOCX에 PC 바로열기를 붙이는 최저비용 단계.
