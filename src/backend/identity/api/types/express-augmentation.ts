/**
 * Express Request Augmentation for AuthContext
 *
 * Extends the Express Request interface to include an optional auth context.
 * This allows middleware to attach auth data and routes to consume it typesafely.
 */

import type { AuthContext } from '../../application/ports/auth-context.js';

/* eslint-disable @typescript-eslint/no-namespace */
declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user context, attached by auth middleware.
       * Undefined when the request is unauthenticated.
       */
      auth?: AuthContext;

      /**
       * Correlation ID for request tracing.
       * Populated by correlation-id middleware or generated fresh.
       */
      correlationId?: string;

      /**
       * W3C traceparent header value.
       * Populated by correlation-id middleware.
       */
      traceparent?: string;
    }
  }
}
/* eslint-enable @typescript-eslint/no-namespace */

// Empty export to make this a module
export {};
