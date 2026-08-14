#!/usr/bin/env bash
# 웹 뷰어를 빌드해 Android 에셋으로 복사한다. (Android 래퍼는 동일 웹뷰어를 재사용)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "▶ 웹 빌드"
npm run build

DEST="android/app/src/main/assets/web"
echo "▶ dist → $DEST"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R dist/* "$DEST/"

echo "✅ 완료: $DEST"
echo "다음: cd android && ./gradlew assembleDebug && adb install -r app/build/outputs/apk/debug/app-debug.apk"
