# doc-viewer 테스트 전략

> `plan-and-build` step 4의 참조 문서. 저장소에 기존 규격이 없어 house convention(Vitest/Jest 단위 + Playwright E2E, `~/otter-clone`)에 맞춰 이 프로젝트용으로 확정한다.
> 스택이 Vite+TS이므로 **단위/통합=Vitest(+jsdom), E2E=Playwright**를 채택한다.

## 테스트 레벨
### L1. 단위 (Vitest + jsdom) — 순수 로직, 브라우저 API 모킹
| 모듈 | 케이스 |
|---|---|
| `router` (확장자/MIME→렌더러 선택) | pdf→pdf, docx→docx, hwp/hwpx→unsupported(폴백), 대문자 확장자, 확장자 없음+MIME만, 알 수 없는 타입 |
| `sanitizer` (mammoth HTML 정화 — **DOMPurify 확정, 자체 화이트리스트 금지**) | 알려진 XSS 페이로드 벡터(공개 치트시트) 전부 무력화, `<script>`·`on*` 제거, `javascript:` 차단, **`data:image/png\|jpeg\|gif\|webp` 허용 & `data:image/svg+xml`·`data:text/html` 차단**, 정상 서식(`<h1><b><table>`) 보존. **테스트 대상은 자작 함수가 아니라 DOMPurify config** + mammoth 실제 출력 경로에서 raw HTML이 우회로 DOM 진입 안 함 |
| `errors` (분류) | 손상 파일→corrupt 상태, 미지원 포맷→unsupported 상태, 빈 파일, 초대용량 경계 |
| `state` (3상태 머신) | fileselect→viewport, viewport→fileselect(닫기), any→error, error→fileselect(재시도) |
| `filename` (표시 이스케이프) | `<img onerror=...>.pdf` 등 악성 파일명 → UI 표시 시 이스케이프(파일명 XSS 차단) |

### L2. 통합 (Vitest + jsdom, 실 라이브러리) — 렌더러 계약
> **주의(jsdom 한계):** jsdom엔 실 캔버스 픽셀이 없다 → 픽셀 검사는 L2에서 제외하고 L3(Playwright)로 이동한다. L2는 파싱·구조·텍스트레이어까지만.

| 모듈 | 케이스 |
|---|---|
| `pdfRenderer` | 샘플 PDF ArrayBuffer→**파싱 성공 + 페이지 수 정확 + `getTextContent()` non-empty(텍스트레이어)**, 페이지 이동/줌 상태, 손상 PDF→에러 throw. **보안 config 검증**: `isEvalSupported:false`, JS/annotation launch action 비활성 → JS 내장 PDF 미실행 assert |
| `docxRenderer` | 샘플 docx→non-empty sanitized HTML, 표/목록/헤딩 존재, 손상 docx→에러 throw. **압축 폭탄 가드**(해제 크기/비율 상한 초과 시 거부), **XML 엔티티 확장/XXE 방지**(외부 엔티티 비활성·엔티티 확장 상한) |
| `shareTargetSW` | SW가 POST(multipart) 가로채 파일 stash 후 viewer로 redirect(모킹된 SW 환경) — 보너스, 낮은 우선순위 |

### L3. E2E (Playwright, 실 브라우저) — 사용자 경로
| 시나리오 | 기대 |
|---|---|
| 파일피커로 PDF 열기 | 뷰포트에 페이지 렌더, 스크롤/줌 동작 |
| 파일피커로 DOCX 열기 | 본문 텍스트/서식 노출 |
| 드래그&드롭 | 위와 동일 |
| 미지원(.hwp) 열기 | 정직한 폴백 UI + "한컴뷰어로 열기" 안내 노출 |
| PDF/DOCX 렌더 픽셀 검증 | 실 브라우저 캔버스에 non-empty 렌더(스크린샷/픽셀) — L2에서 이관됨 |
| **프라이버시 egress-0 (필수 게이트)** | 파일 열람 시 **문서 바이트를 실은 아웃바운드 요청 0건**을 네트워크 인터셉트로 assert(동일 출처 앱셸/SW fetch만 허용). 프라이버시 약속의 유일한 실증 |
| PWA 설치가능성 | manifest 유효, SW 등록, 오프라인 앱셸 재로드 |
| Share Target(보너스) | 공유 POST→뷰포트(모킹 가능 범위) |

### L4. 충실도 코퍼스 채점 (테스트 아님, DoD 검증 하네스)
- Phase 1 렌더 충실도 DoD(PDF 정상 100% / DOCX 읽을수있음 ≥90%)의 **전제 = 채점 코퍼스**.
- 스크립트가 코퍼스 각 파일을 로드→**정상/읽을수있음/깨짐** 3단 채점표(JSON/CSV) 산출. 각 파일에 **`fixture | real` 태그** 부착.
- **충실도 DoD 산출 규칙(중요):**
  - **DoD 백분율은 `real` 부분집합으로만 산출.** 프로그래매틱 픽스처는 우리가 깨끗한 툴체인으로 만든 well-formed 파일이라 자동 100%가 나오므로 충실도 분모가 될 수 없다. 픽스처 통과율은 **별도 회귀 지표**로만 표기.
  - **최소 표본 게이트:** `real` 코퍼스가 다양성 버킷(표/이미지/다단/한글폰트/대용량)을 커버해 **≥15개** 안 되면 DoD 상태는 PASS가 아니라 **UNVERIFIED**. 소표본 100%를 PASS로 부르지 않는다.
  - **확보 불가분(개인문서):** 측정 프로토콜 인계는 잔여 리스크의 *이관*이지 해소가 아니다. Phase 1 DoD 결과는 "확보 코퍼스 기준 PASS **AND** 실세계 잔여 리스크 business-risk.md 기록"으로 적는다(택일 아님).
- **코퍼스 확보 정책**:
  - (자동) 프로그래매틱 픽스처(`fixture` 태그): CLI로 다양한 PDF/DOCX 생성(표·이미지·다단·한글 폰트·큰 파일). 단위/E2E 결정성·회귀 확보.
  - (실사용) 실 카톡/메일 수신 PDF·DOCX 각 15~20개(`real` 태그): 개발자가 확보 가능분은 `corpus/`(gitignore)에 배치. 확보 불가분은 **측정 프로토콜만 문서화해 user-intervention 인계**.
- Phase 2 HWP 코퍼스도 동일 정책(코퍼스 먼저 → 채점표 → LibreOffice 설치 → 실측).

## Phase별 테스트 범위 매핑
- **Phase 1**: L1(전부) + L2(pdf/docx) + L3(파일피커·드롭·미지원폴백·**egress-0**·PWA) + L4(PDF/DOCX 코퍼스 채점).
- **Phase 2**: L4(HWP 코퍼스 채점) + 경로1/경로2 비교 하네스. (편입 시 해당 렌더러 L1/L2 추가.)
- **Phase 3**: 네이티브 intent-filter E2E = **실기기 필요 → CLI 자동화 불가 → user-intervention 수동 계측 프로토콜**(축1과 동일 성격, 자동 게이트 아님). Phase 1 뷰어의 Android WebView 재사용 스모크 1건은 Phase 3 착수 시로 이연.

## 도구·규칙
- 러너: `vitest`(unit/integration), `@playwright/test`(e2e). 커버리지는 L1/L2 핵심 로직 우선.
- 브라우저 API 모킹: jsdom + pdf.js worker는 통합에서 실 worker/mock 선택.
- 픽스처는 `test/fixtures/`(생성 스크립트 포함), 실 코퍼스는 `corpus/`(gitignore).
- **하드 게이트(배포 필수 통과)**: ① sanitizer XSS 무력화(DOMPurify config) ② **프라이버시 egress-0** ③ zip bomb 가드 ④ XML 엔티티/XXE 방지 ⑤ PDF 내장 JS 비활성 ⑥ 파일명 이스케이프. router/state는 회귀 방지 핵심.
- **보안 관점**: 파일 파서 = 신뢰 불가 입력. Phase 1 구현 후 커밋 전 code-reviewer/security-auditor 게이트 재확인 권장.
