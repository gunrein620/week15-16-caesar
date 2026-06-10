import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RagAskDto } from './dto/rag-ask.dto.js';
import { RagPostTextDto } from './dto/rag-post-text.dto.js';
import { RegionalIssuesQuery } from './dto/regional-issues.query.js';
import { RagService } from './rag.service.js';

@ApiTags('rag')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rag')
export class RagController {
  constructor(@Inject(RagService) private readonly ragService: RagService) {}

  @Post('ask')
  ask(@Body() dto: RagAskDto) {
    return this.ragService.ask(dto);
  }

  @Post('similar-posts')
  similarPosts(@Body() dto: RagPostTextDto) {
    return this.ragService.findSimilarPosts(dto);
  }

  @Post('duplicate-check')
  duplicateCheck(@Body() dto: RagPostTextDto) {
    return this.ragService.checkDuplicate(dto);
  }

  @Get('regional-issues')
  regionalIssues(@Query() query: RegionalIssuesQuery) {
    return this.ragService.summarizeRegionalIssues(query);
  }
}
