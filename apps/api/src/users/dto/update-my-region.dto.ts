import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateMyRegionDto {
  @ApiProperty({ example: 'region-id' })
  @IsString()
  regionId!: string;
}
