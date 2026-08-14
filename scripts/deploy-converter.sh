#!/usr/bin/env bash
# 변환 서버(server/)를 Google Cloud Run에 배포한다. (안 쓰면 0으로 스케일 → 개인용 사실상 무료)
# 사전(사용자 1회): gcloud 설치됨 + `gcloud auth login` + 결제 사용설정된 프로젝트 선택.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${REGION:-asia-northeast3}"   # 서울
SERVICE="${SERVICE:-baro-converter}"

# gcloud이 PATH에 없으면 brew 설치 경로를 추가
if ! command -v gcloud >/dev/null 2>&1; then
  export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
fi
if ! command -v gcloud >/dev/null 2>&1; then
  echo "❌ gcloud를 찾을 수 없습니다. 'brew install --cask google-cloud-sdk' 후 다시 시도하세요."
  exit 1
fi

PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo "❌ 프로젝트가 설정되지 않았습니다. 먼저:"
  echo "   gcloud auth login"
  echo "   gcloud config set project <결제-사용설정된-프로젝트ID>"
  exit 1
fi
echo "▶ 프로젝트: $PROJECT / 리전: $REGION"

echo "▶ 필요한 API 사용설정 (run, cloudbuild, artifactregistry)"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

echo "▶ 빌드 서비스 계정에 권한 부여 (PERMISSION_DENIED 방지)"
PNUM="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${PNUM}-compute@developer.gserviceaccount.com"
for ROLE in roles/cloudbuild.builds.builder roles/logging.logWriter roles/artifactregistry.writer roles/storage.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA}" --role="$ROLE" --condition=None --quiet >/dev/null
done
echo "   권한 부여 완료: $SA"
echo "   (권한 반영에 최대 1분 걸릴 수 있어 잠시 대기)"
sleep 20

echo "▶ Cloud Run 배포 (Dockerfile로 자동 빌드)"
gcloud run deploy "$SERVICE" \
  --source "$ROOT/server" \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 2Gi --cpu 1 --timeout 120 --concurrency 2 --max-instances 3

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "✅ 배포 완료!"
echo "이 주소를 폰 앱의 ⚙︎(고화질 변환 서버)에 붙여넣으세요:"
echo "   $URL"
echo
echo "확인: curl $URL/health  → ok 가 나오면 정상"
