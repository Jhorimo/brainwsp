import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUser } from '../types/jwt-user';

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): JwtUser => {
  const request = context.switchToHttp().getRequest<{ user: JwtUser }>();
  return request.user;
});
