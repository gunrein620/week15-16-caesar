import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { Trim } from '../../common/string-transforms.js';

export class RunAgentDto {
  @ApiProperty({ example: '이번 주말 오산역 근처 플리마켓 열어도 될까?' })
  @Trim()
  @IsString()
  @MinLength(1)
  input!: string;
}
