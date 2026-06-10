import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SearchPostsQuery } from './dto/search-posts.query.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Get('posts')
  searchPosts(@Query() query: SearchPostsQuery) {
    return this.searchService.searchPosts(query);
  }
}
