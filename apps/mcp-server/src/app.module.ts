import { Module } from '@nestjs/common';
import { JsonRpcModule } from './json-rpc/json-rpc.module.js';

@Module({
  imports: [JsonRpcModule]
})
export class AppModule {}
