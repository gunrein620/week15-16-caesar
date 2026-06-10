import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Trim } from '../../common/string-transforms.js';

export class ListPostsQuery {
  @IsOptional()
  @IsString()
  regionId?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @Trim()
  @IsString()
  tag?: string;

  @IsOptional()
  @Trim()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
