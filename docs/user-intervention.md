# 사용자 개입(User Intervention) 예약 목록

> 모든 구현은 local CLI로 수행하되, CLI로 대체 불가한 지점은 여기 기록해 추후 사용자가 직접 수행한다.
> 각 항목: **무엇을 / 왜 CLI 불가 / 어떻게 수행 / 무엇을 기록해 돌려줄지**.

## UI-1. Vercel 배포 인증 (Phase 1)
- **무엇**: `vercel` CLI로 정적 배포하려면 최초 1회 로그인/프로젝트 링크 필요.
- **왜 CLI 불가**: OAuth 로그인은 브라우저 인증 필요(비대화형 세션에서 토큰 발급 불가).
- **수행**: 대화형 셸에서 `vercel login` → `vercel link` → `vercel deploy`(프리뷰) / `vercel deploy --prod`. 또는 `VERCEL_TOKEN` 환경변수 발급 후 CLI에 주입.
- **대안(로그인 없이 검증)**: `npm run build` 후 `npx vite preview` 또는 `python3 -m http.server`로 로컬에서 PWA/렌더 전부 검증 가능. 배포만 인증 대기.

## UI-2. 축1 — 카톡 수신 경로 탭 수 측정 (Phase 1 DoD 인계분)
- **무엇**: 실 Android 기기에서 "카톡으로 파일 수신 → 공유시트/파일피커 → 뷰어 열람"까지 탭 수 + 로그인/광고/설치 무게 계측.
- **왜 CLI 불가**: 이 개발 머신엔 Android 기기·adb 없음. 카톡 앱·실기기 상호작용은 자동화 불가.
- **수행(측정 프로토콜)**:
  1. 대상 기기에 PWA 설치(배포 URL 접속 → "홈 화면에 추가").
  2. 카톡으로 자신에게 PDF 1개, DOCX 1개 전송.
  3. 경로 A(공유시트): 카톡 파일 → 공유 → 뷰어 선택 → 열람. 탭 수 기록.
  4. 경로 B(파일피커): 카톡에서 저장 → 뷰어 앱 열기 → 파일 선택 → 열람. 탭 수 기록.
  5. 동일 파일을 한컴뷰어로 열 때의 탭 수·로그인 노출·광고 노출도 같이 기록.
  6. [axis1-scorecard.md](axis1-scorecard.md) 채점표에 기입 → kill switch 판정.
- **돌려줄 것**: 채점표 채운 값(탭 수 A/B, 한컴 대비, 로그인/광고 노출 횟수).

## UI-3. 실 코퍼스 확보 (Phase 1 충실도 DoD 인계분)
- **무엇**: 실 카톡/메일 수신 PDF·DOCX 각 15~20개(`real` 태그) 확보.
- **왜 CLI 불가**: 개인 문서는 개발 환경에 없음. 프로그래매틱 픽스처는 충실도 분모가 될 수 없음(심사 결정).
- **수행**: 확보 가능분을 `corpus/`(gitignore)에 배치 후 `npm run corpus:score` 실행. 다양성 버킷(표/이미지/다단/한글폰트/대용량) 커버, ≥15개 목표.
- **돌려줄 것**: `real` 코퍼스 ≥15개면 채점 결과가 DoD 판정, 미달이면 DoD=UNVERIFIED로 남고 잔여 리스크 [business-risk.md](business-risk.md) 기록.

## UI-4. Android 네이티브 빌드 환경 (Phase 3, 조건부)
- **무엇**: JDK + Android SDK 설치, 실기기 USB 디버깅 연결, `adb install`로 sideload.
- **왜 CLI 불가(부분)**: 설치 자체는 CLI 가능(`brew install openjdk`, sdkmanager)하나, 실기기 연결·USB 디버깅 허용·intent-filter "열기" 노출 검증은 물리 기기 필요.
- **선행 조건**: Phase 1 축1 데이터가 "공유 한 단계 더"를 실제 불만으로 확인해 네이티브 투자를 정당화할 때만 착수.
- **수행**: `bash scripts/sync-android-web.sh`(웹뷰어→에셋) → `brew install --cask temurin`(JDK17) → Android SDK(`sdkmanager`) → `cd android && ./gradlew assembleDebug` → 기기 연결 → `adb install -r app/build/outputs/apk/debug/app-debug.apk` → 카톡 파일 "다른 앱으로 열기"에 바로열기 노출 확인. (상세: `android/README.md`)
- **돌려줄 것**: "열기" 목록 노출 여부 + 3탭 이내 열람 성공률(10회).

## UI-6. PC "바로 열기" 실동작 검증 (Phase 2)
- **무엇**: 데스크톱에 뷰어를 PWA로 설치하고, PDF/DOCX 파일을 더블클릭했을 때 뷰어로 바로 열리는지 확인.
- **왜 CLI 불가**: PWA 설치 + OS 파일 연결(file_handlers 권한 부여)은 브라우저/OS 상호작용이라 자동화 불가. (코드·manifest는 CLI로 완비됨)
- **수행**: 데스크톱 Chrome/Edge로 배포 URL 접속 → 주소창 설치 아이콘으로 "설치" → 설치 시 파일 형식 연결 허용 → 탐색기에서 PDF/DOCX 더블클릭(또는 우클릭>연결 프로그램>뷰어).
- **돌려줄 것**: 더블클릭 → 뷰어 오픈 성공 여부.

## UI-5. LibreOffice 설치 (Phase 3, 조건부 — HWP/PPTX 고화질 경로 실측용)
- **무엇**: `brew install libreoffice`(~1GB+) — HWP 변환 경로2 실측용.
- **왜 CLI 불가(부분)**: 설치는 CLI 가능하나 용량이 커 자동 강제하지 않음. Phase 2 코퍼스 확보 후에만 설치.
- **수행**: 코퍼스 확보 → 채점표 정의 → `brew install libreoffice` → `soffice --headless --convert-to pdf` 실측.
