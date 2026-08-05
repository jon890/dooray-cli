#!/usr/bin/env python3
"""하네스 지침 파일이 가리키는 대상이 실재하는지 확인한다.

검사 항목
  1. 마크다운 링크 `[텍스트](경로.md)`
  2. 백틱으로 감싼 repo 상대 경로
  3. 다른 문서의 섹션 참조 — `"섹션명" 섹션` / `"섹션명" 표`
  4. 스킬 참조 — `` `이름` skill ``

Usage: python3 check_references.py [repo-root]
종료 코드: 깨진 참조가 있으면 1
"""
import os
import pathlib
import re
import sys

ROOT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

TARGET_GLOBS = [
    "CLAUDE.md",
    ".claude/agents/*.md",
    ".claude/skills/*/SKILL.md",
    ".claude/*-overlay.md",
    "skills/*/SKILL.md",
    "skills/*/references/*.md",
]

# 경로처럼 보이는 백틱 조각. 디렉터리 구분자를 포함해야 경로로 본다.
# 파일명만 적힌 경우(`flow.md`)는 어느 디렉터리인지 알 수 없어 basename 탐색으로 확인한다.
PATH_IN_BACKTICK = re.compile(r"`([A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)+/?)`")
BARE_FILE = re.compile(r"`([A-Za-z0-9_-]+\.(?:md|ts|json|sh|py|yml))`")
MD_LINK = re.compile(r"\[[^\]]+\]\(([^)]+\.md)\)")
SECTION_REF = re.compile(r"`([A-Za-z0-9_./-]+\.md)`\s*(?:의|에)?\s*[\"“]([^\"”]{2,60})[\"”]\s*(섹션|표|절)")
SKILL_REF = re.compile(r"`([a-z][a-z0-9-]+)`\s*skill")

# 검사에서 제외 — 플레이스홀더, 홈 밖 경로, 와일드카드, URL
SKIP = re.compile(r"[<>{}*]|^~|^\$|^https?:|^\.\./\.\.")


def targets():
    seen = []
    for g in TARGET_GLOBS:
        for p in sorted(ROOT.glob(g)):
            if p.is_file():
                seen.append(p)
    return seen


def installed_skills():
    """설치된 스킬 이름 — 홈과 repo 양쪽."""
    names = set()
    for base in [pathlib.Path.home() / ".claude/skills", ROOT / ".claude/skills", ROOT / "skills"]:
        if base.is_dir():
            for d in base.iterdir():
                names.add(d.name)
    # 플러그인 스킬
    plug = pathlib.Path.home() / ".claude/plugins"
    if plug.is_dir():
        for p in plug.rglob("skills/*"):
            if p.is_dir():
                names.add(p.name)
    return names


def headers(path):
    """파일의 헤더 텍스트 집합."""
    out = set()
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        m = re.match(r"^#{1,6}\s+(.*)$", line)
        if m:
            out.add(m.group(1).strip())
    return out


def main():
    skills = installed_skills()
    broken = []

    for f in targets():
        rel = f.relative_to(ROOT)
        text = f.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()

        for i, line in enumerate(lines, 1):
            # 1) 마크다운 링크
            for link in MD_LINK.findall(line):
                if SKIP.search(link):
                    continue
                target = (f.parent / link).resolve()
                if not target.is_file():
                    broken.append((rel, i, "링크", link))

            # 2) 백틱 경로 — repo 상대 경로로 해석
            for cand in PATH_IN_BACKTICK.findall(line):
                if SKIP.search(cand):
                    continue
                bare = cand.rstrip("/")
                if (ROOT / bare).exists() or (f.parent / bare).exists():
                    continue
                # repo 밖 경로(홈 설정 등)는 판정 대상이 아니다
                if bare.startswith((".claude/", "docs/", "src/", "skills/", "scripts/", "tasks/", ".github/")):
                    broken.append((rel, i, "경로", cand))

            # 2-b) 파일명만 적힌 경우 — repo 나 설치된 스킬 안에 같은 이름이 있으면 통과
            for cand in BARE_FILE.findall(line):
                if SKIP.search(cand) or (ROOT / cand).exists():
                    continue
                if any(ROOT.glob(f"**/{cand}")):
                    continue
                home_skills = pathlib.Path.home() / ".claude"
                if home_skills.is_dir() and any(home_skills.glob(f"**/{cand}")):
                    continue
                broken.append((rel, i, "파일명", cand))

            # 3) 섹션 참조
            for doc, section, kind in SECTION_REF.findall(line):
                if SKIP.search(doc):
                    continue
                target = ROOT / doc if (ROOT / doc).exists() else (f.parent / doc)
                if not target.is_file():
                    continue  # 경로 자체는 2번에서 잡힌다
                hs = headers(target)
                if not any(section in h for h in hs):
                    broken.append((rel, i, f"{kind}명", f"{doc} → \"{section}\""))

            # 4) 스킬 참조
            for name in SKILL_REF.findall(line):
                if name not in skills:
                    broken.append((rel, i, "스킬", name))

    if not broken:
        print("깨진 참조 0건")
        return 0

    print(f"깨진 참조 {len(broken)}건\n")
    for rel, i, kind, what in broken:
        print(f"  {rel}:{i}  [{kind}] {what}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
