# doc-viewer 구현계획 초안 (tech-critic-lead 피드백용)

## 확정 사항 (심사 통과)
- **제품**: 편집 불가 순수 문서 뷰어. 카톡/메일로 받은 파일을 즉시 열람.
- **플랫폼 전략**: Phase 1 = 설치형 PWA(도달성이 아니라 *검증 경제성*을 위한 저비용 프로브 겸 실사용 제품).
  Phase 3 = 네이티브 Android intent-filter(진짜 ACTION_VIEW "열기")는 프로브 데이터가 정당화할 때만 착수.
  iOS·구형 .doc = 스코프 아웃.
- **렌더링**: MVP는 PDF(pdf.js) + DOCX(mammoth.js) **2렌더러, 백엔드 0, 순수 클라이언트**. 변환 서버 없음(프라이버시).
- **HWP/HWPX**: MVP 제외. Phase 2에서 코퍼스 실측 게이트 통과 후 편입 결정.
- **스택**: Vite + TypeScript + Service Worker(PWA/오프라인). **UI는 바닐라 TS**(3상태 앱 → 프레임워크 이득 얇음, 번들 경량 = 축1 유리). Vercel CLI 정적 배포.
- **진입 경로**: **앱 내 "파일 열기" 피커가 주경로**(항상 동작). Web Share Target(ACTION_SEND)은 "되면 보너스". 드래그&드롭 데스크톱 보조.

## 게이트 (심사에서 강화된 조건)
- **H1 가설 + kill switch** (`docs/business-risk.md`):
  - H1: 한컴뷰어/Drive 대비 "카톡 수신→열람"의 탭 수/전환 마찰을 유의미하게 줄인다.
  - 반증조건(정량): 동일 카톡 수신 파일 기준 뷰어 화면 도달 탭 수가 한컴뷰어 경로보다 **최소 1탭 이상 적고, 로그인/광고 노출 0회**. 미충족 시 H1 기각 → 재심사.
  - 축1 채점표에 "탭 수"뿐 아니라 **로그인/광고/설치 무게** 항목 포함(이미 설치된 한컴뷰어 대비 진짜 승부처).
- **Phase 1 DoD = 렌더 충실도 AND 축1 프로브 계측 완료.** "출하됨"이 아니라 "측정됨"이 Phase 1의 끝.
- **Phase 2 프로브 순서**: 실 HWP/HWPX 코퍼스(각 10~20개) 확보 → 채점표 정의 → LibreOffice 설치 → 실측.
- **user-intervention 예약**(`docs/user-intervention.md`): Vercel 로그인/배포, (Phase 3) JDK+Android SDK 설치·adb sideload·기기 연결.

---

## Phase 1 — MVP: PDF + DOCX 설치형 PWA (순수 클라이언트)
목표: 카톡/메일로 받은 PDF·DOCX를 앱 내 파일 피커로 즉시 열람하는, 백엔드 없는 설치형 PWA를 출하하고 **축1을 계측**한다.

작업 묶음:
1. **스캐폴드/PWA**: Vite+TS, `manifest.webmanifest`(installable, file_handlers/share_target 선언), service worker(앱 셸 오프라인 캐시), 기본 3상태 UI(파일선택 / 뷰포트 / 에러·폴백).
2. **파일 입력**: `<input type=file>` 피커(주경로) + 드래그&드롭 + Web Share Target 수신 핸들러(보너스). 확장자/MIME 라우팅.
3. **PDF 렌더러**: pdf.js 통합, 페이지 캔버스 렌더, 확대/축소·페이지 이동, 대용량 지연 로드.
4. **DOCX 렌더러**: mammoth.js(docx→HTML), 출력 HTML **sanitize**(XSS 차단), 기본 서식 스타일.
5. **에러/폴백**: 미지원 포맷(HWP 등)·손상 파일 → 정직한 안내 + "한컴뷰어로 열기" 딥링크/설치 안내.
6. **축1 계측 도구**: 탭 수/로그인/광고/설치무게 채점표 템플릿(`docs/axis1-scorecard.md`) + 측정 기록 절차.
7. **문서**: business-risk.md, user-intervention.md.
8. **배포**: `vercel deploy`(CLI) 정적 배포, 설치형 PWA 동작 확인.

DoD: PDF 정상 렌더 100%(코퍼스), DOCX "읽을 수 있음 이상" ≥90%(코퍼스), **AND** 축1 프로브 측정치(파일피커/공유시트 두 경로) 수집 완료.

## Phase 2 — HWP/HWPX 편입 결정 (실측 게이트)
목표: HWP/HWPX를 자체 렌더할지, 로컬 변환할지, 아예 딥링크로 넘길지를 **데이터로** 결정하고 편입.

작업 묶음:
1. **코퍼스 확보**: 실 .hwp/.hwpx 각 10~20개 + 채점표(정상/읽을수있음/깨짐) 정의(코드보다 먼저).
2. **경로1 프로토타입**: client-only .hwpx(zip+OWPML) 파서·부분 렌더. 서버·설치 0, 프라이버시 안전. 구형 .hwp(5.0 바이너리) 제외.
3. **경로2 실측**: LibreOffice headless(`soffice --headless --convert-to pdf`) → pdf.js. 로컬 CLI 실행(서버 업로드 금지).
4. **비교·결정**: 두 경로 채점 비교 + "한컴뷰어보다 나쁘지 않은가" 판정 → 편입 방식 확정.
5. **편입**: 채택 경로를 뷰어에 통합(구형 .doc는 변환 파이프라인 생기면 보너스로만).

DoD: HWP "읽을 수 있음 이상" ≥70% **이면서** 동일 파일에서 한컴뷰어보다 나쁘지 않을 것. 미달 시 → 자체 렌더 폐기, 딥링크 폴백 확정.

## Phase 3 — 네이티브 Android intent-filter (조건부: 진짜 ACTION_VIEW)
목표: 카톡 "다른 앱으로 열기" 목록에 뷰어가 직접 뜨게 한다. **Phase 1 프로브에서 "공유 한 단계 더"가 실제 불만으로 확인될 때만 착수.**

작업 묶음:
1. **착수 게이트 확인**: Phase 1 축1 데이터로 네이티브 투자 정당성 판정.
2. **환경**(user-intervention): JDK + Android SDK 설치, 기존 debug.keystore 재사용.
3. **앱 셸**: 최소 네이티브 래퍼(WebView로 Phase 1 뷰어 재사용) + PDF/DOCX/HWP intent-filter(ACTION_VIEW, MIME/확장자) 등록.
4. **배포**: `./gradlew assembleDebug` → `adb install` sideload(개인용, Play Store 불필요).

DoD: 실기기에서 카톡 수신 파일 "열기" 목록에 뷰어 노출 + 3탭 이내 열람 100%(10회).

---

## 심사 확정 후 반영사항 (신뢰도 88, 게이트 강화 4건 — task 파일에 반드시 반영)
1. **run-phases.py `check_go_condition` 교체**: OtterKo 음성앱 하드코딩 조건 → doc-viewer DoD로 교체. 작성 후 `python3 scripts/run-phases.py --status` 파싱 실행 검증(문서만 믿지 않음).
2. **Phase 1 "축1 측정" DoD 재정의**: 이 개발 머신엔 Android 기기·adb 없음 → 카톡 공유시트 탭 수는 개발자도 측정 불가. DoD = *채점표 완비 + 개발자측 측정가능분(인앱 파일피커 탭 수, 번들/설치 무게, 로그인·광고 0회) 계측 + 카톡경로 측정 프로토콜을 user-intervention에 인계*. "개발자 셀프 계측"을 이 범위로 한정 표기.
3. **H1은 Phase 1에서 완결 안 됨**: 한컴뷰어 대비 탭 수 결정 비교는 사용자측 실기기 데이터 필요. business-risk.md + Phase 1 DoD 양쪽에 "Phase 1 = H1 판정용 개발자측 데이터 + 사용자측 측정 프로토콜 인계까지"라고 명시.
4. **Phase 3 HWP intent-filter 조건부 종속**: Phase 2가 "HWP=딥링크 폴백"으로 결론나면 HWP를 자체 처리로 등록 금지(안 열리는데 "열기"에 뜨면 UX 배신). phase-3.md에 "HWP intent-filter 등록 = Phase 2 자체렌더 채택 시에만" 명시.
5. **Share Target = SW POST 핸들러**(작업묶음 2 세분화): `share_target: method=POST, enctype=multipart/form-data`를 service worker가 가로채 Cache/IndexedDB에 stash 후 뷰로 redirect하는 게 핵심 공수. 별도 항목으로 분리하되 우선순위 낮음(실패해도 파일피커로 생존).
6. **prompt_go_nogo는 stdin 수동 판정 게이트**: phase 전환은 완전 자율 아님(오케스트레이터가 판정 주체) — 인지.

## tech-critic-lead에게 확인 요청하는 논의점
1. **task-create.md 부재**: 저장소에 규격 파일이 없어 레퍼런스(`~/my-ai-agent`)를 역설계해 `prompts/task-create.md`를 새로 확정했다. run-phases.py도 3-phase 구조라 딱 맞는다. 이 대체가 타당한가?
2. **바닐라 TS 확정**: React 대신 바닐라 TS로 못 박았다(번들 경량=축1 유리). 뷰어 상태가 3개뿐이라 유지보수도 OK로 본다. 이견 있나?
3. **Phase 경계**: MVP를 PDF+DOCX 한 phase로 묶었는데, PDF와 DOCX를 각각 sub-DoD로 쪼갤 필요가 있나, 아니면 한 phase가 적정한가?
4. **축1 계측의 현실성**: 실기기 카톡 수신 시나리오 탭 수 계측은 사용자 기기가 필요할 수 있다(자동화 불가 영역). 이걸 user-intervention으로 예약하고, Phase 1 DoD의 "축1 측정"은 *측정 절차/채점표 완비 + 개발자 셀프 계측*까지로 정의하는 게 맞나?
5. **놓친 리스크**: 이 3-phase 분해에서 크리티컬 패스나 순서 오류가 있나?
