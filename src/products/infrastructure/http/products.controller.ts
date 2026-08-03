import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '@/auth/roles.decorator';
import { AUTOCOMPLETE_THROTTLE } from '@/shared/infrastructure/http/throttle.constants';
import { SearchProductsUseCase } from '@/products/application/use-cases/search-products.use-case';
import { AutocompleteUseCase } from '@/products/application/use-cases/autocomplete.use-case';
import { CreateProductUseCase } from '@/products/application/use-cases/create-product.use-case';
import { UpdateProductUseCase } from '@/products/application/use-cases/update-product.use-case';
import { DeleteProductUseCase } from '@/products/application/use-cases/delete-product.use-case';
import { RecordProductViewUseCase } from '@/products/application/use-cases/record-product-view.use-case';
import { SearchProductsQueryDto } from '@/products/infrastructure/http/dto/search-products.query.dto';
import { AutocompleteQueryDto } from '@/products/infrastructure/http/dto/autocomplete.query.dto';
import { CreateProductDto } from '@/products/infrastructure/http/dto/create-product.dto';
import { UpdateProductDto } from '@/products/infrastructure/http/dto/update-product.dto';
import { toSearchCriteria } from '@/products/infrastructure/http/search-criteria.mapper';
import {
  toProductResponseFromDomain,
  toSearchResponse,
} from '@/products/infrastructure/http/product-response.mapper';
import { GeoPoint } from '@/products/domain/geo';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  private readonly maxPageSize: number;
  private readonly autocompleteMax: number;

  constructor(
    private readonly searchProducts: SearchProductsUseCase,
    private readonly autocomplete: AutocompleteUseCase,
    private readonly createProduct: CreateProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deleteProduct: DeleteProductUseCase,
    private readonly recordView: RecordProductViewUseCase,
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
    const result = await this.searchProducts.execute(criteria);
    return toSearchResponse(result);
  }

  @Get('autocomplete')
  // Autocomplete fires on every keystroke, so it gets its own tighter budget.
  @Throttle({ default: AUTOCOMPLETE_THROTTLE })
  @ApiOperation({
    summary: 'Autocomplete suggestions',
    description:
      'Prefix based product name suggestions served from Elasticsearch and cached in Redis.',
  })
  async autocompleteSuggestions(@Query() query: AutocompleteQueryDto) {
    const limit = Math.min(query.limit ?? this.autocompleteMax, this.autocompleteMax);
    const suggestions = await this.autocomplete.execute({ prefix: query.q, limit });
    return { suggestions };
  }

  @Post()
  @Roles('admin')
  @ApiBearerAuth('api-key')
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
      coordinates: this.toCoordinates(dto),
      price: dto.price,
    });
    return toProductResponseFromDomain(product);
  }

  @Put(':id')
  @Roles('admin')
  @ApiBearerAuth('api-key')
  @ApiOperation({
    summary: 'Update a product',
    description:
      'Full replacement. Keeps the identity and creation date; the accumulated popularity is preserved and can only change through the view endpoint. The change is searchable on the next request.',
  })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    const product = await this.updateProduct.execute({
      id,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      subcategories: dto.subcategories,
      location: dto.location,
      coordinates: this.toCoordinates(dto),
      price: dto.price,
    });
    return toProductResponseFromDomain(product);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiBearerAuth('api-key')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a product',
    description: 'Removes the product from Postgres and from the search index.',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteProduct.execute(id);
  }

  @Post(':id/view')
  @Roles('admin', 'ingest')
  @ApiBearerAuth('api-key')
  @ApiOperation({
    summary: 'Record a product view',
    description:
      'Increments the popularity signal that feeds relevance boosting and popularity sorting.',
  })
  async view(@Param('id', ParseUUIDPipe) id: string) {
    const product = await this.recordView.execute(id);
    return { id: product.id, popularity: product.popularity };
  }

  /**
   * latitude and longitude travel as separate fields, so their consistency can
   * only be enforced here: both or neither.
   */
  private toCoordinates(dto: CreateProductDto): GeoPoint | undefined {
    if ((dto.latitude === undefined) !== (dto.longitude === undefined)) {
      throw new BadRequestException('latitude and longitude must be provided together');
    }
    return dto.latitude !== undefined && dto.longitude !== undefined
      ? { lat: dto.latitude, lon: dto.longitude }
      : undefined;
  }
}
