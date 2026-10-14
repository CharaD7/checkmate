const SHINGLE_SIZE = 5;

interface Word {
  value: string;
  start: number;
  end: number;
}

interface Shingle {
  key: string;
  index: number;
}

function words(text: string): Word[] {
  return Array.from(text.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
    value: match[0].toLowerCase(),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function shingles(tokens: Word[]): Shingle[] {
  const result: Shingle[] = [];
  for (let index = 0; index <= tokens.length - SHINGLE_SIZE; index += 1) {
    result.push({
      key: tokens
        .slice(index, index + SHINGLE_SIZE)
        .map((token) => token.value)
        .join(' '),
      index,
    });
  }
  return result;
}

export function compareText(leftText: string, rightText: string) {
  const leftWords = words(leftText);
  const rightWords = words(rightText);
  const leftShingles = shingles(leftWords);
  const rightShingles = shingles(rightWords);
  const leftUnique = new Set(leftShingles.map((shingle) => shingle.key));
  const rightUnique = new Set(rightShingles.map((shingle) => shingle.key));
  const rightByKey = new Map<string, number>();
  for (const shingle of rightShingles) {
    if (!rightByKey.has(shingle.key)) {
      rightByKey.set(shingle.key, shingle.index);
    }
  }

  const matches = leftShingles
    .filter((shingle) => rightUnique.has(shingle.key))
    .map((shingle) => ({
      leftIndex: shingle.index,
      rightIndex: rightByKey.get(shingle.key)!,
    }));
  const sharedUnique = [...leftUnique].filter((key) => rightUnique.has(key));
  const denominator = Math.min(leftUnique.size, rightUnique.size);
  const similarityPercent =
    denominator === 0 ? 0 : Math.round((sharedUnique.length / denominator) * 100);

  const passages: Array<{
    left: string;
    right: string;
    matchedPhraseCount: number;
  }> = [];
  let group: typeof matches = [];
  const flush = () => {
    if (group.length === 0) return;
    const first = group[0];
    const last = group[group.length - 1];
    passages.push({
      left: leftText.slice(
        leftWords[first.leftIndex].start,
        leftWords[last.leftIndex + SHINGLE_SIZE - 1].end,
      ),
      right: rightText.slice(
        rightWords[first.rightIndex].start,
        rightWords[last.rightIndex + SHINGLE_SIZE - 1].end,
      ),
      matchedPhraseCount: new Set(
        group.map((match) =>
          leftWords
            .slice(match.leftIndex, match.leftIndex + SHINGLE_SIZE)
            .map((token) => token.value)
            .join(' '),
        ),
      ).size,
    });
    group = [];
  };

  for (const match of matches) {
    const last = group[group.length - 1];
    if (
      last &&
      match.leftIndex <= last.leftIndex + SHINGLE_SIZE &&
      match.rightIndex <= last.rightIndex + SHINGLE_SIZE &&
      match.rightIndex >= last.rightIndex
    ) {
      group.push(match);
    } else {
      flush();
      group.push(match);
    }
  }
  flush();

  return {
    similarityPercent,
    leftPhraseCount: leftUnique.size,
    leftSimilarityPercent:
      leftUnique.size === 0
        ? 0
        : Math.round((sharedUnique.length / leftUnique.size) * 100),
    sharedPhraseCount: sharedUnique.length,
    passages,
  };
}

export interface PageMatch {
  pageNumber: number;
  sourcePageNumber: number;
  text: string;
  sourceText: string;
  matchedPhraseCount: number;
  pageSimilarityPercent: number;
  sourcePageSimilarityPercent: number;
  lineScorePercent: number;
  sourceLineScorePercent: number;
}

export function comparePages(leftPages: string[], rightPages: string[]) {
  const matches: PageMatch[] = [];
  const matchedPages = new Set<number>();
  let sharedPhraseCount = 0;

  leftPages.forEach((leftPage, leftIndex) => {
    rightPages.forEach((rightPage, rightIndex) => {
      const result = compareText(leftPage, rightPage);
      if (result.sharedPhraseCount === 0) return;
      const reverseResult = compareText(rightPage, leftPage);

      matchedPages.add(leftIndex + 1);
      sharedPhraseCount += result.sharedPhraseCount;
      for (const passage of result.passages) {
        matches.push({
          pageNumber: leftIndex + 1,
          sourcePageNumber: rightIndex + 1,
          text: passage.left,
          sourceText: passage.right,
          matchedPhraseCount: passage.matchedPhraseCount,
          pageSimilarityPercent: result.leftSimilarityPercent,
          sourcePageSimilarityPercent: reverseResult.leftSimilarityPercent,
          lineScorePercent:
            result.leftPhraseCount === 0
              ? 0
              : Math.round(
                  (passage.matchedPhraseCount / result.leftPhraseCount) * 100,
                ),
          sourceLineScorePercent:
            reverseResult.leftPhraseCount === 0
              ? 0
              : Math.round(
                  (passage.matchedPhraseCount /
                    reverseResult.leftPhraseCount) *
                    100,
                ),
        });
      }
    });
  });

  return {
    similarityPercent:
      leftPages.length === 0
        ? 0
        : Math.round((matchedPages.size / leftPages.length) * 100),
    pageCount: leftPages.length,
    matchedPageCount: matchedPages.size,
    sharedPhraseCount,
    matches,
  };
}
