# 다른 레포 이식 프롬프트 — `/review` 댓글 트리거 ↔ PR Checks 탭 연동

> **사용법**: 아래 박스 안 텍스트를 통째로 복사하여 다른 레포의 Claude Code 세션에 붙여넣기.
> Claude 가 해당 레포의 `claude-code-review.yml` (또는 동등 워크플로) 을 점검 후 동일 패턴으로 수정한다.

---

## 배경

GitHub Actions 의 `issue_comment` 트리거 (`/review` 같은 명시적 리뷰 요청 댓글) 로 실행된 workflow run 은 **PR Checks 탭에 자동 등록되지 않는다.** GitHub 내부적으로 issue scope 라 PR head SHA 와 자동 연결이 안 되기 때문.

→ 사용자가 PR 에서 `/review` 댓글을 달아도 PR 페이지 하단 Checks 영역에는 진행 상황이 안 보이고, Actions 탭에 별도 run 으로만 떠 있음. workflow 가 PR 의 일부로 인식 안 됨.

해결책: workflow 시작 시 PR head SHA 에 **Check Run 을 수동 생성** + 종료 시 결과를 PATCH. dooray-cli 에서 commit `f0ac1d1` 로 적용 완료.

---

## 이식 프롬프트 (복붙용)

```
이 레포의 GitHub Actions claude-code-review (또는 동등 코드 리뷰 워크플로) 를 점검해서, /review 댓글 트리거 시에도 PR Checks 탭에 진행 상태가 노출되도록 수정해줘.

## 배경

`issue_comment` 트리거 workflow run 은 GitHub Actions 의 알려진 제약으로 PR Checks 탭에 자동 등록 안 됨 — 사용자가 /review 댓글로 명시적 요청해도 PR 페이지에서는 workflow 가 보이지 않고 Actions 탭에만 나옴.

해결 패턴: workflow 시작 시 PR head SHA 에 Check Run 을 수동 생성 (`gh api .../check-runs -X POST` + `status: in_progress`), 종료 시 `job.status` 를 conclusion (`success` / `failure` / `cancelled`) 으로 PATCH 매핑.

## 작업 항목 (순서)

### 1. 워크플로 위치 확인

```bash
ls .github/workflows/ | grep -iE "claude|review"
```

가장 그럴듯한 파일 1개 선택. 일반적으로 `claude-code-review.yml`.

### 2. 트리거 확인

해당 파일에 `issue_comment` 트리거 + `/review` 댓글 매칭 조건이 있는지 확인:

```bash
grep -nE "issue_comment|/review" .github/workflows/<파일>
```

없으면 본 프롬프트는 적용 대상 아님 — 사용자에게 확인 후 종료.

### 3. permissions 에 `checks: write` 추가

```yaml
permissions:
  contents: read
  pull-requests: write
  issues: write
  id-token: write
  checks: write   # ← 추가
```

이미 있으면 skip.

### 4. workflow 첫 step 으로 Check Run 생성 추가

`steps:` 블록의 checkout 직후 (또는 그 자리에서 가장 빠른 실행 가능 시점) 다음 step 추가:

```yaml
      # /review 댓글 트리거는 PR Checks 탭에 자동 등록되지 않으므로
      # PR head SHA 에 Check Run 을 수동 생성하여 PR 과 workflow 연동
      - name: PR 에 Check Run 등록 (issue_comment 트리거 전용)
        id: check-create
        if: github.event_name == 'issue_comment'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          HEAD_SHA=$(gh pr view "${{ env.PR_NUMBER }}" --repo "${{ github.repository }}" \
            --json headRefOid -q .headRefOid)
          RUN_URL="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
          CHECK_ID=$(gh api "repos/${{ github.repository }}/check-runs" -X POST \
            -f name="Claude 코드 리뷰" \
            -f head_sha="$HEAD_SHA" \
            -f status="in_progress" \
            -f details_url="$RUN_URL" \
            -q .id)
          echo "check_id=$CHECK_ID" >> "$GITHUB_OUTPUT"
          echo "head_sha=$HEAD_SHA" >> "$GITHUB_OUTPUT"
```

이 워크플로에서 `env.PR_NUMBER` 가 정의되어 있어야 함 (`${{ github.event.pull_request.number || github.event.issue.number }}`). 없으면 별도 추출 라인 추가:

```yaml
HEAD_SHA=$(gh pr view "${{ github.event.issue.number }}" --repo "${{ github.repository }}" --json headRefOid -q .headRefOid)
```

### 5. workflow 마지막에 Check Run 완료 마킹 step 추가

기존 마지막 step (예: 댓글 reaction 갱신) 뒤에 다음 step 추가:

```yaml
      # PR Checks 탭에서 결과 확인 가능하도록 Check Run 완료 마킹
      - name: Check Run 완료 마킹
        if: github.event_name == 'issue_comment' && always() && steps.check-create.outputs.check_id != ''
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OUTCOME: ${{ job.status }}
        run: |
          case "$OUTCOME" in
            success)   CONCLUSION="success" ;;
            cancelled) CONCLUSION="cancelled" ;;
            *)         CONCLUSION="failure" ;;
          esac
          gh api "repos/${{ github.repository }}/check-runs/${{ steps.check-create.outputs.check_id }}" -X PATCH \
            -f status="completed" \
            -f conclusion="$CONCLUSION" || true
```

`always()` 가드 필수 — 중간 step 이 실패해도 Check Run 을 닫아 PR 에 stale "in_progress" 가 남지 않게 한다.

### 6. yaml 정합성 검증

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/<파일>'))"
```

예외 없이 통과해야 함.

### 7. commit + push

```bash
git add .github/workflows/<파일>
git commit -m "fix(ci): link /review-triggered workflow to PR Checks tab via Check Run API"
git push origin main
```

PR 컨벤션이 다르면 (예: 한국어 / type(scope) / Conventional Commits 변형) 그 레포의 commit 히스토리 grep 하여 맞춰 작성.

## 검증 시나리오

이식 후 1회 검증:

1. 임의 PR 에 `/review` 댓글 추가
2. **Actions 탭**: workflow run 이 시작되는지 확인 (기존 동작)
3. **PR 페이지 하단**: "Claude 코드 리뷰 (in progress)" 가 Checks 영역에 등장하는지 확인 ← 핵심
4. workflow 종료 후 success/failure 결과가 표시되는지 확인
5. 결과 옆 details 링크 클릭 시 해당 workflow run 페이지로 이동하는지 확인

## 한계 (정직하게 — 사용자에게 안내)

- **Fork PR 미지원**: fork 에서 열린 PR 의 `/review` 는 `secrets.GITHUB_TOKEN` 이 read-only → check-run 생성 권한 부족. fork 케이스는 maintainer 가 base repo 에서 댓글 달아야 작동. 이건 GitHub 정책상 우회 불가
- **`pull_request: opened` 트리거는 변경 없음**: 자동 등록되므로 `if: github.event_name == 'issue_comment'` 가드로 중복 회피. 신규 PR 의 자동 리뷰는 영향 없음

## 참고

- dooray-cli 의 적용 commit: `f0ac1d1` (`fix(ci): link /review-triggered workflow to PR Checks tab via Check Run API`)
- GitHub Checks API: https://docs.github.com/en/rest/checks/runs
```

---

## 메타 — 이 프롬프트의 사용 가이드

1. **언제 쓰나**: dooray-cli 또는 fos-blog 처럼 `claude-code-review.yml` (or 비슷한 이름) 을 운영 중이고 `/review` 댓글 트리거 사이클이 PR Checks 와 분리돼 있을 때
2. **누가 실행하나**: 해당 레포의 main session Claude Code (사용자가 위 박스 텍스트를 붙여넣어 실행)
3. **이식 비용**: 단일 yaml 파일 수정 (~40줄 추가). 기존 동작 회귀 영향 0 (가드 모두 `if: github.event_name == 'issue_comment'`)
4. **검증 비용**: PR 댓글 1회 + 시각 확인 → 5분 이내
5. **유지보수 노트**: workflow run name (`Claude 코드 리뷰`) 를 다른 이름으로 바꾸려면 4번 step 의 `-f name=...` 만 교체. PR 머지 후에도 stale check-run 남아있으면 GitHub 측 표시 캐시 문제 — 새 PR 에서 재현 안 되면 무시 가능
