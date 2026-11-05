import type { CompanyStatus } from '../../../generated/prisma/client.js';
import { bpsToPercent, percentToBps } from './commission.js';

export interface CompanyUpdateInput {
  salesCommissionPercent?: number;
  membershipCommissionPercent?: number;
  status?: CompanyStatus;
}

export interface CompanyUpdate {
  /** Columns to write (rates in basis points). */
  data: {
    salesCommissionBps?: number;
    membershipCommissionBps?: number;
    status?: CompanyStatus;
  };
  /** The changed fields only, as people read them (percent), for the audit entry. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

/**
 * What an update would actually change. Null when every given value equals the current
 * one, so a repeated request writes nothing and leaves no audit entry.
 */
export function planCompanyUpdate(
  current: {
    salesCommissionBps: number;
    membershipCommissionBps: number;
    status: CompanyStatus;
  },
  input: CompanyUpdateInput,
): CompanyUpdate | null {
  const update: CompanyUpdate = { data: {}, before: {}, after: {} };

  if (input.salesCommissionPercent !== undefined) {
    const bps = percentToBps(input.salesCommissionPercent);
    if (bps !== current.salesCommissionBps) {
      update.data.salesCommissionBps = bps;
      update.before['salesCommissionPercent'] = bpsToPercent(
        current.salesCommissionBps,
      );
      update.after['salesCommissionPercent'] = bpsToPercent(bps);
    }
  }
  if (input.membershipCommissionPercent !== undefined) {
    const bps = percentToBps(input.membershipCommissionPercent);
    if (bps !== current.membershipCommissionBps) {
      update.data.membershipCommissionBps = bps;
      update.before['membershipCommissionPercent'] = bpsToPercent(
        current.membershipCommissionBps,
      );
      update.after['membershipCommissionPercent'] = bpsToPercent(bps);
    }
  }
  if (input.status !== undefined && input.status !== current.status) {
    update.data.status = input.status;
    update.before['status'] = current.status;
    update.after['status'] = input.status;
  }

  return Object.keys(update.data).length > 0 ? update : null;
}
