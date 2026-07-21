import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchProductsUseCase } from '@/products/application/use-cases/search-products.use-case';
import { AutocompleteUseCase } from '@/products/application/use-cases/autocomplete.use-case';
import { CreateProductUseCase } from '@/products/application/use-cases/create-product.use-case';
import { SearchUnavailableError } from '@/products/domain/search/search.errors';
import { SearchProductsQueryDto } from '@/products/infrastructure/http/dto/search-products.query.dto';
import { AutocompleteQueryDto } from '@/products/infrastructure/http/dto/autocomplete.query.dto';
import { CreateProductDto } from '@/products/infrastructure/http/dto/create-product.dto';
import { toSearchCriteria } from '@/products/infrastructure/http/search-criteria.mapper';
import {
  toProductResponseFromDomain,
  toSearchResponse,
} from '@/products/infrastructure/http/product-response.mapper';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  private readonly maxPageSize: number;
  private readonly autocompleteMax: number;

  constructor(
    private readonly searchProducts: SearchProductsUseCase,
    private readonly autocomplete: AutocompleteUseCase,
    private readonly createProduct: CreateProductUseCase,
    config: ConfigService,
  ) {
    this.maxPageSize = config.get<number>('search.maxPageSize', 100);
    this.autocompleteMax = config.get<number>('search.autocompleteMaxSuggestions', 10);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Advanced product search',
    description:
      'Full text search with relevance ranking, combined faceting, filters, pagination, sorting and query suggestions.',
  })
  async search(@Query() query: SearchProductsQueryDto) {
    const criteria = toSearchCriteria(query, this.maxPageSize);
    try {
      const result = await this.searchProducts.execute(criteria);
      return toSearchResponse(result);
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Get('autocomplete')
  @ApiOperation({
    summary: 'Autocomplete suggestions',
    description:
      'Prefix based product name suggestions served from Elasticsearch and cached in Redis.',
  })
  async autocompleteSuggestions(@Query() query: AutocompleteQueryDto) {
    const limit = Math.min(query.limit ?? this.autocompleteMax, this.autocompleteMax);
    try {
      const suggestions = await this.autocomplete.execute({ prefix: query.q, limit });
      return { suggestions };
    } catch (error) {
      this.rethrow(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a product',
    description: 'Persists the product in Postgres and projects it into Elasticsearch.',
  })
  async create(@Body() dto: CreateProductDto) {
    const product = await this.createProduct.execute({
      name: dto.name,
      description: dto.description,
      category: dto.category,
      subcategories: dto.subcategories,
      location: dto.location,
      price: dto.price,
      popularity: dto.popularity,
    });
    return toProductResponseFromDomain(product);
  }

  /**
   * Translate domain errors into their HTTP counterparts. A search backend
   * outage becomes a clean 503 instead of leaking the raw Elasticsearch error.
   */
  private rethrow(error: unknown): never {
    if (error instanceof SearchUnavailableError) {
      throw new ServiceUnavailableException(error.message);
    }
    throw error;
  }
}
