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
    price: product.price,
    popularity: product.popularity,
    createdAt: product.createdAt.toISOString(),
  };
}

/**
 * Index settings and mappings.
 *
 * - folding: lowercase + asciifolding so "cafe" matches "cafe" and accents.
 * - trigram: shingles that power the phrase (did you mean) suggester.
 * - name.sat: search_as_you_type field that powers prefix autocomplete.
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
      },
      analyzer: {
        folding: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding'],
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
        analyzer: 'folding',
        fields: {
          keyword: { type: 'keyword' },
          sat: { type: 'search_as_you_type', analyzer: 'folding' },
          trigram: { type: 'text', analyzer: 'trigram' },
        },
      },
      description: { type: 'text', analyzer: 'folding' },
      category: {
        type: 'text',
        analyzer: 'folding',
        fields: { keyword: { type: 'keyword' } },
      },
      subcategories: {
        type: 'text',
        analyzer: 'folding',
        fields: { keyword: { type: 'keyword' } },
      },
      location: {
        type: 'text',
        analyzer: 'folding',
        fields: { keyword: { type: 'keyword' } },
      },
      price: { type: 'scaled_float', scaling_factor: 100 },
      popularity: { type: 'integer' },
      createdAt: { type: 'date' },
    },
  },
} as const;
