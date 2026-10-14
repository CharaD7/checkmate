import { comparePages, compareText } from './similarity';

describe('compareText', () => {
  it('finds exact shared passages and reports overlap against the shorter text', () => {
    const result = compareText(
      'The quick brown fox jumps over the lazy dog.',
      'We all know the quick brown fox jumps over the lazy dog each day.',
    );

    expect(result.similarityPercent).toBe(100);
    expect(result.sharedPhraseCount).toBeGreaterThan(0);
    expect(result.passages).toEqual([
      {
        left: 'The quick brown fox jumps over the lazy dog',
        right: 'the quick brown fox jumps over the lazy dog',
        matchedPhraseCount: 5,
      },
    ]);
  });

  it('does not flag short phrases that cannot form a five-word shingle', () => {
    const result = compareText(
      'Students should think carefully before submitting their work.',
      'Researchers should think deeply before submitting their findings.',
    );

    expect(result.similarityPercent).toBe(0);
    expect(result.sharedPhraseCount).toBe(0);
    expect(result.passages).toEqual([]);
  });

  it('returns no matches for empty or punctuation-only documents', () => {
    expect(compareText('', '...').similarityPercent).toBe(0);
  });

  it('scores flagged pages against the document page count and retains page pairs', () => {
    const result = comparePages(
      [
        'This page contains a completely original explanation of climate systems.',
        'The quick brown fox jumps over the lazy dog in the meadow.',
        'Another page repeats the quick brown fox jumps over the lazy dog again.',
      ],
      ['A note: the quick brown fox jumps over the lazy dog each morning.'],
    );

    expect(result.similarityPercent).toBe(67);
    expect(result.matchedPageCount).toBe(2);
    expect(result.pageCount).toBe(3);
    expect(result.matches.map((match) => match.pageNumber)).toEqual([2, 3]);
    expect(result.matches[0].sourcePageNumber).toBe(1);
    expect(result.matches[0].pageSimilarityPercent).toBeGreaterThan(0);
  });

  it('does not score pages that have no exact five-word pattern match', () => {
    const result = comparePages(
      ['An original first page with no shared patterns.', 'Short final page.'],
      ['Different material appears in this source document.'],
    );
    expect(result.similarityPercent).toBe(0);
    expect(result.matches).toEqual([]);
  });
});
