# Phase 4: 네이티브 Android WebView 래퍼 + intent-filter (조건부)

## 목표
카톡 "다른 앱으로 열기" 목록에 뷰어가 직접 뜨게 한다(ACTION_VIEW). PWA는 이 목록에 못 낀다.
속은 **Phase 1~3의 동일 웹뷰어를 Android WebView로 재사용** — 렌더 코드 재작성 없음.
**착수 게이트**: (a) 축1 데이터가 네이티브 투자 정당화 AND (b) 해당 포맷이 P3 게이트 통과.
딥링크 폴백으로 결론난 포맷은 intent-filter 등록 금지(안 열리는데 "열기"에 뜨면 UX 배신).

## 세부 작업
```
✓ 착수 게이트 확인(축1 + 포맷별 P3 결과)
✓ 환경(user-intervention UI-4): JDK+Android SDK, 기존 debug.keystore 재사용
✓ WebView 래퍼로 동일 웹뷰어 로드 + intent-filter(ACTION_VIEW, MIME/확장자)
  - PDF/DOCX: 등록. PPTX/HWP: P3에서 '자체 렌더 채택' 시에만 등록
✓ WebView 엔진 스모크 테스트
✓ adb sideload 배포(개인용, Play Store 불필요)
```
**체크리스트:**
- [ ] 착수 게이트 판정(축1 + P3)
- [ ] JDK/SDK 설치 (user-intervention)
- [ ] WebView 래퍼 + 조건부 intent-filter 등록
- [ ] WebView 스모크 테스트
- [ ] adb install + 카톡 "다른 앱으로 열기" 노출 확인(실기기)

## 완료 정의(DoD)
- 실기기에서 카톡 수신 파일 "열기" 목록에 뷰어 노출 + 3탭 이내 열람 100%(10회).
- (실기기 검증 = user-intervention 수동 계측, 자동 게이트 아님.)

## 산출물
- Android WebView 래퍼(APK), 조건부 intent-filter, 실기기 검증 기록.

## 프로젝트 종료
- P4 완료(또는 미착수 종결) 시 doc-viewer 로드맵 1차 완료. iOS는 RISK-A 한계로 별도.
