import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  role: 'authenticated';
}

export interface CurrentUserResponse {
  assignments: Array<{
    areaId: string;
    outletId: string;
    providerId: string | null;
    role: UserRole;
  }>;
  id: string;
  locale: string;
  memberships: Array<{
    providerId: string;
    role: UserRole;
  }>;
}
