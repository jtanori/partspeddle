/**
 * Runtime invariant assertions for strict null-safety.
 *
 * Use instead of non-null assertions (!) to get explicit failures
 * with meaningful messages at the exact site of violation.
 */

export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
): T {
  if (value == null) {
    throw new Error(message);
  }
  return value;
}

export function assertNonEmptyString(
  value: string | null | undefined,
  name: string,
): string {
  if (value == null || value.trim().length === 0) {
    throw new Error(`${name} is required and must be non-empty`);
  }
  return value;
}
