import { OutletStatus, ProviderCode, ProviderStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { ProvidersService } from './providers.service';

const user = {
  id: '40000000-0000-4000-8000-000000000001',
  role: 'authenticated' as const,
};

describe('ProvidersService', () => {
  const findAreas = jest.fn();
  const findOutlets = jest.fn();
  const findProviders = jest.fn();
  const tx = {
    $executeRaw: jest.fn(),
    area: { findMany: findAreas },
    outlet: { findMany: findOutlets },
    provider: { findMany: findProviders },
  };
  const prisma = {
    $transaction: jest.fn(
      (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  } as unknown as PrismaService;
  const service = new ProvidersService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns providers in code order inside an RLS transaction', async () => {
    findProviders.mockResolvedValue([
      {
        code: ProviderCode.PROVIDER_A,
        id: 'provider-a',
        name: 'Provider A',
        status: ProviderStatus.ACTIVE,
      },
    ]);

    await expect(service.listProviders(user)).resolves.toEqual([
      {
        code: 'PROVIDER_A',
        id: 'provider-a',
        name: 'Provider A',
        status: 'ACTIVE',
      },
    ]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('filters outlets by area code when supplied', async () => {
    findOutlets.mockResolvedValue([]);

    await service.listOutlets(user, 'DHAKA_NORTH');

    expect(findOutlets).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { area: { code: 'DHAKA_NORTH' } },
      }),
    );
  });

  it('does not add an outlet filter when area code is absent', async () => {
    findOutlets.mockResolvedValue([]);

    await service.listOutlets(user);

    expect(findOutlets).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('preserves area data in outlet results', async () => {
    findOutlets.mockResolvedValue([
      {
        area: {
          code: 'DHAKA_NORTH',
          id: 'area-1',
          name: 'Dhaka North',
          parentId: null,
        },
        code: 'DN-001',
        id: 'outlet-1',
        name: 'Uttara Synthetic Outlet',
        status: OutletStatus.ACTIVE,
        tier: 1,
        timezone: 'Asia/Dhaka',
      },
    ]);

    await expect(service.listOutlets(user)).resolves.toEqual([
      {
        area: {
          code: 'DHAKA_NORTH',
          id: 'area-1',
          name: 'Dhaka North',
          parentId: null,
        },
        code: 'DN-001',
        id: 'outlet-1',
        name: 'Uttara Synthetic Outlet',
        status: 'ACTIVE',
        tier: 1,
        timezone: 'Asia/Dhaka',
      },
    ]);
  });
});
