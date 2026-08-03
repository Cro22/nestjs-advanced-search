import fc from 'fast-check';
import {
  clampPageSize,
  decodeCursor,
  encodeCursor,
  MAX_SEARCH_WINDOW,
  normalizePage,
} from '@/shared/domain/pagination';

describe('pagination (property based)', () => {
  it('round trips any sort tuple through a cursor', () => {
    const sortValue = fc.oneof(
      fc.string(),
      fc.integer(),
      // Normalize -0 to 0: JSON has no signed zero, so -0 is not a distinct
      // round-trippable value, and it never occurs as an ES sort value anyway.
      fc.double({ noNaN: true, noDefaultInfinity: true }).map((x) => (Object.is(x, -0) ? 0 : x)),
      fc.boolean(),
    );
    fc.assert(
      fc.property(fc.array(sortValue), (tuple) => {
        expect(decodeCursor(encodeCursor(tuple))).toEqual(tuple);
      }),
    );
  });

  it('never decodes arbitrary junk into a non-array', () => {
    fc.assert(
      fc.property(fc.string(), (junk) => {
        const decoded = decodeCursor(junk);
        expect(decoded === null || Array.isArray(decoded)).toBe(true);
      }),
    );
  });

  it('clamps the page size into [1, max] for any request', () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: -100, max: MAX_SEARCH_WINDOW }), { nil: undefined }),
        fc.integer({ min: 1, max: 1000 }),
        (requested, max) => {
          const size = clampPageSize(requested, max);
          expect(size).toBeGreaterThanOrEqual(1);
          expect(size).toBeLessThanOrEqual(max);
          // A valid request within the ceiling is honoured exactly.
          if (requested && requested >= 1 && requested <= max) {
            expect(size).toBe(requested);
          }
        },
      ),
    );
  });

  it('normalizes any page request to a positive integer', () => {
    fc.assert(
      fc.property(fc.option(fc.double({ noNaN: true }), { nil: undefined }), (requested) => {
        const page = normalizePage(requested);
        expect(Number.isInteger(page)).toBe(true);
        expect(page).toBeGreaterThanOrEqual(1);
      }),
    );
  });
});
