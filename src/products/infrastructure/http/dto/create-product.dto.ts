import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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

  @ApiPropertyOptional({ description: 'Latitude of the product location', example: 40.4168 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ description: 'Longitude of the product location', example: -3.7038 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiProperty({ example: 899.99 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  // popularity is deliberately not accepted from clients: it is an accumulated
  // relevance signal owned by the server and only ever moved by POST :id/view.
  // Creates start it at 0; updates preserve whatever the product had.
}
