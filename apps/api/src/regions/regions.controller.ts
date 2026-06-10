import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RegionsService } from './regions.service.js';

@ApiTags('regions')
@Controller('regions')
export class RegionsController {
  constructor(@Inject(RegionsService) private readonly regionsService: RegionsService) {}

  @Get()
  findAll(@Query('parentId') parentId?: string) {
    return this.regionsService.findAll(parentId);
  }

  @Get('default')
  getDefaultRegion() {
    return this.regionsService.getDefaultRegion();
  }
}
