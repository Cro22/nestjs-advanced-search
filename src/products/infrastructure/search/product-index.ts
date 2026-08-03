import { Product } from '@/products/domain/product';

/**
 * Elasticsearch document shape for a product. This is the denormalized read
 * projection; it mirrors the domain aggregate one to one.
 */
export interface ProductDocument {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategories: string[];
  location: string;
  coordinates?: { lat: number; lon: number };
  price: number;
  popularity: number;
  createdAt: string;
}

export function toDocument(product: Product): ProductDocument {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    category: product.category,
    subcategories: product.subcategories,
    location: product.location,
    // A geo_point field must be absent when unknown; null is rejected by ES.
    ...(product.coordinates ? { coordinates: product.coordinates } : {}),
    price: product.price.toDecimal(),
    popularity: product.popularity,
    createdAt: product.createdAt.toISOString(),
  };
}

/**
 * Search time synonym pairs anchored to the seed taxonomy. Kept search time
 * only (never applied at index time) so the index stays compact and the list
 * can evolve with a settings update plus reindex instead of a mapping change.
 */
export const SEARCH_SYNONYMS = [
  'laptop, notebook',
  'phone, smartphone, mobile',
  'headphones, earphones, headset',
  'sofa, couch',
  'bicycle, bike',
  'sneakers, trainers',
  'backpack, rucksack',
  'perfume, fragrance, cologne',
  'tv, television',
];

/**
 * Index settings and mappings.
 *
 * - folding: lowercase + asciifolding so "cafe" matches "cafe" and accents.
 * - english_folding: folding + a light English stemmer, used to index the
 *   descriptive fields so "laptops" matches "laptop" exactly, not just fuzzily.
 * - english_folding_search: the search side of english_folding plus synonym
 *   expansion, so "notebook" finds laptops. The stemmer runs after the
 *   synonyms so both sides of every pair are stemmed consistently.
 * - trigram: shingles that power the phrase (did you mean) suggester.
 * - name.sat: search_as_you_type field that powers prefix autocomplete. It
 *   stays on plain folding: stemmed prefixes would break as you type matching.
 * - *.keyword subfields: exact values used by filters and facet aggregations.
 */
export const PRODUCT_INDEX_SETTINGS = {
  settings: {
    analysis: {
      filter: {
        shingle_filter: {
          type: 'shingle',
          min_shingle_size: 2,
          max_shingle_size: 3,
        },
        english_stemmer: {
          type: 'stemmer',
          language: 'light_english',
        },
        synonym_filter: {
          type: 'synonym_graph',
          lenient: true,
          synonyms: SEARCH_SYNONYMS,
        },
      },
      analyzer: {
        folding: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding'],
        },
        english_folding: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'english_stemmer'],
        },
        english_folding_search: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding', 'synonym_filter', 'english_stemmer'],
        },
        trigram: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'shingle_filter'],
        },
      },
    },
  },
  mappings: {
    properties: {
      id: { type: 'keyword' },
      name: {
        type: 'text',
        analyzer: 'english_folding',
        search_analyzer: 'english_folding_search',
        fields: {
          keyword: { type: 'keyword' },
          sat: { type: 'search_as_you_type', analyzer: 'folding' },
          trigram: { type: 'text', analyzer: 'trigram' },
        },
      },
      description: {
        type: 'text',
        analyzer: 'english_folding',
        search_analyzer: 'english_folding_search',
      },
      category: {
        type: 'text',
        analyzer: 'english_folding',
        search_analyzer: 'english_folding_search',
        fields: { keyword: { type: 'keyword' } },
      },
      subcategories: {
        type: 'text',
        analyzer: 'english_folding',
        search_analyzer: 'english_folding_search',
        fields: { keyword: { type: 'keyword' } },
      },
      location: {
        type: 'text',
        analyzer: 'folding',
        fields: { keyword: { type: 'keyword' } },
      },
      coordinates: { type: 'geo_point' },
      price: { type: 'scaled_float', scaling_factor: 100 },
      popularity: { type: 'integer' },
      createdAt: { type: 'date' },
    },
  },
} as const;
