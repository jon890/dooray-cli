const ASSIGNEE_KINDS = ["member", "group", "none"];

function countMatches(text, pattern) {
  return Array.from(text.matchAll(pattern)).length;
}

function symbolCounts(text) {
  const withoutStrikethrough = text.replace(/~~[^~\n]+~~/g, "");
  return {
    "=>": countMatches(text, /=>/g),
    "->": countMatches(text, /->/g),
    취소선: countMatches(text, /~~[^~\n]+~~/g),
    물결: countMatches(withoutStrikethrough, /~/g),
    "!": countMatches(text, /!/g),
    "ㅠ": countMatches(text, /ㅠ/g),
  };
}

function meaningfulLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^#{1,6}\s+/.test(line) &&
        !/^\|?\s*:?-{3,}/.test(line) &&
        !/^\|.*\|$/.test(line),
    )
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter((line) => line.length > 0);
}

function endingCounts(lines) {
  let verb = 0;
  let nounPhrase = 0;

  for (const line of lines) {
    const ending = line.replace(/[.!?…]+$/g, "").trim();
    if (
      /(?:다|요|니다|습니다|했다|한다|된다|있다|없다|입니다|됩니다|하세요|했습니다)$/.test(
        ending,
      )
    ) {
      verb += 1;
    } else {
      nounPhrase += 1;
    }
  }

  const total = nounPhrase + verb;
  return {
    nounPhrase,
    verb,
    total,
    nounPhraseRatio: total === 0 ? 0 : nounPhrase / total,
    verbRatio: total === 0 ? 0 : verb / total,
  };
}

function median(values) {
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
}

function lengthDistribution(lines) {
  const lengths = lines.map((line) => Array.from(line).length).sort((a, b) => a - b);
  if (lengths.length === 0) {
    return { count: 0, q1: 0, median: 0, q3: 0 };
  }

  const middle = Math.floor(lengths.length / 2);
  const lower = lengths.slice(0, middle);
  const upper = lengths.slice(
    lengths.length % 2 === 0 ? middle : middle + 1,
  );
  return {
    count: lengths.length,
    q1: lower.length === 0 ? lengths[0] : median(lower),
    median: median(lengths),
    q3: upper.length === 0 ? lengths.at(-1) : median(upper),
  };
}

function startsWithGreetingOrMention(text) {
  return /^(?:안녕하세요|안녕하십니까|반갑습니다|@\S+|<@[^>]+>|\[[^\]]+\]\([^)]*\))/.test(
    String(text ?? "").trim(),
  );
}

function emptyGroup() {
  return {
    entries: 0,
    symbols: { "=>": 0, "->": 0, 취소선: 0, 물결: 0, "!": 0, "ㅠ": 0 },
    endings: {
      nounPhrase: 0,
      verb: 0,
      total: 0,
      nounPhraseRatio: 0,
      verbRatio: 0,
    },
    sentenceLength: { count: 0, q1: 0, median: 0, q3: 0 },
    greetingOrMentionStarts: { count: 0, ratio: 0 },
  };
}

function summarizeGroup(entries) {
  if (entries.length === 0) return emptyGroup();

  const lines = entries.flatMap((entry) => meaningfulLines(entry.text));
  const symbols = entries.reduce((totals, entry) => {
    const counts = symbolCounts(String(entry.text ?? ""));
    for (const name of Object.keys(totals)) totals[name] += counts[name];
    return totals;
  }, emptyGroup().symbols);
  const starts = entries.filter((entry) =>
    startsWithGreetingOrMention(entry.text),
  ).length;

  return {
    entries: entries.length,
    symbols,
    endings: endingCounts(lines),
    sentenceLength: lengthDistribution(lines),
    greetingOrMentionStarts: {
      count: starts,
      ratio: starts / entries.length,
    },
  };
}

export function calculateStats(entries) {
  const humanEntries = entries.filter((entry) => entry?.label === "human");
  const byAssigneeKind = {};

  for (const kind of ASSIGNEE_KINDS) {
    byAssigneeKind[kind] = summarizeGroup(
      humanEntries.filter((entry) => entry?.assigneeKind === kind),
    );
  }

  return { totalEntries: humanEntries.length, byAssigneeKind };
}
