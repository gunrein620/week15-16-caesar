import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { Trim } from '../../common/string-transforms.js';

export class UpdateCommentDto {
  @ApiProperty({ example: '수정된 댓글입니다.' })
  @Trim()
  @IsString()
  @MinLength(1)
  content!: string;
}
