import { estypes } from '@elastic/elasticsearch';
import { ProductSearchCriteria, SortField } from '@/products/domain/search/search-criteria';
import {
  FacetBucket,
  HitHighlights,
  PriceStats,
  ProductSearchResult,
  ProductView,
} from '@/products/domain/search/search-result';
import { encodeCursor } from '@/shared/domain/pagination';
import { ProductDocument } from '@/products/infrastructure/search/product-index';

/**
 * Minimal shapes for the parts of the Elasticsearch response we read. The client
 * types aggregations and suggesters as broad unions, so we narrow them to exactly
 * the fields our query produces instead of reaching for `any`.
 */
interface TermsBucket {
  key: string;
  doc_count: number;
}

interface FilteredTermsAgg {
  values: { buckets: TermsBucket[] };
}

interface FilteredStatsAgg {
  values: { count: number; min: number | null; max: number | null; avg: number };
}

interface ProductAggregations {
  categories: FilteredTermsAgg;
  subcategories: FilteredTermsAgg;
  locations: FilteredTermsAgg;
  price_stats: FilteredStatsAgg;
}

type FacetKey = 'categories' | 'subcategories' | 'locations';

interface PhraseSuggestOption {
  text: string;
}

interface ProductSuggest {
  alternatives: Array<{ options: PhraseSuggestOption[] }>;
}

/**
 * Turns a raw Elasticsearch search response into the domain ProductSearchResult:
 * hits (with highlights and geo distance), the total, faceting, query
 * suggestions and the deep-pagination cursor. Pure and framework-free, so it is
 * unit tested in isolation from the adapter and the client.
 */
export function toSearchResult(
  response: estypes.SearchResponse<ProductDocument>,
  criteria: ProductSearchCriteria,
): ProductSearchResult {
  const rawHits = response.hits.hits ?? [];
  const withDistance = criteria.sort.field === SortField.DISTANCE;

  const hits = rawHits.map((hit) => {
    const highlights = readHighlights(hit.highlight);
    const distanceKm = withDistance ? readDistance(hit.sort) : undefined;
    return {
      product: toProductView(hit._source as ProductDocument),
      score: hit._score ?? 0,
      ...(highlights ? { highlights } : {}),
      ...(distanceKm !== undefined ? { distanceKm } : {}),
    };
  });

  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : (response.hits.total?.value ?? 0);

  const aggregations = response.aggregations as unknown as ProductAggregations | undefined;
  const suggest = response.suggest as unknown as ProductSuggest | undefined;

  return {
    hits,
    total,
    page: criteria.page,
    pageSize: criteria.pageSize,
    facets: {
      categories: readBuckets(aggregations, 'categories'),
      subcategories: readBuckets(aggregations, 'subcategories'),
      locations: readBuckets(aggregations, 'locations'),
      price: readPriceStats(aggregations),
    },
    suggestions: readSuggestions(suggest, criteria.text),
    nextCursor: readNextCursor(rawHits, criteria.pageSize),
  };
}

/** Names pulled from the hits of an autocomplete response. */
export function readAutocompleteNames(response: estypes.SearchResponse<ProductDocument>): string[] {
  return (response.hits.hits ?? [])
    .map((hit) => (hit._source as ProductDocument)?.name)
    .filter((name): name is string => Boolean(name));
}

/**
 * A full page implies there may be more, so it exposes the last hit's sort tuple
 * as the next cursor; a short page is the end and returns null. The sort tuple
 * always exists because every ordering carries an explicit sort.
 */
function readNextCursor(rawHits: Array<{ sort?: unknown[] }>, pageSize: number): string | null {
  if (rawHits.length < pageSize || rawHits.length === 0) {
    return null;
  }
  const lastSort = rawHits.at(-1)?.sort;
  return lastSort ? encodeCursor(lastSort) : null;
}

function readHighlights(
  highlight: Record<string, string[]> | undefined,
): HitHighlights | undefined {
  const name = highlight?.name?.[0];
  const description = highlight?.description?.[0];
  if (!name && !description) {
    return undefined;
  }
  return {
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
  };
}

/** The first sort value of a geo distance sort is the distance in km. */
function readDistance(sort: estypes.SortResults | undefined): number | undefined {
  const value = Number(sort?.[0]);
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return Math.round(value * 100) / 100;
}

function toProductView(source: ProductDocument): ProductView {
  return {
    id: source.id,
    name: source.name,
    description: source.description,
    category: source.category,
    subcategories: source.subcategories,
    location: source.location,
    ...(source.coordinates ? { coordinates: source.coordinates } : {}),
    price: source.price,
    popularity: source.popularity,
    createdAt: new Date(source.createdAt),
  };
}

function readBuckets(
  aggregations: ProductAggregations | undefined,
  facet: FacetKey,
): FacetBucket[] {
  const buckets = aggregations?.[facet]?.values.buckets ?? [];
  return buckets.map((bucket) => ({ value: bucket.key, count: bucket.doc_count }));
}

function readPriceStats(aggregations: ProductAggregations | undefined): PriceStats | null {
  const stats = aggregations?.price_stats?.values;
  if (!stats || stats.count === 0 || stats.min === null || stats.max === null) {
    return null;
  }
  return { min: stats.min, max: stats.max, avg: Math.round(stats.avg * 100) / 100 };
}

function readSuggestions(suggest: ProductSuggest | undefined, text?: string): string[] {
  const options = suggest?.alternatives?.[0]?.options ?? [];
  const original = text?.trim().toLowerCase();
  return options
    .map((option) => option.text)
    .filter((suggestion) => suggestion.toLowerCase() !== original);
}
