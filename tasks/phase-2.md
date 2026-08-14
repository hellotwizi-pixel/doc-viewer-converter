# Phase 2: PC "바로 열기" (file_handlers, 순수 웹)

## 목표
이미 되는 PDF+DOCX에 대해, PC에서 받은 파일을 **더블클릭하면 이 뷰어로 바로 열리게** 한다.
데스크톱 Chrome/Edge 설치형 PWA의 File Handling API(file_handlers + launchQueue)를 쓴다.
네이티브 0 · 서명 0 · 보안 신규표면 0 → 요구4("바로 열기")를 가장 싸게 충족하는 단계.

## 세부 작업
```
✓ manifest file_handlers 선언 (PDF/DOCX MIME·확장자) — 반영됨
✓ launchQueue.setConsumer로 실행 시 전달 파일 수신 → openFile — 반영됨(src/main.ts)
✓ 모바일 무동작 확인(Android는 P4 네이티브가 담당, iOS는 RISK-A로 제외)
```
**체크리스트:**
- [ ] manifest file_handlers 선언 확인
- [ ] launchQueue 소비자 등록 + 파일 수신 → 렌더
- [ ] 데스크톱 설치형 PWA에서 파일 더블클릭 → 뷰어 오픈 실동작 (user-intervention: 설치+연결)

## 완료 정의(DoD)
- 데스크톱 Chrome/Edge에 설치한 뷰어에서 **PDF/DOCX 파일 더블클릭(또는 우클릭>연결 프로그램) → 뷰어로 바로 열림** 실동작.
- (설치+OS 파일연결 검증은 실사용 환경 필요 → user-intervention UI-6로 계측 인계. 코드/manifest는 CLI로 완비.)

## 산출물
- file_handlers manifest + launchQueue 소비자(구현됨). 데스크톱 바로열기 검증 기록.

## 다음: Phase 3 (포맷 확장 PPTX·HWP) — 상세는 `phase-3.md`
