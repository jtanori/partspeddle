/**
 * MSW Server Setup
 *
 * Initializes MSW for Node.js test environments (Vitest).
 * For browser environments, use the matching `browser.ts` setup.
 *
 * Ticket: T3.7
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers.js';

/**
 * Shared MSW server instance.
 * Start before tests, reset handlers between tests, close after suite.
 */
export const server = setupServer(...handlers);
