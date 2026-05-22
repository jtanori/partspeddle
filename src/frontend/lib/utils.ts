/**
 * Frontend utility functions.
 *
 * Placeholder for shared frontend utilities.
 * Add API clients, formatting helpers, and domain-specific utilities here.
 */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
