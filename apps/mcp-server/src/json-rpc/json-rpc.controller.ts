import { Body, Controller, Inject, Post } from '@nestjs/common';
import { JsonRpcService } from './json-rpc.service.js';
import type { JsonRpcRequest } from './json-rpc.types.js';

@Controller()
export class JsonRpcController {
  constructor(@Inject(JsonRpcService) private readonly jsonRpcService: JsonRpcService) {}

  @Post('rpc')
  handle(@Body() request: JsonRpcRequest) {
    return this.jsonRpcService.handle(request);
  }
}
