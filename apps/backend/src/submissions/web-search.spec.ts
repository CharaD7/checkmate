import {
  buildBravePageQueries,
  buildBraveQueries,
} from './submissions.service';

describe('buildBraveQueries', () => {
  it('limits queries and excludes the entered name and common identifying metadata', () => {
    const queries = buildBraveQueries(
      [
        'Alice Example',
        'alice@example.edu',
        'The effects of urban heat islands are often strongest',
        'during the summer months when pavement retains energy',
        'after sunset and increases overnight temperatures in cities.',
      ].join(' '),
      'Alice Example',
    );

    expect(queries.length).toBeLessThanOrEqual(3);
    expect(queries.every((query) => query.split(' ').length === 8)).toBe(true);
    expect(queries.join(' ')).not.toMatch(/alice|example|@|\.edu/i);
  });

  it('does not join text across capitalized names or redacted values', () => {
    const queries = buildBraveQueries(
      'the study reports the seasonal cycle Jordan Lee described as more stable',
      'No matching name',
    );

    expect(queries).toEqual([]);
  });

  it('tracks the page number for each sampled web query', () => {
    const queries = buildBravePageQueries(
      [
        'the first page has enough lower case words to search for possible sources',
        'the second page also has enough lower case words to search for matches',
        'the third page includes sufficient lower case words for a search',
        'the fourth page includes enough words to search for another source',
      ],
      'Student Name',
    );

    expect(queries).toHaveLength(12);
    expect(queries.map((item) => item.pageNumber)).toEqual([
      1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4,
    ]);
    expect(queries.every((item) => item.query.split(' ').length === 8)).toBe(true);
  });

  it('samples up to twelve excerpts across the document', () => {
    const pageText =
      'this page contains enough lower case words to make a useful search';
    const queries = buildBravePageQueries(Array(20).fill(pageText), 'Student Name');

    expect(queries).toHaveLength(12);
    expect(queries[0].pageNumber).toBe(1);
    expect(queries[queries.length - 1].pageNumber).toBe(20);
  });
});
