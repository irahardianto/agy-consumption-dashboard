import { headers } from 'next/headers';
import { OAuth2Client } from 'google-auth-library';
import logger from './logger';

const IAP_ISS = 'https://cloud.google.com/iap';
const AUDIENCE = process.env.IAP_AUDIENCE;

const authClient = new OAuth2Client();

export interface UserInfo {
  id: string;
  email: string;
}

/**
 * Extract and validate user identity from IAP headers.
 */
export async function getUser(): Promise<UserInfo | null> {
  const headerList = await headers();
  const iapEmail = (headerList as any).get('x-goog-authenticated-user-email');
  const iapId = (headerList as any).get('x-goog-authenticated-user-id');
  const jwtAssertion = (headerList as any).get('x-goog-iap-jwt-assertion');

  if (!iapEmail || !iapId) {
    // In local development, we might not have IAP headers.
    // Allow a bypass for development if configured.
    if (process.env.NODE_ENV === 'development' && process.env.DEV_USER_EMAIL) {
      return {
        id: process.env.DEV_USER_ID || 'dev-user',
        email: process.env.DEV_USER_EMAIL,
      };
    }
    
    logger.warn('Missing IAP headers');
    return null;
  }

  // Sanitize IAP email (format: "accounts.google.com:user@example.com")
  const email = iapEmail.split(':').pop() || iapEmail;
  const id = iapId.split(':').pop() || iapId;

  // Validate JWT assertion if audience is configured
  if (AUDIENCE) {
    if (!jwtAssertion) {
      logger.error({ operation: 'validate_iap_jwt' }, 'Missing IAP JWT assertion header');
      return null;
    }

    try {
      const ticket = await authClient.verifyIdToken({
        idToken: jwtAssertion,
        audience: AUDIENCE,
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
