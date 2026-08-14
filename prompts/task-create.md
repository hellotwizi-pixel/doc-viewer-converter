# task-create — Task/Phase 파일 생성 규격

> 이 문서는 `plan-and-build` 워크플로우 step 5에서 task/phase 파일을 만들 때 따르는 형식·절차다.
> 원본 규격 파일이 저장소에 없어, 레퍼런스 구현(`~/my-ai-agent/tasks/` + `~/my-ai-agent/scripts/run-phases.py`)의
> 실제 동작을 역설계해 이 프로젝트용으로 확정했다. `run-phases.py`가 실제로 파싱하는 규칙을 기준으로 삼는다.

## 산출 파일
1. `tasks/MAIN_TASK.md` — 프로젝트 전체 개요, phase 표, Go/No-Go 기준.
2. `tasks/phase-1.md`, `tasks/phase-2.md`, `tasks/phase-3.md` — phase별 상세.
3. `scripts/run-phases.py` — phase 순차 실행기(레퍼런스를 이 프로젝트에 맞게 수정).

## run-phases.py가 실제로 요구하는 규칙 (반드시 준수)
- phase 파일명은 정확히 `tasks/phase-{N}.md` (N=1,2,3).
- 각 phase 파일에는 **"체크리스트"** 라는 단어가 들어간 헤더(예: `**체크리스트:**`)가 있어야 하고,
  그 아래 `- [ ]` 항목들이 온다. `run-phases.py`는 "체크리스트" 등장 후 `- [` 로 시작하는 줄만 뽑아 출력한다.
- phase 파일 앞부분(처음 20줄) 중 `#`로 시작하지 않는 줄이 "요약"으로 출력되므로, 목표를 앞쪽에 서술한다.
- 상태는 `.phase-status.json`에 저장된다(current_phase, status, completed_phases). 손대지 않는다.
- Go/No-Go 조건은 `run-phases.py`의 `check_go_condition(phase)`에 phase별로 하드코딩된다 →
  이 프로젝트의 실제 DoD로 교체한다.

## MAIN_TASK.md 구조
- `# 메인 Task: <제목>`
- `## 프로젝트 개요` (목표/기간/상태/승인자)
- `## 전체 구조` (phase 트리)
- `## Phase별 상태 추적` (표)
- `## Go/No-Go 기준`
- `## 다음 단계`

## phase-N.md 구조
- `# Phase N: <이름>`
- `## 목표` (한두 줄, 앞쪽 = run-phases 요약에 노출)
- `## 세부 작업` (작업 항목 + 코드/스펙 블록)
- 각 작업 묶음 끝에 `**체크리스트:**` + `- [ ]` 목록
- `## 완료 정의(DoD)` — 정량 기준
- `## 산출물`
- `## 다음: Phase N+1`

## 절차
1. 확정된 구현계획을 phase 단위로 분해.
2. MAIN_TASK.md → phase-1/2/3.md 순으로 작성.
3. run-phases.py의 phase 이름/Go조건을 이 프로젝트 값으로 교체.
4. `python3 scripts/run-phases.py --status`로 파싱 정상 여부 확인.
