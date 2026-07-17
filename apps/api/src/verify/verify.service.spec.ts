import { NotFoundException } from '@nestjs/common';
import { VerifyService } from './verify.service';
describe('VerifyService signed public projection', () => {
  const prisma: any = { card: { findUnique: jest.fn() } };
  const qr: any = { inspect: jest.fn() };
  const service = new VerifyService(prisma, qr);
  beforeEach(() => jest.clearAllMocks());
  it('reveals no data without a valid short-lived token', async () => {
    qr.inspect.mockResolvedValue({ status: 'MISSING' });
    await expect(service.verify('uuid')).resolves.toEqual({ valid: false, qrStatus: 'MISSING' });
    expect(prisma.card.findUnique).not.toHaveBeenCalled();
  });
  it('uses only the signed projection and plaintext revocation status', async () => {
    qr.inspect.mockResolvedValue({
      status: 'VALID',
      projection: {
        cardNumber: 'PP-1',
        expireDate: '2099-01-01',
        fullName: 'Signed Name',
        photoPath: '/public-media/opaque',
      },
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
    qr.inspect.mockResolvedValue({ status: 'VALID', projection: { expireDate: '2099-01-01' } });
    prisma.card.findUnique.mockResolvedValue({ status: 'BLOCKED' });
    await expect(service.verify('uuid', 'token')).resolves.toMatchObject({
      valid: false,
      status: 'BLOCKED',
    });
  });
  it('rejects a validly signed token without a complete projection', async () => {
    qr.inspect.mockResolvedValue({ status: 'VALID', projection: {} });
    prisma.card.findUnique.mockResolvedValue({ status: 'ACTIVE' });
    await expect(service.verify('uuid', 'token')).resolves.toEqual({
      valid: false,
      qrStatus: 'INVALID',
    });
  });
  it('throws for deleted cards', async () => {
    qr.inspect.mockResolvedValue({ status: 'VALID', projection: { expireDate: '2099-01-01' } });
    prisma.card.findUnique.mockResolvedValue(null);
    await expect(service.verify('uuid', 'token')).rejects.toThrow(NotFoundException);
  });
});
