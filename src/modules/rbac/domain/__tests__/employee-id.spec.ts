import {
  EMPLOYEE_ID_MAX_LENGTH,
  EMPLOYEE_ID_PATTERN,
  resolveEmployeeId,
} from '../employee-id.js';

const USER_ID = '0194d0a0-0000-7000-8000-000000000001';

describe('resolveEmployeeId', () => {
  it('keeps the ID the company gave, trimmed', () => {
    expect(resolveEmployeeId('  EMP-042 ', USER_ID)).toBe('EMP-042');
  });

  it('falls back to bmt_<user id> when none is given', () => {
    for (const empty of [undefined, null, '', '   ']) {
      expect(resolveEmployeeId(empty, USER_ID)).toBe(`bmt_${USER_ID}`);
    }
  });

  it('keeps the default within the length limit and the allowed characters', () => {
    const generated = resolveEmployeeId(undefined, USER_ID);
    expect(generated.length).toBeLessThanOrEqual(EMPLOYEE_ID_MAX_LENGTH);
    expect(EMPLOYEE_ID_PATTERN.test(generated)).toBe(true);
  });
});

describe('EMPLOYEE_ID_PATTERN', () => {
  it('accepts typical staff numbers', () => {
    for (const id of ['EMP001', 'mum-2024/17', 'a.b_c']) {
      expect(EMPLOYEE_ID_PATTERN.test(id)).toBe(true);
    }
  });

  it('rejects spaces, symbols and a leading separator', () => {
    for (const id of ['EMP 001', '-x', 'x;drop', 'é1']) {
      expect(EMPLOYEE_ID_PATTERN.test(id)).toBe(false);
    }
  });
});
