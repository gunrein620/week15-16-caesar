import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TagsService } from './tags.service.js';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(@Inject(TagsService) private readonly tagsService: TagsService) {}

  @Get()
  findAll() {
    return this.tagsService.findAll();
  }
}
