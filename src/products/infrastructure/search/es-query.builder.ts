import {
  ProductSearchCriteria,
  ProductSearchFilters,
  SortField,
} from '@/products/domain/search/search-criteria';

type EsClause = Record<string, unknown>;

/**
 * Builds Elasticsearch request bodies from domain search criteria.
 *
 * Faceting strategy (combined faceting):
 *   - Full text goes into `query`.
 *   - Active filters go into `post_filter`, so they narrow the hits but NOT the
 *     top level aggregations.
 *   - Each facet aggregation is wrapped in a `filter` agg that applies every
 *     OTHER active filter but not its own. This way selecting one category still
 *     shows the counts of sibling categories, while location/price facets already
 *     reflect the chosen category. This is the behaviour users expect from a
 *     faceted search UI.
 */
export class EsQueryBuilder {
  private static readonly FACET_SIZE = 50;

  static buildSearchBody(criteria: ProductSearchCriteria): EsClause {
    const from = (criteria.page - 1) * criteria.pageSize;

    const body: EsClause = {
      from,
      size: criteria.pageSize,
      track_total_hits: true,
      query: this.buildRelevanceQuery(criteria),
      post_filter: this.buildPostFilter(criteria.filters),
      aggs: this.buildAggregations(criteria.filters),
      sort: this.buildSort(criteria),
    };

    const suggest = this.buildSuggest(criteria.text);
    if (suggest) {
      body.suggest = suggest;
    }

    return body;
  }

  static buildAutocompleteBody(prefix: string, limit: number): EsClause {
    return {
      size: limit,
      _source: ['name'],
      // Collapse on the exact name so duplicate product names appear once.
      collapse: { field: 'name.keyword' },
      query: {
        multi_match: {
          query: prefix,
          type: 'bool_prefix',
          fields: ['name.sat', 'name.sat._2gram', 'name.sat._3gram'],
        },
      },
    };
  }

  // --- query ---------------------------------------------------------------

  private static buildRelevanceQuery(criteria: ProductSearchCriteria): EsClause {
    const textQuery: EsClause = criteria.text
      ? {
          multi_match: {
            query: criteria.text,
            type: 'best_fields',
            // name is weighted highest; description lowest. Fuzziness tolerates
            // small typos without a separate suggester round trip.
            fields: ['name^5', 'category^2', 'subcategories^1.5', 'description'],
            fuzziness: 'AUTO',
            operator: 'or',
            minimum_should_match: '2<70%',
          },
        }
      : { match_all: {} };

    // Only blend popularity into the score when ranking by relevance; other sort
    // modes rank by an explicit field so the score shaping is irrelevant.
    if (criteria.sort.field !== SortField.RELEVANCE) {
      return textQuery;
    }

    return {
      function_score: {
        query: textQuery,
        functions: [
          {
            field_value_factor: {
              field: 'popularity',
              modifier: 'ln1p',
              factor: 1,
              missing: 0,
            },
          },
        ],
        // Add a gentle popularity nudge on top of text relevance rather than
        // letting popularity dominate.
        boost_mode: 'sum',
        score_mode: 'sum',
      },
    };
  }

  // --- filters -------------------------------------------------------------

  private static buildPostFilter(filters: ProductSearchFilters): EsClause {
    const clauses = this.allFilterClauses(filters);
    return clauses.length > 0 ? { bool: { filter: clauses } } : { match_all: {} };
  }

  private static allFilterClauses(filters: ProductSearchFilters): EsClause[] {
    return [
      ...this.categoryClause(filters),
      ...this.subcategoryClause(filters),
      ...this.locationClause(filters),
      ...this.priceClause(filters),
    ];
  }

  private static categoryClause(filters: ProductSearchFilters): EsClause[] {
    return filters.categories?.length
      ? [{ terms: { 'category.keyword': filters.categories } }]
      : [];
  }

  private static subcategoryClause(filters: ProductSearchFilters): EsClause[] {
    return filters.subcategories?.length
      ? [{ terms: { 'subcategories.keyword': filters.subcategories } }]
      : [];
  }

  private static locationClause(filters: ProductSearchFilters): EsClause[] {
    return filters.locations?.length ? [{ terms: { 'location.keyword': filters.locations } }] : [];
  }

  private static priceClause(filters: ProductSearchFilters): EsClause[] {
    const price = filters.price;
    if (!price || (price.min === undefined && price.max === undefined)) {
      return [];
    }
    const range: Record<string, number> = {};
    if (price.min !== undefined) range.gte = price.min;
    if (price.max !== undefined) range.lte = price.max;
    return [{ range: { price: range } }];
  }

  // --- aggregations (facets) ----------------------------------------------

  private static buildAggregations(filters: ProductSearchFilters): EsClause {
    // Each facet is filtered by every OTHER active filter.
    const others = (exclude: keyof ProductSearchFilters): EsClause[] => {
      const clauses: EsClause[] = [];
      if (exclude !== 'categories') clauses.push(...this.categoryClause(filters));
      if (exclude !== 'subcategories') clauses.push(...this.subcategoryClause(filters));
      if (exclude !== 'locations') clauses.push(...this.locationClause(filters));
      if (exclude !== 'price') clauses.push(...this.priceClause(filters));
      return clauses;
    };

    const facet = (exclude: keyof ProductSearchFilters, values: EsClause): EsClause => ({
      filter: { bool: { filter: others(exclude) } },
      aggs: { values },
    });

    return {
      categories: facet('categories', {
        terms: { field: 'category.keyword', size: this.FACET_SIZE },
      }),
      subcategories: facet('subcategories', {
        terms: { field: 'subcategories.keyword', size: this.FACET_SIZE },
      }),
      locations: facet('locations', {
        terms: { field: 'location.keyword', size: this.FACET_SIZE },
      }),
      price_stats: {
        filter: { bool: { filter: others('price') } },
        aggs: { values: { stats: { field: 'price' } } },
      },
    };
  }

  // --- sort ----------------------------------------------------------------

  private static buildSort(criteria: ProductSearchCriteria): EsClause[] {
    const dir = criteria.sort.direction;
    switch (criteria.sort.field) {
      case SortField.POPULARITY:
        return [{ popularity: dir }, { _score: 'desc' }];
      case SortField.CREATED_AT:
        return [{ createdAt: dir }];
      case SortField.RELEVANCE:
      default:
        return [{ _score: 'desc' }, { popularity: 'desc' }];
    }
  }

  // --- suggestions ---------------------------------------------------------

  private static buildSuggest(text?: string): EsClause | null {
    if (!text) {
      return null;
    }
    return {
      text,
      alternatives: {
        phrase: {
          field: 'name.trigram',
          size: 3,
          gram_size: 3,
          max_errors: 2,
          confidence: 0,
          direct_generator: [{ field: 'name.trigram', suggest_mode: 'always' }],
        },
      },
    };
  }
}
