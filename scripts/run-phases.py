#!/usr/bin/env python3
"""
Run-Phases Script: doc-viewer(편집 불가 문서 뷰어) 프로젝트 실행기

역할:
- Phase 1, 2, 3를 순차적으로 추적
- 각 Phase의 Go/No-Go(DoD) 조건 확인
- 다음 Phase로의 진행 여부 결정

사용법:
  python3 scripts/run-phases.py           # 현재 Phase 시작
  python3 scripts/run-phases.py --phase 2 # Phase 2부터 시작
  python3 scripts/run-phases.py --status  # 현재 상태 조회
  python3 scripts/run-phases.py --phase 1 --complete  # Phase 1 완료 판정
"""

import sys
import json
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
TASKS_DIR = PROJECT_ROOT / "tasks"
STATUS_FILE = PROJECT_ROOT / ".phase-status.json"


class PhaseRunner:
    def __init__(self):
        self.phases = {
            1: "Phase 1: MVP — PDF + DOCX 설치형 PWA + 실코퍼스 게이트",
            2: "Phase 2: PC '바로 열기' (file_handlers)",
            3: "Phase 3: 포맷 확장 — PPTX · HWP (측정 게이트)",
            4: "Phase 4: 네이티브 Android WebView 래퍼 (조건부)",
        }
        self.status = self.load_status()

    def load_status(self):
        if STATUS_FILE.exists():
            with open(STATUS_FILE, "r") as f:
                return json.load(f)
        return {
            "current_phase": 1,
            "status": "not_started",
            "start_date": None,
            "completed_phases": [],
        }

    def save_status(self):
        with open(STATUS_FILE, "w") as f:
            json.dump(self.status, f, indent=2, ensure_ascii=False)

    def print_header(self, phase):
        print("\n" + "=" * 70)
        print(f"  {self.phases[phase]}")
        print("=" * 70 + "\n")

    def print_checklist(self, phase):
        phase_file = TASKS_DIR / f"phase-{phase}.md"
        if phase_file.exists():
            with open(phase_file, "r") as f:
                content = f.read()
                lines = content.split("\n")
                in_checklist = False
                print("📋 Phase 체크리스트:")
                print("-" * 70)
                for line in lines:
                    if "체크리스트" in line:
                        in_checklist = True
                    elif in_checklist:
                        if line.startswith("- ["):
                            print(f"  {line}")
                print("-" * 70 + "\n")

    def start_phase(self, phase):
        self.print_header(phase)
        phase_file = TASKS_DIR / f"phase-{phase}.md"
        if not phase_file.exists():
            print(f"❌ Phase {phase} 파일을 찾을 수 없습니다: {phase_file}")
            return False
        print(f"📂 Phase {phase} 시작\n파일: {phase_file}\n")
        with open(phase_file, "r") as f:
            lines = f.readlines()
            for line in lines[:20]:
                if line.strip() and not line.startswith("#"):
                    print(line.rstrip())
        print("\n" + "-" * 70)
        print(f"전체 내용: {phase_file}")
        print("-" * 70 + "\n")
        self.print_checklist(phase)
        return True

    def check_go_condition(self, phase):
        """doc-viewer의 실제 DoD (MAIN_TASK.md / phase-N.md와 동기화)."""
        if phase == 1:
            return [
                "✓ PDF 정상 렌더 100% (real 코퍼스 기준)",
                "✓ DOCX 읽을수있음 이상 ≥90% (real<15개면 UNVERIFIED)",
                "✓ 보안 하드게이트: sanitizer(XSS)·egress-0·zip bomb·XXE·PDF내장JS비활성·파일명이스케이프",
                "✓ 축1 개발자측 계측 완료 + 카톡경로 측정 프로토콜 user-intervention 인계",
                "✓ (H1은 Phase 1에서 완결 안 됨 — 사용자측 데이터 필요)",
            ]
        elif phase == 2:
            return [
                "✓ 데스크톱 설치형 PWA에서 파일 더블클릭 → 뷰어 오픈 실동작 (file_handlers)",
                "✓ manifest file_handlers + launchQueue 소비자 구현",
                "✓ 모바일 무동작 확인(Android는 P4, iOS는 RISK-A 제외)",
            ]
        elif phase == 3:
            return [
                "✓ PPTX/HWP 코퍼스 실측 후 {클라 렌더 | 딥링크 폴백} 데이터로 결정(선확정 금지)",
                "✓ 편입 포맷: 읽기 ≥임계 AND 한컴/파워포인트보다 나쁘지 않음",
                "✓ 신규 파서 보안 6종 하드게이트 재증명 + CJK 폰트 깨짐 없음",
                "✓ HWP는 .hwp:.hwpx 실비율 먼저 측정(RISK-C)",
            ]
        elif phase == 4:
            return [
                "✓ (착수 게이트) 축1 정당화 AND 해당 포맷 P3 통과",
                "✓ 실기기 카톡 '열기' 목록에 뷰어 노출 + 3탭 이내 열람 100%(10회)",
                "✓ 딥링크 폴백 포맷은 intent-filter 등록 금지",
            ]
        return []

    def prompt_go_nogo(self, phase):
        print("\n" + "=" * 70)
        print(f"Phase {phase} Go/No-Go 판정")
        print("=" * 70)
        print("\n✅ Go(DoD) 조건:")
        for cond in self.check_go_condition(phase):
            print(f"  {cond}")
        print("\n판정 선택:\n  1) GO   2) NO-GO   3) CANCEL")
        choice = input("\n선택 (1/2/3): ").strip()
        return {"1": "GO", "2": "NO-GO"}.get(choice, "CANCEL")

    def run_phase(self, phase):
        if not self.start_phase(phase):
            return False
        print(f"\n🚀 Phase {phase} 실행 중...")
        print(f"시작: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"완료 후: python3 scripts/run-phases.py --phase {phase} --complete\n")
        self.status["current_phase"] = phase
        self.status["status"] = "in_progress"
        self.status["start_date"] = datetime.now().isoformat()
        self.save_status()
        return True

    def complete_phase(self, phase):
        print(f"\n📊 Phase {phase} 완료 평가")
        decision = self.prompt_go_nogo(phase)
        if decision == "CANCEL":
            print("❌ 취소되었습니다.")
            return False
        if decision == "GO":
            print(f"\n✅ Phase {phase} Go 판정!")
            self.status["completed_phases"].append(
                {"phase": phase, "status": "GO", "completed_date": datetime.now().isoformat()}
            )
            if phase < 4:
                print(f"\n➡️ Phase {phase+1}으로 진행: python3 scripts/run-phases.py --phase {phase+1}")
                self.status["current_phase"] = phase + 1
            else:
                print("\n🎉 프로젝트 1차 완료!")
                self.status["status"] = "completed"
        else:
            print(f"\n⚠️ Phase {phase} No-Go. 조건 재확인 후 재시도.")
            self.status["completed_phases"].append(
                {"phase": phase, "status": "NO-GO", "completed_date": datetime.now().isoformat()}
            )
            self.save_status()
            return False
        self.save_status()
        return True

    def show_status(self):
        print("\n" + "=" * 70)
        print("📊 doc-viewer 프로젝트 상태")
        print("=" * 70 + "\n")
        print(f"현재 Phase: {self.status['current_phase']}")
        print(f"상태: {self.status['status']}")
        print(f"시작일: {self.status['start_date'] or 'Not started'}")
        if self.status["completed_phases"]:
            print("\n완료한 Phase:")
            for p in self.status["completed_phases"]:
                print(f"  Phase {p['phase']}: {p['status']} ({p['completed_date']})")
        print("\n--- Phase 목록 ---")
        for n, name in self.phases.items():
            print(f"  {name}")
        print("\n" + "=" * 70 + "\n")

    def main(self):
        import argparse

        parser = argparse.ArgumentParser(description="doc-viewer Phase 실행기")
        parser.add_argument("--phase", type=int, help="특정 Phase 실행 (1/2/3)")
        parser.add_argument("--complete", action="store_true", help="현재 Phase 완료 판정")
        parser.add_argument("--status", action="store_true", help="현재 상태 조회")
        parser.add_argument("--reset", action="store_true", help="상태 초기화")
        args = parser.parse_args()

        if args.status:
            self.show_status()
            return
        if args.reset:
            print("⚠️ 상태를 초기화하시겠습니까? (y/n): ", end="")
            if input().strip().lower() == "y":
                self.status = {
                    "current_phase": 1,
                    "status": "not_started",
                    "start_date": None,
                    "completed_phases": [],
                }
                self.save_status()
                print("✅ 초기화되었습니다.")
            return

        phase = args.phase or self.status["current_phase"]
        if not (1 <= phase <= 4):
            print(f"❌ 잘못된 Phase: {phase}")
            return
        if args.complete:
            self.complete_phase(phase)
        else:
            self.run_phase(phase)


if __name__ == "__main__":
    PhaseRunner().main()
