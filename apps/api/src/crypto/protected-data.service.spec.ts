import { DataEncryptionService } from './data-encryption.service';
import { ProtectedDataService } from './protected-data.service';

describe('ProtectedDataService', () => {
  const service = new ProtectedDataService(new DataEncryptionService());
  const context = { entity: 'journalist', entityId: '1', field: 'payload', ownerId: 'user:2' };
  it('round trips structured data without exposing plaintext', () => {
    const key = Buffer.alloc(32, 3);
    const payload = service.encrypt({ fullName: 'Secret Name', phone: '+380' }, key, context);
    expect(JSON.stringify(payload)).not.toContain('Secret Name');
    expect(service.decrypt(payload, key, context)).toEqual({
      fullName: 'Secret Name',
      phone: '+380',
    });
  });
  it('fails closed for another context', () => {
    const key = Buffer.alloc(32, 3);
    const payload = service.encrypt({ value: 'secret' }, key, context);
    expect(() => service.decrypt(payload, key, { ...context, entityId: '2' })).toThrow(
      'Decryption failed',
    );
  });
});
