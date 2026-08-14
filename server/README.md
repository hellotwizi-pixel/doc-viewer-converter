# 변환 서버 (PPT·한글·구형포맷 → PDF)

LibreOffice headless로 문서를 PDF로 변환해, 앱이 **원본 충실도**로 보게 한다.
변환 후 임시파일은 즉시 삭제(프라이버시). PDF/DOCX는 앱이 자체 렌더하므로 이 서버를 거치지 않는다.

## 로컬 실행 (같은 Wi-Fi에서 폰이 접근 가능)
```bash
# 이 맥에 LibreOffice가 설치돼 있어야 함 (brew install --cask libreoffice)
node server/convert.mjs           # http://<맥 LAN IP>:8787
```
앱 ⚙︎에 `http://<맥의 IP>:8787` 입력. 단 맥이 켜져 있고 같은 Wi-Fi일 때만 됨.

## 클라우드 배포 (항상 접속 가능, 개인용 사실상 무료)
Google Cloud Run은 **안 쓸 때 0으로 스케일**되어 개인 사용량은 무료 한도 내.
```bash
# 1) (최초 1회) gcloud 설치 + 로그인 + 결제 사용설정된 프로젝트
#    brew install --cask google-cloud-sdk
#    gcloud auth login && gcloud config set project <내프로젝트>
# 2) 배포 (Dockerfile로 자동 빌드·배포)
bash scripts/deploy-converter.sh
# 3) 출력된 URL을 앱 ⚙︎ "고화질 변환 서버"에 붙여넣기
```
> 다른 호스트(Fly.io/Render 등)도 `server/Dockerfile`로 동일하게 배포 가능.

## API
- `POST /convert` — body=파일 바이트, 헤더 `X-Filename: 원본이름.pptx` → PDF 바이트
- `GET /health` → `ok`
