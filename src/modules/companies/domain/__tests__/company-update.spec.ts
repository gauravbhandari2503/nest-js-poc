import { planCompanyUpdate } from '../company-update.js';

const current = {
  salesCommissionBps: 1000,
  membershipCommissionBps: 500,
  status: 'ACTIVE' as const,
};

describe('planCompanyUpdate', () => {
  it('converts percent to basis points and records before and after as percent', () => {
    expect(
      planCompanyUpdate(current, { salesCommissionPercent: 12.5 }),
    ).toEqual({
      data: { salesCommissionBps: 1250 },
      before: { salesCommissionPercent: 10 },
      after: { salesCommissionPercent: 12.5 },
    });
  });

  it('lists only what changed', () => {
    const plan = planCompanyUpdate(current, {
      salesCommissionPercent: 10,
      membershipCommissionPercent: 7,
      status: 'SUSPENDED',
    });
    expect(plan?.data).toEqual({
      membershipCommissionBps: 700,
      status: 'SUSPENDED',
    });
    expect(plan?.before).toEqual({
      membershipCommissionPercent: 5,
      status: 'ACTIVE',
    });
  });

  it('is null when nothing differs', () => {
    expect(
      planCompanyUpdate(current, {
        salesCommissionPercent: 10,
        status: 'ACTIVE',
      }),
    ).toBeNull();
    expect(planCompanyUpdate(current, {})).toBeNull();
  });
});
