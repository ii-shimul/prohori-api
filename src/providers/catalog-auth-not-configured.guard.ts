import {
  CanActivate,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

@Injectable()
export class CatalogAuthNotConfiguredGuard implements CanActivate {
  canActivate(): boolean {
    throw new ServiceUnavailableException({
      code: 'AUTH_NOT_CONFIGURED',
      message: 'Catalog access requires authentication setup from Step 3.',
    });
  }
}
