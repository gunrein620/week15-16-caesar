import { Controller, Delete, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { LikesService } from './likes.service.js';

@ApiTags('likes')
@Controller('posts/:id/like')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class LikesController {
  constructor(@Inject(LikesService) private readonly likesService: LikesService) {}

  @Post()
  like(@Param('id') postId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.likesService.like(postId, user.id);
  }

  @Delete()
  unlike(@Param('id') postId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.likesService.unlike(postId, user.id);
  }
}
