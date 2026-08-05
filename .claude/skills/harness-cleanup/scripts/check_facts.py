#!/usr/bin/env python3
"""문서에 박힌 개수·목록 표기를 뽑아 검토 지점을 제시한다.

자동 판정이 아니다. 개수와 목록은 맥락을 봐야 맞는지 알 수 있으므로
"여기가 틀리기 쉽다" 를 모아 보여 준다.

Usage: python3 check_facts.py [repo-root]
"""
import collections
import pathlib
import re
import sys

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

TARGET_GLOBS = [
    "CLAUDE.md",
    "README.md",
    ".claude/agents/*.md",
    ".claude/skills/*/SKILL.md",
    ".claude/*-overlay.md",
    "skills/*/SKILL.md",
    "skills/*/references/*.md",
]

# "N개 명령", "N개 파일", "16개" 처럼 개수를 박은 표기
COUNT = re.compile(r"(\d+)\s*개(?:\s*(명령|파일|패턴|항목|축|단계|행))?")
# 문서 안에 나열된 옵션 플래그
FLAG = re.compile(r"`(--[a-z][a-z0-9-]+)`")
# 코드 식별자로 보이는 백틱 조각 — 파일명 나열 여부 판단용
JSONFILE = re.compile(r"`([a-z][a-z0-9-]*\.json)`")


def targets():
    for g in TARGET_GLOBS:
        for p in sorted(ROOT.glob(g)):
            if p.is_file():
                yield p


def main():
    counts = []
    flags = collections.defaultdict(set)
    jsons = collections.defaultdict(set)

    for f in targets():
        rel = f.relative_to(ROOT)
        for i, line in enumerate(f.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
            if line.lstrip().startswith(("|", "#")) is False or True:
                for m in COUNT.finditer(line):
                    n, unit = m.group(1), m.group(2) or ""
                    # 버전·날짜·TTL 등은 대상이 아니다
                    if unit or int(n) > 2:
                        counts.append((rel, i, m.group(0).strip(), line.strip()[:70]))
            for fl in FLAG.findall(line):
                flags[fl].add(str(rel))
            for j in JSONFILE.findall(line):
                jsons[j].add(str(rel))

    print("## 개수 표기 — 늘거나 줄면 곧 틀린다")
    print("개수를 빼고 서술하는 것이 안전하다.\n")
    if counts:
        for rel, i, what, ctx in counts:
            print(f"  {rel}:{i}  \"{what}\"  — {ctx}")
    else:
        print("  없음")

    print("\n## 여러 문서에 흩어진 옵션 — 한 곳이 단일 소스여야 한다")
    multi = {k: v for k, v in flags.items() if len(v) >= 3}
    if multi:
        for k in sorted(multi, key=lambda x: -len(multi[x]))[:12]:
            print(f"  {k}: {len(multi[k])}개 문서 — {', '.join(sorted(multi[k])[:4])}")
    else:
        print("  없음")

    print("\n## 여러 문서에 나열된 캐시·설정 파일 — 목록이 갈라지기 쉽다")
    multi_json = {k: v for k, v in jsons.items() if len(v) >= 2}
    if multi_json:
        for k in sorted(multi_json):
            print(f"  {k}: {', '.join(sorted(multi_json[k]))}")
    else:
        print("  없음")

    print("\n## 직접 확인할 것")
    print("  - 위 개수가 실제와 맞는지 세어 본다 (`ls`, `--help`, `grep -c`)")
    print("  - 옵션이 실제로 있는지 `--help` 로 대조한다")
    print("  - 파일 목록은 코드(예: 캐시 경로 상수)와 대조한다")
    return 0


if __name__ == "__main__":
    sys.exit(main())
