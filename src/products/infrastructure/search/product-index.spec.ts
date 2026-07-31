import { Product } from '@/products/domain/product';
import {
  PRODUCT_INDEX_SETTINGS,
  SEARCH_SYNONYMS,
  toDocument,
} from '@/products/infrastructure/search/product-index';

describe('PRODUCT_INDEX_SETTINGS', () => {
  const { analysis } = PRODUCT_INDEX_SETTINGS.settings;
  const { properties } = PRODUCT_INDEX_SETTINGS.mappings;

  it('applies synonyms at search time only', () => {
    expect(analysis.filter.synonym_filter.synonyms).toBe(SEARCH_SYNONYMS);
    // The index side analyzer must not expand synonyms.
    expect(analysis.analyzer.english_folding.filter).not.toContain('synonym_filter');
    expect(analysis.analyzer.english_folding_search.filter).toContain('synonym_filter');
  });

  it('stems both the index and search side so the pairs stay symmetric', () => {
    expect(analysis.analyzer.english_folding.filter).toContain('english_stemmer');
    expect(analysis.analyzer.english_folding_search.filter).toContain('english_stemmer');
    // The stemmer must run after the synonym expansion.
    const searchFilters = analysis.analyzer.english_folding_search.filter;
    expect(searchFilters.indexOf('synonym_filter')).toBeLessThan(
      searchFilters.indexOf('english_stemmer'),
    );
  });

  it('keeps autocomplete and suggester fields free of stemming', () => {
    expect(properties.name.fields.sat.analyzer).toBe('folding');
    expect(properties.name.fields.trigram.analyzer).toBe('trigram');
    expect(properties.name.analyzer).toBe('english_folding');
    expect(properties.name.search_analyzer).toBe('english_folding_search');
  });

  it('covers a synonym pair for every descriptive field', () => {
    for (const field of ['name', 'description', 'category', 'subcategories'] as const) {
      expect(properties[field].search_analyzer).toBe('english_folding_search');
    }
    // Location stays unstemmed: city names are proper nouns.
    expect(properties.location.analyzer).toBe('folding');
  });
});

describe('toDocument', () => {
  it('omits coordinates entirely when the product has none', () => {
    const product = Product.create({
      id: '1',
      name: 'Aurora Laptop',
      description: 'x',
      category: 'Electronics',
      subcategories: [],
      location: 'Madrid',
      price: 1,
      popularity: 0,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect('coordinates' in toDocument(product)).toBe(false);
  });
});
