/**
 * Master list of permission codes: the single source of truth.
 *
 * - Controllers reference these via `@RequirePermissions(Permission.ShowCreate)`.
 * - The seed upserts `permissions` and `role_permissions` from this file.
 * - A boot check fails when the `permissions` table and this list disagree.
 *
 * The super admin is not listed: `users.kind = SUPER_ADMIN` reaches the
 * `/v1/platform/*` routes by kind, not through permissions.
 */
export const Permission = {
  CompanyManage: 'company.manage',
  MembershipManage: 'membership.manage',

  TheaterRead: 'theater.read',
  TheaterManage: 'theater.manage',
  ScreenRead: 'screen.read',
  ScreenManage: 'screen.manage',

  ShowRead: 'show.read',
  ShowManage: 'show.manage',
  ShowCancel: 'show.cancel',

  FoodRead: 'food.read',
  FoodManage: 'food.manage',

  StaffRead: 'staff.read',
  StaffManage: 'staff.manage',

  BookingRead: 'booking.read',
  TicketVerify: 'ticket.verify',
  RefundReview: 'refund.review',

  SupportHandle: 'support.handle',
  PlatformRequestCreate: 'platform_request.create',
  WorkerManage: 'worker.manage',

  ReportRead: 'report.read',
} as const;

export type PermissionCode = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly PermissionCode[] =
  Object.values(Permission);

export const SystemRole = {
  CompanyOwner: 'COMPANY_OWNER',
  MaintenanceStaff: 'MAINTENANCE_STAFF',
} as const;

export type SystemRoleName = (typeof SystemRole)[keyof typeof SystemRole];

/** Which permissions each seeded system role holds. */
export const SYSTEM_ROLE_PERMISSIONS: Record<
  SystemRoleName,
  readonly PermissionCode[]
> = {
  // The owner holds every company-level permission.
  [SystemRole.CompanyOwner]: ALL_PERMISSIONS,
  [SystemRole.MaintenanceStaff]: [
    Permission.TheaterRead,
    Permission.ScreenRead,
    Permission.ShowRead,
    Permission.FoodRead,
    Permission.BookingRead,
    Permission.TicketVerify,
    Permission.RefundReview,
    Permission.SupportHandle,
    Permission.WorkerManage,
  ],
};
