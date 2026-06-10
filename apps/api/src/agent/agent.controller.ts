import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AgentService } from './agent.service.js';
import { RunAgentDto } from './dto/run-agent.dto.js';

@ApiTags('agent')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('agent')
export class AgentController {
  constructor(@Inject(AgentService) private readonly agentService: AgentService) {}

  @Post('post-helper')
  postHelper(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunAgentDto) {
    return this.agentService.run({ userId: user.id, purpose: 'post_helper', input: dto.input });
  }

  @Post('complaint-helper')
  complaintHelper(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunAgentDto) {
    return this.agentService.run({ userId: user.id, purpose: 'complaint_helper', input: dto.input });
  }

  @Post('tag-suggestion')
  tagSuggestion(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunAgentDto) {
    return this.agentService.run({ userId: user.id, purpose: 'tag_suggestion', input: dto.input });
  }

  @Post('duplicate-check')
  duplicateCheck(@CurrentUser() user: AuthenticatedUser, @Body() dto: RunAgentDto) {
    return this.agentService.run({ userId: user.id, purpose: 'duplicate_check', input: dto.input });
  }
}
