import { NotFoundException } from '@nestjs/common';
import { VerifyService } from './verify.service';
describe('VerifyService short-lived projection', () => {
  const prisma: any = { card: { findUnique: jest.fn() } };
  const cache: any = { get: jest.fn() };
  const settings: any = { nszhuLogoPath: jest.fn(() => Promise.resolve(null)) };
  const service = new VerifyService(prisma, cache, settings);
  beforeEach(() => jest.clearAllMocks());
  it('reveals no data without a token', async () => {
    cache.get.mockReturnValue(null);
    await expect(service.verify('uuid')).resolves.toEqual({ valid: false, qrStatus: 'MISSING' });
    expect(prisma.card.findUnique).not.toHaveBeenCalled();
  });
  it('reports EXPIRED when the token is unknown or expired', async () => {
    cache.get.mockReturnValue(null);
    await expect(service.verify('uuid', 'stale')).resolves.toEqual({
      valid: false,
      qrStatus: 'EXPIRED',
    });
  });
  it('uses the cached projection and plaintext revocation status', async () => {
    cache.get.mockReturnValue({
      cardNumber: 'PP-1',
      expireDate: '2099-01-01',
      fullName: 'Signed Name',
      photoPath: '/public-media/opaque',
    });
    prisma.card.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    await expect(service.verify('uuid', 'token')).resolves.toMatchObject({
      valid: true,
      qrStatus: 'VALID',
      cardNumber: 'PP-1',
      fullName: 'Signed Name',
    });
    expect(prisma.card.findUnique).toHaveBeenCalledWith({
      where: { uuid: 'uuid' },
      select: { status: true },
    });
  });
  it('honors immediate revocation without decrypting card data', async () => {
    cache.get.mockReturnValue({ expireDate: '2099-01-01' });
    prisma.card.findUnique.mockResolvedValue({ status: 'BLOCKED' });
    await expect(service.verify('uuid', 'token')).resolves.toMatchObject({
      valid: false,
      status: 'BLOCKED',
    });
  });
  it('rejects a projection without an expiry', async () => {
    cache.get.mockReturnValue({});
    prisma.card.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    await expect(service.verify('uuid', 'token')).resolves.toEqual({
      valid: false,
      qrStatus: 'INVALID',
    });
  });
  it('throws for deleted cards', async () => {
    cache.get.mockReturnValue({ expireDate: '2099-01-01' });
    prisma.card.findUnique.mockResolvedValue(null);
    await expect(service.verify('uuid', 'token')).rejects.toThrow(NotFoundException);
  });
});
