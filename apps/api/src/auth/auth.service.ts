import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import type { LoginDto } from './dto/login.dto.js';
import type { SignupDto } from './dto/signup.dto.js';

type UserRecord = {
  id: string;
  email: string;
  nickname: string;
  passwordHash?: string;
  defaultRegionId: string | null;
};

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email }
    });
    if (existing) {
      throw new ConflictException('이미 가입된 이메일입니다.');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const user = await this.createUser(dto, passwordHash);

    return this.createAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email }
    });
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const passwordMatches = await compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    return this.createAuthResponse(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        defaultRegionId: true
      }
    });
    if (!user) {
      throw new UnauthorizedException('인증된 사용자를 찾을 수 없습니다.');
    }
    return user;
  }

  async hashPassword(password: string) {
    return hash(password, 10);
  }

  private async createUser(dto: SignupDto, passwordHash: string) {
    try {
      return await this.prisma.user.create({
        data: {
          email: dto.email,
          nickname: dto.nickname,
          passwordHash
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 가입된 이메일입니다.');
      }
      throw error;
    }
  }

  private async createAuthResponse(user: UserRecord) {
    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email
    });

    return {
      accessToken,
      user: this.toPublicUser(user)
    };
  }

  private toPublicUser(user: UserRecord) {
    return {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      defaultRegionId: user.defaultRegionId
    };
  }
}
