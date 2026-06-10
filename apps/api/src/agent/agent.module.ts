import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { McpClientModule } from '../mcp-client/mcp-client.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RagModule } from '../rag/rag.module.js';
import { AgentController } from './agent.controller.js';
import { AgentStateService } from './agent-state.service.js';
import { AgentToolRegistryService } from './agent-tool-registry.service.js';
import { AgentService } from './agent.service.js';

@Module({
  imports: [PrismaModule, AiModule, RagModule, McpClientModule],
  controllers: [AgentController],
  providers: [AgentStateService, AgentToolRegistryService, AgentService],
  exports: [AgentService]
})
export class AgentModule {}
