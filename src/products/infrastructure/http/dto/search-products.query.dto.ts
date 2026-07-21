import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SortDirection, SortField } from '@/products/domain/search/search-criteria';

/** Accepts both `?categories=a,b` and repeated `?categories=a&categories=b`. */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const raw = Array.isArray(value) ? value : String(value).split(',');
  return raw.map((item) => String(item).trim()).filter((item) => item.length > 0);
};

export class SearchProductsQueryDto {
  @ApiPropertyOptional({ description: 'Free text query matched against name, category and more' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Category filter', example: 'Electronics,Books' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ description: 'Subcategory filter', example: 'Laptops,Smartphones' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  subcategories?: string[];

  @ApiPropertyOptional({ description: 'Location filter', example: 'Madrid,Barcelona' })
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  locations?: string[];

  @ApiPropertyOptional({ description: 'Minimum price', example: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: SortField, default: SortField.RELEVANCE })
  @IsOptional()
  @IsEnum(SortField)
  sort?: SortField;

  @ApiPropertyOptional({ enum: SortDirection, default: SortDirection.DESC })
  @IsOptional()
  @IsEnum(SortDirection)
  order?: SortDirection;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
