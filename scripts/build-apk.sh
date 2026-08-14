#!/usr/bin/env bash
# 안드로이드 디버그 APK를 처음부터 끝까지 빌드한다(개발 머신 1회 셋업 포함).
# 산출물: android/app/build/outputs/apk/debug/app-debug.apk
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK="$HOME/Library/Android/sdk"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"

echo "▶ [1/6] JDK 17 확인/설치"
if ! /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
  brew install openjdk@17
fi
export JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || echo /opt/homebrew/opt/openjdk@17)"
export PATH="$JAVA_HOME/bin:$PATH"
echo "JAVA_HOME=$JAVA_HOME"
java -version

echo "▶ [2/6] Android SDK 패키지 설치 (platform-tools, android-34, build-tools)"
mkdir -p "$SDK"
yes | sdkmanager --sdk_root="$SDK" --licenses >/dev/null 2>&1 || true
sdkmanager --sdk_root="$SDK" "platform-tools" "platforms;android-34" "build-tools;34.0.0"

echo "▶ [3/6] gradle 확인/설치"
if ! command -v gradle >/dev/null 2>&1; then
  brew install gradle
fi
gradle --version | head -3

echo "▶ [4/6] local.properties 기록"
echo "sdk.dir=$SDK" > "$ROOT/android/local.properties"

echo "▶ [5/6] 웹뷰어 → 안드로이드 에셋 동기화"
bash "$ROOT/scripts/sync-android-web.sh"

echo "▶ [6/6] APK 빌드"
cd "$ROOT/android"
gradle --no-daemon assembleDebug

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK" ]; then
  echo "✅ APK 완성: $APK"
  ls -lh "$APK"
else
  echo "❌ APK를 찾지 못했습니다."
  exit 1
fi
