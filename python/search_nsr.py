function searchNsr(
  pages: NsrPage[],
  keywords: string[],
): SearchResult[] {

  const scored: Array<{
    page: number;
    text: string;
    score: number;
  }> = [];

  for (const page of pages) {

    const text = page.text;

    if (!text) continue;

    const textLower = text.toLowerCase();

    let score = 0;
    let matchedKeywords = 0;

    for (const keyword of keywords) {

      const occurrences = countOccurrences(
        textLower,
        keyword,
      );

      if (occurrences > 0) {
        matchedKeywords++;
        score += occurrences * 10;
      }

      const root =
        keyword.length > 6
          ? keyword.slice(0, keyword.length - 2)
          : keyword;

      if (
        root.length >= 4 &&
        textLower.includes(root)
      ) {
        score += 2;
      }
    }

    if (
      matchedKeywords === keywords.length &&
      keywords.length > 1
    ) {
      score += 50;
    }

    if (score > 0) {

      const firstHit =
        keywords
          .map((kw) =>
            textLower.indexOf(kw)
          )
          .filter((p) => p >= 0)
          .sort((a, b) => a - b)[0] ?? 0;

      const start = Math.max(
        0,
        firstHit - 700,
      );

      const end = Math.min(
        text.length,
        start + 2200,
      );

      scored.push({
        page: page.page,
        score,
        text: text.substring(start, end),
      });
    }
  }

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.page - b.page,
  );

  return scored.slice(0, 10).map(
    (item) => ({
      page: item.page,
      text: item.text,
    }),
  );
}