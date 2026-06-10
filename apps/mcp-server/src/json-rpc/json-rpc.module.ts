import { Module } from '@nestjs/common';
import { ToolsModule } from '../tools/tools.module.js';
import { JsonRpcController } from './json-rpc.controller.js';
import { JsonRpcService } from './json-rpc.service.js';

@Module({
  imports: [ToolsModule],
  controllers: [JsonRpcController],
  providers: [JsonRpcService]
})
export class JsonRpcModule {}
