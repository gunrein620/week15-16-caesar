import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Trim } from '../../common/string-transforms.js';

export class RagAskDto {
  @ApiProperty({ example: '근처 야간 약국 어디 있어?' })
  @Trim()
  @IsString()
  @MinLength(1)
  question!: string;

  @ApiPropertyOptional({ example: 'region-id' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number;
}
