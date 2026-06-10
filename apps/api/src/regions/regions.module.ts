import { Module } from '@nestjs/common';
import { RegionsController } from './regions.controller.js';
import { RegionsService } from './regions.service.js';

@Module({
  controllers: [RegionsController],
  providers: [RegionsService],
  exports: [RegionsService]
})
export class RegionsModule {}
