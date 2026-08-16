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

describe('auth - Production / Non-Development Fail-Fast Behavior', () => {
  let getUser: any;
  let requireUser: any;
  let verifyIapHeaders: any;

  beforeAll(async () => {
    vi.resetModules();
    const authModule = await import('./auth');
    getUser = authModule.getUser;
    requireUser = authModule.requireUser;
    verifyIapHeaders = authModule.verifyIapHeaders;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.IAP_AUDIENCE;
    (process.env as any).NODE_ENV = 'production';
  });

  it('fails fast and throws descriptive error when IAP_AUDIENCE is not configured in production', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
    ]));

    await expect(getUser()).rejects.toThrow(
      'IAP_AUDIENCE environment variable is required in non-development environments'
    );
  });

  it('throws descriptive error in requireUser when IAP_AUDIENCE is not configured in production', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
    ]));

    await expect(requireUser()).rejects.toThrow(
      'IAP_AUDIENCE environment variable is required in non-development environments'
    );
  });

  it('verifyIapHeaders throws descriptive error when config specifies non-development without audience', async () => {
    const headerMap = new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
    ]);

    await expect(
      verifyIapHeaders(headerMap, { nodeEnv: 'production' })
    ).rejects.toThrow(
      'IAP_AUDIENCE environment variable is required in non-development environments'
    );
  });
});

describe('auth - Development Environment Behavior', () => {
  let getUser: any;
  let requireUser: any;
  let verifyIapHeaders: any;

  beforeAll(async () => {
    vi.resetModules();
    const authModule = await import('./auth');
    getUser = authModule.getUser;
    requireUser = authModule.requireUser;
    verifyIapHeaders = authModule.verifyIapHeaders;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as any).NODE_ENV = 'development';
    delete process.env.IAP_AUDIENCE;
    delete process.env.DEV_USER_EMAIL;
    delete process.env.DEV_USER_ID;
  });

  it('returns user info from raw IAP headers in development when IAP_AUDIENCE is not set', async () => {
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

  it('falls back to DEV_USER_EMAIL and DEV_USER_ID when IAP headers are missing in development', async () => {
    process.env.DEV_USER_EMAIL = 'dev@example.com';
    process.env.DEV_USER_ID = 'dev123';

    (headers as any).mockResolvedValue(new Map());

    const user = await getUser();
    expect(user).toEqual({
      id: 'dev123',
      email: 'dev@example.com',
    });
  });

  it('falls back to default dev-user ID when DEV_USER_ID is not explicitly provided', async () => {
    process.env.DEV_USER_EMAIL = 'dev@example.com';

    (headers as any).mockResolvedValue(new Map());

    const user = await getUser();
    expect(user).toEqual({
      id: 'dev-user',
      email: 'dev@example.com',
    });
  });

  it('returns null when IAP headers are missing and DEV_USER_EMAIL is not set in development', async () => {
    (headers as any).mockResolvedValue(new Map());

    const user = await getUser();
    expect(user).toBeNull();
  });
});

describe('auth - Cryptographic JWT Verification with IAP_AUDIENCE', () => {
  let getUser: any;
  let requireUser: any;
  let verifyIapHeaders: any;

  beforeAll(async () => {
    vi.resetModules();
    const authModule = await import('./auth');
    getUser = authModule.getUser;
    requireUser = authModule.requireUser;
    verifyIapHeaders = authModule.verifyIapHeaders;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (process.env as any).NODE_ENV = 'production';
    process.env.IAP_AUDIENCE = 'test-audience';
  });

  afterAll(() => {
    delete process.env.IAP_AUDIENCE;
    (process.env as any).NODE_ENV = 'test';
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

  it('returns user info when requireUser is called with valid JWT assertion', async () => {
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

    const user = await requireUser();
    expect(user).toEqual({
      id: '12345',
      email: 'user@example.com',
    });
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

  it('requireUser throws Unauthorized when JWT assertion is missing', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-authenticated-user-email', 'accounts.google.com:user@example.com'],
      ['x-goog-authenticated-user-id', 'accounts.google.com:12345'],
    ]));

    await expect(requireUser()).rejects.toThrow('Unauthorized');
  });

  it('returns null when JWT assertion verification throws error', async () => {
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

  it('returns null when IAP user headers are missing', async () => {
    (headers as any).mockResolvedValue(new Map([
      ['x-goog-iap-jwt-assertion', 'valid-jwt-token'],
    ]));

    const user = await getUser();
    expect(user).toBeNull();
  });
});

describe('verifyIapHeaders - Header Format and Injection Support', () => {
  let verifyIapHeaders: any;

  beforeAll(async () => {
    vi.resetModules();
    const authModule = await import('./auth');
    verifyIapHeaders = authModule.verifyIapHeaders;
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles standard Headers instance', async () => {
    const headersObj = new Headers();
    headersObj.set('x-goog-authenticated-user-email', 'accounts.google.com:headers@example.com');
    headersObj.set('x-goog-authenticated-user-id', 'accounts.google.com:999');

    const user = await verifyIapHeaders(headersObj, { nodeEnv: 'development' });
    expect(user).toEqual({
      id: '999',
      email: 'headers@example.com',
    });
  });

  it('handles plain Record object with lower-cased header keys', async () => {
    const record = {
      'x-goog-authenticated-user-email': 'accounts.google.com:record@example.com',
      'x-goog-authenticated-user-id': 'accounts.google.com:888',
    };

    const user = await verifyIapHeaders(record, { nodeEnv: 'development' });
    expect(user).toEqual({
      id: '888',
      email: 'record@example.com',
    });
  });

  it('handles custom authClient injection', async () => {
    const customAuthClient = {
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          iss: 'https://cloud.google.com/iap',
          sub: 'accounts.google.com:777',
          email: 'custom@example.com',
        }),
      }),
    };

    const headersRecord = {
      'x-goog-authenticated-user-email': 'accounts.google.com:custom@example.com',
      'x-goog-authenticated-user-id': 'accounts.google.com:777',
      'x-goog-iap-jwt-assertion': 'custom-jwt',
    };

    const user = await verifyIapHeaders(
      headersRecord,
      { nodeEnv: 'production', audience: 'custom-aud' },
      customAuthClient
    );

    expect(user).toEqual({
      id: '777',
      email: 'custom@example.com',
    });
    expect(customAuthClient.verifyIdToken).toHaveBeenCalledWith({
      idToken: 'custom-jwt',
      audience: 'custom-aud',
    });
  });
});


