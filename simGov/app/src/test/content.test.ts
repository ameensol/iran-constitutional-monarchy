import { describe, expect, it } from 'vitest';
import constitution from '../content/generated/constitution.json';

describe('paired constitution content', () => {
  it('contains 66 stable, bilingual articles', () => {
    expect(constitution).toHaveLength(66);
    expect(new Set(constitution.map((article) => article.id)).size).toBe(66);
    for (const article of constitution) {
      expect(article.en.id).toBe(article.id);
      expect(article.fa.id).toBe(article.id);
      expect(article.en.title.length).toBeGreaterThan(2);
      expect(article.fa.title.length).toBeGreaterThan(2);
    }
  });
});
