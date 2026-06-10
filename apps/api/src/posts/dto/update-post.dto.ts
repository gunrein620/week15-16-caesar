import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { Trim, TrimStringArray } from '../../common/string-transforms.js';

export class UpdatePostDto {
  @ApiPropertyOptional({ example: '수정된 제목' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  title?: string;

  @ApiPropertyOptional({ example: '수정된 내용' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  content?: string;

  @ApiPropertyOptional({ example: 'category-id' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ example: 'region-id' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({ example: ['생활정보'] })
  @IsOptional()
  @TrimStringArray()
  @IsArray()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  tagNames?: string[];
}
