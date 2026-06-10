import { Body, Controller, Inject, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { UpdateMyRegionDto } from './dto/update-my-region.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(@Inject(UsersService) private readonly usersService: UsersService) {}

  @Patch('me/region')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  updateMyRegion(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyRegionDto) {
    return this.usersService.updateMyRegion(user.id, dto.regionId);
  }
}
