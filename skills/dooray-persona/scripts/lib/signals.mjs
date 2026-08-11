const REPEATED_SUBJECT_THRESHOLD = 3;

// 표는 헤더와 구분선만으로도 2행이 필요하다. 우연한 제목·강조 한 번을
// AI 신호로 보지 않도록 제목과 굵은 글씨도 각각 2회 이상일 때만 결합한다.
const AI_SIGNAL_THRESHOLDS = {
  headings: 2,
  tableRows: 2,
  boldRuns: 2,
  closingSections: 1,
};

const FORMAL_TEMPLATE_PATTERN =
  /(?:배포|릴리스|release|패치\s*노트|patch\s*notes?|정기\s*점검|변경\s*내역)/i;

function countMatches(text, pattern) {
  return Array.from(text.matchAll(pattern)).length;
}

export function extractSignals(text) {
  const source = String(text ?? "");
  const lines = source.split(/\r?\n/);

  return {
    headings: lines.filter((line) => /^\s*#{1,6}\s+\S/.test(line)).length,
    tableRows: lines.filter((line) => /^\s*\|.*\|\s*$/.test(line)).length,
    boldRuns: countMatches(source, /\*\*[^*\n]+\*\*/g),
    bullets: lines.filter((line) => /^\s*[-*]\s+\S/.test(line)).length,
    emoji: countMatches(source, /\p{Extended_Pictographic}/gu),
    closingSections: lines.filter((line) =>
      /^\s*(?:#{1,6}\s*)?(?:\*\*)?(?:결론|정리|요약|다음 단계)(?:\*\*)?\s*:?\s*$/.test(
        line,
      ),
    ).length,
    chars: source.length,
  };
}

function normalizeSubjectShape(subject) {
  return String(subject ?? "")
    .toLowerCase()
    .replace(/\b[vV]?\d+(?:\.\d+)+\b/g, "<version>")
    .replace(/\d{4}[-./]\d{1,2}[-./]\d{1,2}/g, "<date>")
    .replace(/\d+/g, "<number>")
    .replace(/\s+/g, " ")
    .trim();
}

function contextEntries(corpusContext) {
  if (Array.isArray(corpusContext)) return corpusContext;
  if (Array.isArray(corpusContext?.entries)) return corpusContext.entries;
  return [];
}

function repeatedSubjectCount(entry, corpusContext) {
  const shape = normalizeSubjectShape(entry?.subject);
  if (!shape) return 0;
  const matchingPosts = new Set();
  for (const candidate of contextEntries(corpusContext)) {
    if (normalizeSubjectShape(candidate?.subject) !== shape) continue;
    matchingPosts.add(candidate?.postId ?? candidate?.id);
  }
  return matchingPosts.size;
}

function isAiSuspect(signals) {
  return Object.entries(AI_SIGNAL_THRESHOLDS).every(
    ([name, threshold]) => Number(signals?.[name] ?? 0) >= threshold,
  );
}

export function labelEntry(entry, signals, corpusContext) {
  const combinedText = `${entry?.subject ?? ""}\n${entry?.text ?? ""}`;
  const repeatCount = repeatedSubjectCount(entry, corpusContext);
  const hasFormalTemplatePattern = FORMAL_TEMPLATE_PATTERN.test(combinedText);
  const aiSuspect = isAiSuspect(signals);
  const reasons = [];

  if (
    repeatCount >= REPEATED_SUBJECT_THRESHOLD ||
    hasFormalTemplatePattern
  ) {
    if (repeatCount >= REPEATED_SUBJECT_THRESHOLD) {
      reasons.push(`같은 형태의 제목이 ${repeatCount}건 반복됨`);
    }
    if (hasFormalTemplatePattern) {
      reasons.push("배포·릴리스·패치노트 정형 지표가 있음");
    }
    if (aiSuspect) reasons.push("AI 구조 신호도 함께 높음");
    return {
      label: "formal-template",
      needsReview: aiSuspect,
      reasons,
    };
  }

  if (aiSuspect) {
    reasons.push("제목·표·굵은 글씨·마무리 섹션 신호가 함께 높음");
    if (repeatCount === REPEATED_SUBJECT_THRESHOLD - 1) {
      reasons.push("같은 형태의 제목이 2건 있어 정형 양식 가능성이 있음");
    }
    return {
      label: "ai-suspect",
      needsReview: repeatCount === REPEATED_SUBJECT_THRESHOLD - 1,
      reasons,
    };
  }

  return { label: "human", needsReview: false, reasons: [] };
}
