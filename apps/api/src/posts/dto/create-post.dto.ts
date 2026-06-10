import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { Trim, TrimStringArray } from '../../common/string-transforms.js';

export class CreatePostDto {
  @ApiProperty({ example: '오산역 근처 야간 약국 공유해요' })
  @Trim()
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiProperty({ example: '어제 밤에 급하게 찾았던 약국 정보입니다.' })
  @Trim()
  @IsString()
  @MinLength(2)
  content!: string;

  @ApiProperty({ example: 'category-id' })
  @IsString()
  categoryId!: string;

  @ApiPropertyOptional({ example: 'region-id', description: '비우면 기본 지역(OSAN)으로 작성됩니다.' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ example: ['야간약국', '생활정보'] })
  @IsOptional()
  @TrimStringArray()
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  tagNames?: string[];
}
