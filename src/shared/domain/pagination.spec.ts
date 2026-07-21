import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  clampPageSize,
  normalizePage,
} from '@/shared/domain/pagination';

describe('clampPageSize', () => {
  it('falls back to the default for missing or invalid sizes', () => {
    expect(clampPageSize(undefined, 100)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(0, 100)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(-5, 100)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('caps the size at the configured maximum', () => {
    expect(clampPageSize(250, 100)).toBe(100);
  });

  it('keeps a valid size within range', () => {
    expect(clampPageSize(30, 100)).toBe(30);
  });
});

describe('normalizePage', () => {
  it('falls back to the first page for missing or invalid values', () => {
    expect(normalizePage(undefined)).toBe(DEFAULT_PAGE);
    expect(normalizePage(0)).toBe(DEFAULT_PAGE);
    expect(normalizePage(-3)).toBe(DEFAULT_PAGE);
  });

  it('floors fractional page numbers', () => {
    expect(normalizePage(2.9)).toBe(2);
  });
});
