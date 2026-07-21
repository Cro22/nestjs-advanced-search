import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class AutocompleteQueryDto {
  @ApiProperty({ description: 'Prefix typed by the user', example: 'lap' })
  @IsString()
  @MinLength(1)
  q!: string;

  @ApiPropertyOptional({ description: 'Maximum suggestions to return', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  limit?: number;
}
