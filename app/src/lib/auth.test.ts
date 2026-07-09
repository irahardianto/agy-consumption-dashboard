import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

// Mock next/headers
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import { headers } from 'next/headers';

// Mock google-auth-library
const mockVerifyIdToken = vi.fn();
vi.mock('google-auth-library', () => {
  return {
    OAuth2Client: vi.fn().mockImplementation(() => ({
      verifyIdToken: mockVerifyIdToken,
    })),
  };
});

describe('getUser - Standard Behavior (Without Audience Verification)', () => {
  let getUser: any;

  beforeAll(async () => {
    vi.resetModules();
    const authModule = await import('./auth');
    getUser = authModule.getUser;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user info from IAP headers', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
    ]));

    const user = await getUser();
    expect(user).toEqual({
      id: '12345',
      email: 'user@example.com',
    });
  });

  it('returns null if headers are missing', async () => {
    (headers as any).mockResolvedValue(new Map());

    const user = await getUser();
    expect(user).toBeNull();
  });

  it('handles development bypass when NODE_ENV is development', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = 'development';
    process.env.DEV_USER_EMAIL = 'dev@example.com';
    process.env.DEV_USER_ID = 'dev123';

    (headers as any).mockResolvedValue(new Map());

    const user = await getUser();
    expect(user).toEqual({
      id: 'dev123',
      email: 'dev@example.com',
    });

    (process.env as any).NODE_ENV = originalNodeEnv;
    delete process.env.DEV_USER_EMAIL;
    delete process.env.DEV_USER_ID;
  });
});

describe('getUser - With IAP JWT Assertion and IAP_AUDIENCE Configured', () => {
  let getUser: any;

  beforeAll(async () => {
    process.env.IAP_AUDIENCE = 'test-audience';
    vi.resetModules();
    const authModule = await import('./auth');
    getUser = authModule.getUser;
  });

  afterAll(() => {
    delete process.env.IAP_AUDIENCE;
    vi.resetModules();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user info when JWT assertion is verified successfully', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
      ['x-goog-iap-jwt-assertion', 'valid-jwt-token'],
    ]));

    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: 'https://cloud.google.com/iap',
        sub: 'accounts.google.com:12345',
        email: 'user@example.com',
      }),
    });

    const user = await getUser();
    expect(user).toEqual({
      id: '12345',
      email: 'user@example.com',
    });
    expect(mockVerifyIdToken).toHaveBeenCalledWith({
      idToken: 'valid-jwt-token',
      audience: 'test-audience',
    });
  });

  it('returns null when JWT assertion verification fails/throws', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
      ['x-goog-iap-jwt-assertion', 'invalid-jwt-token'],
    ]));

    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token signature'));

    const user = await getUser();
    expect(user).toBeNull();
  });

  it('returns null when JWT assertion has an invalid issuer', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
      ['x-goog-iap-jwt-assertion', 'invalid-iss-jwt-token'],
    ]));

    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        iss: 'https://malicious-issuer.com',
        sub: 'accounts.google.com:12345',
        email: 'user@example.com',
      }),
    });

    const user = await getUser();
    expect(user).toBeNull();
  });

  it('returns null when JWT assertion is missing', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
    ]));

    const user = await getUser();
    expect(user).toBeNull();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });
});

