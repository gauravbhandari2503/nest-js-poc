import {
  ALL_PERMISSIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SystemRole,
} from './permissions.js';

describe('permission master list', () => {
  it('uses unique codes in resource.action form', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const code of ALL_PERMISSIONS) {
      expect(code).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
  });

  it('gives the company owner every permission', () => {
    expect(SYSTEM_ROLE_PERMISSIONS[SystemRole.CompanyOwner]).toEqual(
      ALL_PERMISSIONS,
    );
  });

  it('keeps every other role a subset of the owner without duplicates', () => {
    const owner = new Set(SYSTEM_ROLE_PERMISSIONS[SystemRole.CompanyOwner]);
    for (const codes of Object.values(SYSTEM_ROLE_PERMISSIONS)) {
      expect(new Set(codes).size).toBe(codes.length);
      for (const code of codes) {
        expect(owner.has(code)).toBe(true);
      }
    }
  });
});
