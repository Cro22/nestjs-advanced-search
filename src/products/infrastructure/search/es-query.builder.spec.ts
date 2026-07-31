import { EsQueryBuilder } from '@/products/infrastructure/search/es-query.builder';
import {
  ProductSearchCriteria,
  ProductSearchFilters,
  SortDirection,
  SortField,
} from '@/products/domain/search/search-criteria';

function criteria(overrides: Partial<ProductSearchCriteria> = {}): ProductSearchCriteria {
  return {
    text: undefined,
    filters: {},
    sort: { field: SortField.RELEVANCE, direction: SortDirection.DESC },
    page: 1,
    pageSize: 20,
    ...overrides,
  };
}

describe('EsQueryBuilder.buildSearchBody', () => {
  it('translates page and pageSize into from/size', () => {
    const body = EsQueryBuilder.buildSearchBody(criteria({ page: 3, pageSize: 25 }));

    expect(body.from).toBe(50); // (3 - 1) * 25
    expect(body.size).toBe(25);
    expect(body.track_total_hits).toBe(true);
  });

  it('uses match_all when there is no free text', () => {
    const body = EsQueryBuilder.buildSearchBody(criteria());
    const fn = (body.query as any).function_score;

    // Relevance sort still wraps the query in a popularity function_score.
    expect(fn.query).toEqual({ match_all: {} });
  });

  it('weights name highest and enables fuzziness for typo tolerance', () => {
    const body = EsQueryBuilder.buildSearchBody(criteria({ text: 'laptop' }));
    const multiMatch = (body.query as any).function_score.query.multi_match;

    expect(multiMatch.fields[0]).toBe('name^5');
    expect(multiMatch.fuzziness).toBe('AUTO');
  });

  it('blends popularity into the score only when sorting by relevance', () => {
    const relevance = EsQueryBuilder.buildSearchBody(criteria({ text: 'phone' }));
    expect((relevance.query as any).function_score).toBeDefined();

    const byDate = EsQueryBuilder.buildSearchBody(
      criteria({
        text: 'phone',
        sort: { field: SortField.CREATED_AT, direction: SortDirection.DESC },
      }),
    );
    // No score shaping when an explicit field drives the ranking.
    expect((byDate.query as any).function_score).toBeUndefined();
    expect((byDate.query as any).multi_match).toBeDefined();
  });

  it('puts active filters in post_filter so they do not shrink the facets', () => {
    const filters: ProductSearchFilters = {
      categories: ['Electronics'],
      price: { min: 10, max: 100 },
    };
    const body = EsQueryBuilder.buildSearchBody(criteria({ filters }));
    const clauses = (body.post_filter as any).bool.filter;

    expect(clauses).toContainEqual({ terms: { 'category.keyword': ['Electronics'] } });
    expect(clauses).toContainEqual({ range: { price: { gte: 10, lte: 100 } } });
  });

  it('builds a one sided price range when only a bound is given', () => {
    const body = EsQueryBuilder.buildSearchBody(criteria({ filters: { price: { min: 50 } } }));
    const clauses = (body.post_filter as any).bool.filter;

    expect(clauses).toContainEqual({ range: { price: { gte: 50 } } });
  });

  describe('geo filtering', () => {
    const geo = { lat: 40.4168, lon: -3.7038, radiusKm: 25 };

    it('adds a geo_distance clause to the post_filter when a radius is set', () => {
      const body = EsQueryBuilder.buildSearchBody(criteria({ filters: { geo } }));
      const clauses = (body.post_filter as any).bool.filter;

      expect(clauses).toContainEqual({
        geo_distance: {
          distance: '25km',
          coordinates: { lat: 40.4168, lon: -3.7038 },
        },
      });
    });

    it('omits the geo clause when there is no radius (origin only sorts)', () => {
      const body = EsQueryBuilder.buildSearchBody(
        criteria({ filters: { geo: { lat: 40.4168, lon: -3.7038 } } }),
      );
      expect(body.post_filter).toEqual({ match_all: {} });
    });

    it('constrains every facet with the geo radius', () => {
      const aggs = EsQueryBuilder.buildSearchBody(criteria({ filters: { geo } })).aggs as any;
      for (const facet of ['categories', 'subcategories', 'locations', 'price_stats']) {
        expect(aggs[facet].filter.bool.filter).toContainEqual({
          geo_distance: {
            distance: '25km',
            coordinates: { lat: 40.4168, lon: -3.7038 },
          },
        });
      }
    });
  });

  describe('combined faceting', () => {
    it('excludes a facet own filter but applies every other active filter', () => {
      const filters: ProductSearchFilters = {
        categories: ['Electronics'],
        locations: ['Madrid'],
      };
      const aggs = EsQueryBuilder.buildSearchBody(criteria({ filters })).aggs as any;

      // The categories facet must NOT filter by category (so siblings stay visible)
      // but must still filter by location.
      const categoryFacetFilter = aggs.categories.filter.bool.filter;
      expect(categoryFacetFilter).toContainEqual({ terms: { 'location.keyword': ['Madrid'] } });
      expect(categoryFacetFilter).not.toContainEqual({
        terms: { 'category.keyword': ['Electronics'] },
      });

      // The locations facet mirrors the rule the other way around.
      const locationFacetFilter = aggs.locations.filter.bool.filter;
      expect(locationFacetFilter).toContainEqual({
        terms: { 'category.keyword': ['Electronics'] },
      });
      expect(locationFacetFilter).not.toContainEqual({ terms: { 'location.keyword': ['Madrid'] } });
    });

    it('exposes a price stats aggregation', () => {
      const aggs = EsQueryBuilder.buildSearchBody(criteria()).aggs as any;
      expect(aggs.price_stats.aggs.values.stats.field).toBe('price');
    });
  });

  describe('sorting', () => {
    it('sorts by popularity with a score tie breaker', () => {
      const body = EsQueryBuilder.buildSearchBody(
        criteria({ sort: { field: SortField.POPULARITY, direction: SortDirection.DESC } }),
      );
      expect(body.sort).toEqual([{ popularity: 'desc' }, { _score: 'desc' }]);
    });

    it('sorts by createdAt honouring the requested direction', () => {
      const body = EsQueryBuilder.buildSearchBody(
        criteria({ sort: { field: SortField.CREATED_AT, direction: SortDirection.ASC } }),
      );
      expect(body.sort).toEqual([{ createdAt: 'asc' }]);
    });

    it('sorts by relevance with a popularity tie breaker', () => {
      const body = EsQueryBuilder.buildSearchBody(criteria());
      expect(body.sort).toEqual([{ _score: 'desc' }, { popularity: 'desc' }]);
    });

    it('sorts by geo distance from the origin with a score tie breaker', () => {
      const body = EsQueryBuilder.buildSearchBody(
        criteria({
          filters: { geo: { lat: 40.4168, lon: -3.7038 } },
          sort: { field: SortField.DISTANCE, direction: SortDirection.ASC },
        }),
      );
      expect(body.sort).toEqual([
        {
          _geo_distance: {
            coordinates: { lat: 40.4168, lon: -3.7038 },
            order: 'asc',
            unit: 'km',
          },
        },
        { _score: 'desc' },
      ]);
    });
  });

  describe('highlighting', () => {
    it('asks for highlights only when there is a text query', () => {
      const withText = EsQueryBuilder.buildSearchBody(criteria({ text: 'laptop' })) as any;
      expect(withText.highlight.fields.name).toEqual({ number_of_fragments: 0 });
      expect(withText.highlight.fields.description.fragment_size).toBe(160);
      expect(withText.highlight.pre_tags).toEqual(['<em>']);

      const withoutText = EsQueryBuilder.buildSearchBody(criteria());
      expect(withoutText.highlight).toBeUndefined();
    });
  });

  describe('suggestions', () => {
    it('adds a phrase suggester only when there is text', () => {
      const withText = EsQueryBuilder.buildSearchBody(criteria({ text: 'labtop' }));
      expect((withText.suggest as any).alternatives.phrase.field).toBe('name.trigram');

      const withoutText = EsQueryBuilder.buildSearchBody(criteria());
      expect(withoutText.suggest).toBeUndefined();
    });

    it('collates suggestions and only accepts confident corrections', () => {
      const phrase = (EsQueryBuilder.buildSearchBody(criteria({ text: 'labtop' })).suggest as any)
        .alternatives.phrase;

      expect(phrase.confidence).toBe(1.0);
      expect(phrase.collate.query.source.match.name.query).toBe('{{suggestion}}');
      expect(phrase.collate.prune).toBe(false);
    });
  });
});

describe('EsQueryBuilder.buildAutocompleteBody', () => {
  it('boosts exact prefixes over the fuzzy rescue clause', () => {
    const body = EsQueryBuilder.buildAutocompleteBody('lap', 5) as any;
    const [prefixClause, fuzzyClause] = body.query.bool.should;

    expect(body.size).toBe(5);
    expect(prefixClause.multi_match.type).toBe('bool_prefix');
    expect(prefixClause.multi_match.fields).toContain('name.sat');
    expect(prefixClause.multi_match.boost).toBe(3);

    expect(fuzzyClause.match['name.sat'].fuzziness).toBe('AUTO');
    expect(fuzzyClause.match['name.sat'].prefix_length).toBe(1);
    expect(body.query.bool.minimum_should_match).toBe(1);
  });

  it('collapses on the exact name to avoid duplicate suggestions', () => {
    const body = EsQueryBuilder.buildAutocompleteBody('lap', 5) as any;
    expect(body.collapse).toEqual({ field: 'name.keyword' });
  });
});
