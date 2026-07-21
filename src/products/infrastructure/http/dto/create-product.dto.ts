import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Aurora Laptop' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'A lightweight laptop for everyday use' })
  @IsString()
  description!: string;

  @ApiProperty({ example: 'Electronics' })
  @IsString()
  @MinLength(1)
  category!: string;

  @ApiProperty({ example: ['Laptops'], type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  subcategories!: string[];

  @ApiProperty({ example: 'Madrid' })
  @IsString()
  @MinLength(1)
  location!: string;

  @ApiProperty({ example: 899.99 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  popularity?: number;
}
