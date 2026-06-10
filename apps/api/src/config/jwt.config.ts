import type { JwtSignOptions } from '@nestjs/jwt';

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret) {
    return secret;
  }

  throw new Error('JWT_SECRET is required.');
}

export function getJwtExpiresIn() {
  return (process.env.JWT_EXPIRES_IN ?? '1h') as JwtSignOptions['expiresIn'];
}
