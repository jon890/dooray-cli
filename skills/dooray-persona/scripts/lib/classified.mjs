/**
 * 다시 분류해도 사용자가 확정한 항목은 지킨다.
 *
 * `confirmed: true` 는 사용자가 경계 항목을 확정했거나 세션 로그 대조로 AI 작성이 확인된 표지다.
 * classify.mjs 는 신호로 라벨을 새로 매기지만, 이전 파일에서 확정된 항목은
 * 라벨과 `confirmed` 를 그대로 가져온다. 확정 근거는 신호로 다시 만들 수 없기 때문이다.
 */
export function preserveConfirmed(entries, previousEntries) {
  const confirmedById = new Map(
    previousEntries
      .filter((entry) => entry?.confirmed === true && typeof entry.id === "string")
      .map((entry) => [entry.id, entry]),
  );
  let preserved = 0;
  const merged = entries.map((entry) => {
    const previous = confirmedById.get(entry.id);
    if (!previous) return entry;
    preserved += 1;
    return { ...entry, label: previous.label, confirmed: true };
  });
  return { entries: merged, preserved };
}
