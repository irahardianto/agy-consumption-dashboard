import { headers } from 'next/headers';
import { OAuth2Client } from 'google-auth-library';
import logger from './logger';

const IAP_ISS = 'https://cloud.google.com/iap';

const defaultAuthClient = new OAuth2Client();

export interface UserInfo {
  id: string;
  email: string;
}

export interface IapAuthConfig {
  audience?: string;
  nodeEnv?: string;
  devUserId?: string;
  devUserEmail?: string;
}

function getHeaderValue(
  headers: Headers | Map<string, string> | Record<string, string | string[] | undefined>,
  name: string
): string | null {
  if ('get' in headers && typeof headers.get === 'function') {
    const val = headers.get(name);
    return typeof val === 'string' ? val : null;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const lowerName = name.toLowerCase();
  const val = record[name] ?? record[lowerName];
  if (Array.isArray(val)) return val[0] ?? null;
  return typeof val === 'string' ? val : null;
}

/**
 * Pure verification helper to extract and validate IAP identity headers.
 * Decoupled from Next.js headers() to support edge, unit testing, and Node runtimes.
 */
export async function verifyIapHeaders(
  headers: Headers | Map<string, string> | Record<string, string | string[] | undefined>,
  config?: IapAuthConfig,
  authClient?: { verifyIdToken: (options: any) => Promise<any> }
): Promise<UserInfo | null> {
  const nodeEnv = config?.nodeEnv ?? process.env.NODE_ENV;
  const audience = config?.audience ?? process.env.IAP_AUDIENCE;
  const devUserId = config?.devUserId ?? process.env.DEV_USER_ID ?? 'dev-user';
  const devUserEmail = config?.devUserEmail ?? process.env.DEV_USER_EMAIL;
  const client = authClient ?? defaultAuthClient;

  // In non-development environments, IAP_AUDIENCE MUST be configured to prevent header spoofing.
  if (nodeEnv !== 'development' && !audience) {
    logger.error(
      { operation: 'validate_iap_config' },
      'IAP_AUDIENCE environment variable is required in non-development environments'
    );
    throw new Error('IAP_AUDIENCE environment variable is required in non-development environments');
  }

  const iapEmail = getHeaderValue(headers, 'x-goog-authenticated-user-email');
  const iapId = getHeaderValue(headers, 'x-goog-authenticated-user-id');
  const jwtAssertion = getHeaderValue(headers, 'x-goog-iap-jwt-assertion');

  if (!iapEmail || !iapId) {
    if (nodeEnv === 'development' && devUserEmail) {
      return {
        id: devUserId,
        email: devUserEmail,
      };
    }

    logger.warn('Missing IAP headers');
    return null;
  }

  // Sanitize IAP email & id (format: "accounts.google.com:user@example.com")
  const email = iapEmail.split(':').pop() || iapEmail;
  const id = iapId.split(':').pop() || iapId;

  // Validate JWT assertion if audience is configured
  if (audience) {
    if (!jwtAssertion) {
      logger.error({ operation: 'validate_iap_jwt' }, 'Missing IAP JWT assertion header');
      return null;
    }

    try {
      const ticket = await client.verifyIdToken({
        idToken: jwtAssertion,
        audience,
      });
      const payload = ticket.getPayload();

      if (payload?.iss !== IAP_ISS) {
        logger.error({ iss: payload?.iss }, 'Invalid IAP JWT issuer');
        return null;
      }

      logger.debug({ email }, 'IAP JWT validated');
    } catch (error) {
      logger.error({ error, operation: 'validate_iap_jwt' }, 'IAP JWT validation failed');
      return null;
    }
  }

  return { id, email };
}

/**
 * Extract and validate user identity from IAP headers using Next.js request headers.
 */
export async function getUser(): Promise<UserInfo | null> {
  const headerList = await headers();
  return verifyIapHeaders(headerList);
}

/**
 * Middleware-like check for authenticated requests.
 * Throws an error if the user is not authenticated.
 */
export async function requireUser(): Promise<UserInfo> {
  const user = await getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
