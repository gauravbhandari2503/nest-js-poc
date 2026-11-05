import { SLUG_MAX_LENGTH, SLUG_PATTERN, slugify } from '../company-slug.js';

describe('slugify', () => {
  it('lowercases and joins words with single dashes', () => {
    expect(slugify('  PVR  Cinemas & Co. ')).toBe('pvr-cinemas-co');
  });

  it('drops accents', () => {
    expect(slugify('Café Lumière')).toBe('cafe-lumiere');
  });

  it('is empty when there is nothing to build a slug from', () => {
    expect(slugify('!!! ---')).toBe('');
  });

  it('stays within the length limit without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(59)} bbb`);
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('always produces something the slug pattern accepts', () => {
    expect(SLUG_PATTERN.test(slugify('Multiplex 24/7 – Pune'))).toBe(true);
  });
});
