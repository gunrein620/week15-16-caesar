import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { Trim } from '../../common/string-transforms.js';

export class CreateCommentDto {
  @ApiProperty({ example: '좋은 정보 감사합니다.' })
  @Trim()
  @IsString()
  @MinLength(1)
  content!: string;
}
