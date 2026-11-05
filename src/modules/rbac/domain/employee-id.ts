/** Prefix of the employee ID given to staff hired without one: `bmt_<user id>`. */
export const EMPLOYEE_ID_PREFIX = 'bmt_';

/** What a company may type: letters, digits and `. _ - /`, at most 40 characters. */
export const EMPLOYEE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export const EMPLOYEE_ID_MAX_LENGTH = 40;

/**
 * The employee ID to store: the one the company gave (trimmed), or `bmt_<user id>` when
 * it gave none. A user id is a UUID, so the default is unique across the platform and
 * fits the length limit.
 */
export function resolveEmployeeId(
  provided: string | null | undefined,
  userId: string,
): string {
  const trimmed = provided?.trim();
  return trimmed ? trimmed : `${EMPLOYEE_ID_PREFIX}${userId}`;
}
