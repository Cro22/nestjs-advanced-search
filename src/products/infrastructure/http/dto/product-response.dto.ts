import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Documentation-only DTOs describing the JSON the endpoints return, so Swagger
 * shows accurate response schemas and examples. The controllers still return the
 * plain objects built by the response mapper; these classes only type the
 * @ApiResponse declarations. */

export class GeoPointDto {
  @ApiProperty({ example: 40.4168 })
  lat!: number;

  @ApiProperty({ example: -3.7038 })
  lon!: number;
}

export class ProductResponseDto {
  @ApiProperty({ format: 'uuid', example: '11111111-1111-4111-8111-111111111111' })
  id!: string;

  @ApiProperty({ example: 'Aurora Laptop' })
  name!: string;

  @ApiProperty({ example: 'A lightweight laptop for everyday use' })
  description!: string;

  @ApiProperty({ example: 'Electronics' })
  category!: string;

  @ApiProperty({ type: [String], example: ['Laptops'] })
  subcategories!: string[];

  @ApiProperty({ example: 'Madrid' })
  location!: string;

  @ApiPropertyOptional({ type: GeoPointDto })
  coordinates?: GeoPointDto;

  @ApiProperty({ example: 899.99 })
  price!: number;

  @ApiProperty({ example: 0, description: 'Server-owned popularity signal' })
  popularity!: number;

  @ApiProperty({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  createdAt!: string;
}

export class HitHighlightsDto {
  @ApiPropertyOptional({ example: 'Aurora <em>Laptop</em>' })
  name?: string;

  @ApiPropertyOptional({ example: 'A fast <em>laptop</em>' })
  description?: string;
}

export class SearchHitDto extends ProductResponseDto {
  @ApiProperty({ example: 2.53, description: 'Relevance score for this query' })
  score!: number;

  @ApiPropertyOptional({ type: HitHighlightsDto })
  highlights?: HitHighlightsDto;

  @ApiPropertyOptional({
    example: 12.3,
    description: 'Distance in km, only when sorting by distance',
  })
  distanceKm?: number;
}

export class FacetBucketDto {
  @ApiProperty({ example: 'Electronics' })
  value!: string;

  @ApiProperty({ example: 42 })
  count!: number;
}

export class PriceStatsDto {
  @ApiProperty({ example: 9.99 })
  min!: number;

  @ApiProperty({ example: 1999.99 })
  max!: number;

  @ApiProperty({ example: 512.35 })
  avg!: number;
}

export class SearchFacetsDto {
  @ApiProperty({ type: [FacetBucketDto] })
  categories!: FacetBucketDto[];

  @ApiProperty({ type: [FacetBucketDto] })
  subcategories!: FacetBucketDto[];

  @ApiProperty({ type: [FacetBucketDto] })
  locations!: FacetBucketDto[];

  @ApiPropertyOptional({ type: PriceStatsDto, nullable: true })
  price!: PriceStatsDto | null;
}

export class SearchMetaDto {
  @ApiProperty({ example: 137 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 7 })
  totalPages!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Cursor for the next page of deep pagination, or null on the last page',
    example: 'W3sicHJpY2UiOjk5OS45OX1d',
  })
  nextCursor!: string | null;
}

export class SearchResponseDto {
  @ApiProperty({ type: [SearchHitDto] })
  data!: SearchHitDto[];

  @ApiProperty({ type: SearchMetaDto })
  meta!: SearchMetaDto;

  @ApiProperty({ type: SearchFacetsDto })
  facets!: SearchFacetsDto;

  @ApiProperty({ type: [String], example: ['laptops'] })
  suggestions!: string[];
}

export class AutocompleteResponseDto {
  @ApiProperty({ type: [String], example: ['Aurora Laptop', 'Aurora Laptop Pro'] })
  suggestions!: string[];
}

export class ViewResponseDto {
  @ApiProperty({ format: 'uuid', example: '11111111-1111-4111-8111-111111111111' })
  id!: string;

  @ApiProperty({ example: 341 })
  popularity!: number;
}

export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({ example: 'NOT_FOUND' })
  error!: string;

  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Product 11111111-1111-4111-8111-111111111111 does not exist',
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/products/11111111-1111-4111-8111-111111111111' })
  path!: string;

  @ApiProperty({ format: 'date-time', example: '2026-01-01T00:00:00.000Z' })
  timestamp!: string;
}
