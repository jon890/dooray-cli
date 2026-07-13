---
id: bsd-sed-word-boundary
category: plan
title: macOS BSD `sed` `\b` 미지원
triggers: [sed, macOS, BSD sed, word boundary, rename, perl]
tool_catchable: false
source: [1-9]
related: []
---

**증상**: rename plan 에 `sed -i '' 's|foo\b|bar|g'`. macOS BSD `sed` 는 `\b` 미지원 → 0 매치.
검증: `echo "x.contentReview.y" | sed 's|contentReview\b|X|g'` → 변경 없음.
**왜**: 핵심 치환 누락, 빌드 / 타입 검증 실패하지만 phase 본문은 통과로 보일 수 있음.

**Good** (rename 시): `perl -i -pe 's/\bfoo\b/bar/g' file` (perl 은 `\b` 지원).

**Self-check**: rename / mass-replace plan 에 `sed \b` 사용? 있으면 perl 로 치환.
