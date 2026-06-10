import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Trim } from '../../common/string-transforms.js';

export class RagPostTextDto {
  @ApiProperty({ example: '오산역 근처 야간 약국 공유해요' })
  @Trim()
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ example: '어제 밤에 급하게 찾았던 약국 정보입니다.' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  content?: string;

  @ApiPropertyOptional({ example: 'region-id' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ example: 'post-id-to-exclude' })
  @IsOptional()
  @IsString()
  excludePostId?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  topK?: number;
}
