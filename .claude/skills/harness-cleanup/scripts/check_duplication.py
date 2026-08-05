#!/usr/bin/env python3
"""지침 파일 사이에서 같은 내용이 반복되는 구간을 찾는다.

연속 N줄 이상이 다른 파일과 일치하면 보고한다.
"A 가 단일 소스다" 라고 적어 두고 내용을 복사한 경우가 가장 흔하다.

Usage: python3 check_duplication.py [repo-root] [최소-연속-줄수]
"""
import collections
import pathlib
import sys

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
MIN_RUN = int(sys.argv[2]) if len(sys.argv) > 2 else 3

TARGET_GLOBS = [
    "CLAUDE.md",
    ".claude/agents/*.md",
    ".claude/skills/*/SKILL.md",
    ".claude/*-overlay.md",
    "skills/*/SKILL.md",
    "skills/*/references/*.md",
]


def normalize(line):
    return " ".join(line.split())


def load():
    docs = {}
    for g in TARGET_GLOBS:
        for p in sorted(ROOT.glob(g)):
            if p.is_file():
                rel = str(p.relative_to(ROOT))
                docs[rel] = p.read_text(encoding="utf-8", errors="replace").splitlines()
    return docs


def main():
    docs = load()
    if not docs:
        print("대상 파일을 찾지 못했다 — repo root 에서 실행하는지 확인하라", file=sys.stderr)
        return 2

    # 정규화한 줄 → (파일, 줄번호) 목록
    index = collections.defaultdict(list)
    for name, lines in docs.items():
        for i, line in enumerate(lines):
            n = normalize(line)
            # 짧은 줄, 구분선, 표 구분자, 구조 태그는 제외 — 우연히 겹친다
            if len(n) < 15 or set(n) <= set("|-: "):
                continue
            if n.startswith("<") and n.endswith(">"):
                continue
            if n.startswith("```"):
                continue
            index[n].append((name, i))

    # 두 파일 사이의 연속 일치 구간을 모은다
    runs = []
    seen = set()
    for n, places in index.items():
        if len(places) < 2:
            continue
        for a in range(len(places)):
            for b in range(a + 1, len(places)):
                (fa, ia), (fb, ib) = places[a], places[b]
                if fa == fb:
                    continue
                key = (fa, ia, fb, ib)
                if key in seen:
                    continue
                # 아래로 얼마나 이어지는지 센다
                length = 0
                while True:
                    ja, jb = ia + length, ib + length
                    if ja >= len(docs[fa]) or jb >= len(docs[fb]):
                        break
                    if normalize(docs[fa][ja]) != normalize(docs[fb][jb]):
                        break
                    seen.add((fa, ja, fb, jb))
                    length += 1
                if length >= MIN_RUN:
                    runs.append((length, fa, ia + 1, fb, ib + 1, normalize(docs[fa][ia])[:60]))

    if not runs:
        print(f"연속 {MIN_RUN}줄 이상 중복 0건")
        return 0

    runs.sort(reverse=True)
    total = sum(r[0] for r in runs)
    print(f"중복 구간 {len(runs)}건 (합계 {total}줄)\n")
    for length, fa, ia, fb, ib, sample in runs[:25]:
        print(f"  {length:3}줄  {fa}:{ia}  ↔  {fb}:{ib}")
        print(f"         \"{sample}\"")

    print("\n어느 쪽이 단일 소스인지 정하고 나머지는 그 문서를 가리키게 바꾼다.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
