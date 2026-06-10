import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn()
    }
  };
  const jwtService = {
    signAsync: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects duplicate email during signup', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@local.test' });
    const service = new AuthService(prisma as never, jwtService as never);

    await expect(
      service.signup({
        email: 'a@local.test',
        password: 'password123',
        nickname: '오산주민'
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('hashes password and never returns passwordHash on signup', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'a@local.test',
      nickname: '오산주민',
      passwordHash: 'hashed-password',
      defaultRegionId: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    jwtService.signAsync.mockResolvedValue('signed-token');
    const service = new AuthService(prisma as never, jwtService as never);

    const result = await service.signup({
      email: 'a@local.test',
      password: 'password123',
      nickname: '오산주민'
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'a@local.test',
        nickname: '오산주민',
        passwordHash: expect.not.stringContaining('password123')
      })
    });
    expect(result).toEqual({
      accessToken: 'signed-token',
      user: {
        id: 'user-1',
        email: 'a@local.test',
        nickname: '오산주민',
        defaultRegionId: null
      }
    });
  });

  it('maps database unique email race to conflict during signup', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test'
      })
    );
    const service = new AuthService(prisma as never, jwtService as never);

    await expect(
      service.signup({
        email: 'a@local.test',
        password: 'password123',
        nickname: '오산주민'
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects login with invalid password', async () => {
    const service = new AuthService(prisma as never, jwtService as never);
    const hash = await service.hashPassword('password123');
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@local.test',
      nickname: '오산주민',
      passwordHash: hash,
      defaultRegionId: null
    });

    await expect(
      service.login({
        email: 'a@local.test',
        password: 'wrong-password'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns accessToken with sub and email payload on valid login', async () => {
    const service = new AuthService(prisma as never, jwtService as never);
    const hash = await service.hashPassword('password123');
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'a@local.test',
      nickname: '오산주민',
      passwordHash: hash,
      defaultRegionId: null
    });
    jwtService.signAsync.mockResolvedValue('signed-token');

    const result = await service.login({
      email: 'a@local.test',
      password: 'password123'
    });

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'user-1',
      email: 'a@local.test'
    });
    expect(result.accessToken).toBe('signed-token');
    expect(result.user).not.toHaveProperty('passwordHash');
  });
});
