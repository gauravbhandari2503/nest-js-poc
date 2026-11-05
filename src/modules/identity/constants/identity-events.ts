/**
 * Outbox event: an `INVITED` user needs the "set your password" email. Data:
 * `{ userId, companyName? }`. Emitted by company onboarding (and later staff acceptance);
 * the handler in `jobs/` issues the token and sends the mail, so the raw token never
 * sits in the outbox table.
 */
export const SET_PASSWORD_REQUESTED = 'user.set_password_requested';
