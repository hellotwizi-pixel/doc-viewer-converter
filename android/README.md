# 바로열기 Android 래퍼 (P4)

카톡 "다른 앱으로 열기"에 뷰어를 노출하는 얇은 네이티브 래퍼. 렌더는 **동일 웹뷰어**(`assets/web`)가 담당한다.
`WebViewAssetLoader`의 https 가상 오리진으로 서빙해 Service Worker/ES 모듈이 정상 동작한다.

## 동작
1. 앱 아이콘/`ACTION_VIEW`/`ACTION_SEND`로 실행.
2. 받은 파일 URI를 읽어 base64로 `window.__openFromNative(base64, name, mime)` 주입.
3. 웹뷰어가 기존 파이프라인(pdf.js/mammoth/pptx/hwp)으로 렌더. 미지원은 폴백.

## 빌드 & 설치 (user-intervention UI-4 — JDK/SDK/실기기 필요)
```bash
# 1) 웹 뷰어를 Android 에셋으로 동기화
bash scripts/sync-android-web.sh

# 2) (최초 1회) JDK 17 + Android SDK 설치
#    brew install --cask temurin
#    Android Studio 또는 sdkmanager로 platform-tools, platforms;android-34, build-tools

# 3) 디버그 APK 빌드 + 사이드로드
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```
> gradle wrapper(`gradlew`)는 최초 `gradle wrapper` 실행 또는 Android Studio 임포트로 생성된다.
> 아이콘 리소스(`@mipmap/ic_launcher`)는 Android Studio 기본 생성물 사용.

## 실기기 검증 (P4 DoD)
- 카톡에서 PDF/DOCX/PPTX/HWP 파일 → "다른 앱으로 열기" 목록에 **바로열기** 노출 확인.
- 3탭 이내 열람 성공률 100%(10회) 기록 → `docs/axis1-scorecard.md`.

## 조건부 등록 원칙
- **딥링크 폴백으로 결론난 포맷은 intent-filter에서 빼야 한다**(안 열리는데 "열기"에 뜨면 UX 배신).
  현재 매니페스트는 P3에서 읽기수준 렌더가 되는 PDF/DOCX/PPTX/HWP/HWPX를 등록. 실측 후 조정.
