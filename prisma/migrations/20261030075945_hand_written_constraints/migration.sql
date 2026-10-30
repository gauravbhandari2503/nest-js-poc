-- Constraints Prisma cannot express. Design: .claude/docs/database-design/database-design.md section 6.
-- Every statement here is guarded by an integration test (test/db/constraints.e2e-spec.ts).

-- ---------------------------------------------------------------------------
-- Partial unique indexes
-- ---------------------------------------------------------------------------

-- A seat is sold once per show. This index is the lock used by the claim query.
CREATE UNIQUE INDEX "booking_seats_one_active_per_show_seat"
  ON "booking_seats" ("show_id", "seat_id")
  WHERE "status" IN ('HELD', 'SOLD');

-- One open checkout per customer per show.
CREATE UNIQUE INDEX "bookings_one_pending_per_customer_show"
  ON "bookings" ("customer_id", "show_id")
  WHERE "status" = 'PENDING';

-- One open refund request per booking.
CREATE UNIQUE INDEX "refund_requests_one_open_per_booking"
  ON "refund_requests" ("booking_id")
  WHERE "status" IN ('REQUESTED', 'APPROVED');

-- One owner per company.
CREATE UNIQUE INDEX "company_staff_one_owner_per_company"
  ON "company_staff" ("company_id")
  WHERE "is_owner";

-- Role names: NULLs are distinct in a plain unique index, so two partial indexes.
CREATE UNIQUE INDEX "roles_company_name_key"
  ON "roles" ("company_id", "name")
  WHERE "company_id" IS NOT NULL;
CREATE UNIQUE INDEX "roles_system_name_key"
  ON "roles" ("name")
  WHERE "company_id" IS NULL;

-- Ledger idempotency: recognising the same booking/membership twice cannot double-count.
CREATE UNIQUE INDEX "ledger_entries_booking_entry_type_key"
  ON "ledger_entries" ("booking_id", "entry_type")
  WHERE "booking_id" IS NOT NULL;
CREATE UNIQUE INDEX "ledger_entries_membership_entry_type_key"
  ON "ledger_entries" ("customer_membership_id", "entry_type")
  WHERE "customer_membership_id" IS NOT NULL;

-- A worker can have only one active assignment per theater and role.
CREATE UNIQUE INDEX "worker_assignments_one_active"
  ON "worker_assignments" ("theater_id", "employee_id", "role")
  WHERE "released_at" IS NULL;

-- Soft-deleted rows do not block name reuse.
CREATE UNIQUE INDEX "screens_theater_name_active_key"
  ON "screens" ("theater_id", "name")
  WHERE "deleted_at" IS NULL;

-- ---------------------------------------------------------------------------
-- Exclusion constraints
-- ---------------------------------------------------------------------------

-- No overlapping shows on a screen (a cancelled show frees the slot).
ALTER TABLE "shows" ADD CONSTRAINT "shows_no_overlap"
  EXCLUDE USING gist ("screen_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&)
  WHERE ("status" <> 'CANCELLED');

-- At most one active membership per customer per company at a time.
ALTER TABLE "customer_memberships" ADD CONSTRAINT "customer_memberships_no_overlap"
  EXCLUDE USING gist (
    "customer_id" WITH =, "company_id" WITH =, tstzrange("starts_at", "ends_at") WITH &&
  )
  WHERE ("status" = 'ACTIVE');

-- ---------------------------------------------------------------------------
-- CHECK constraints
-- ---------------------------------------------------------------------------

ALTER TABLE "companies"
  ADD CONSTRAINT "companies_sales_commission_bps_range" CHECK ("sales_commission_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "companies_membership_commission_bps_range" CHECK ("membership_commission_bps" BETWEEN 0 AND 10000),
  ADD CONSTRAINT "companies_registration_fee_nonneg" CHECK ("registration_fee" >= 0);

ALTER TABLE "shows"
  ADD CONSTRAINT "shows_ends_after_start" CHECK ("ends_at" > "starts_at");

ALTER TABLE "show_prices" ADD CONSTRAINT "show_prices_price_nonneg" CHECK ("price" >= 0);
ALTER TABLE "food_items" ADD CONSTRAINT "food_items_price_nonneg" CHECK ("price" >= 0);

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_total_nonneg" CHECK ("total_amount" >= 0),
  ADD CONSTRAINT "bookings_total_ok"
    CHECK ("total_amount" = "seats_subtotal" - "discount_amount" + "food_subtotal" + "tax_amount"),
  ADD CONSTRAINT "bookings_refund_le_paid" CHECK ("refunded_amount" <= "paid_amount"),
  ADD CONSTRAINT "bookings_bps_range"
    CHECK ("discount_bps" BETWEEN 0 AND 10000 AND "commission_bps" BETWEEN 0 AND 10000);

ALTER TABLE "booking_food_lines" ADD CONSTRAINT "booking_food_lines_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_kind_matches_fk" CHECK (
    ("kind" = 'BOOKING' AND "booking_id" IS NOT NULL AND "customer_membership_id" IS NULL)
    OR ("kind" = 'MEMBERSHIP' AND "customer_membership_id" IS NOT NULL AND "booking_id" IS NULL)
  );

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "settlements"
  ADD CONSTRAINT "settlements_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "settlements_period_ok" CHECK ("period_end" >= "period_start");

ALTER TABLE "ledger_entries"
  ADD CONSTRAINT "ledger_adjustment_has_memo" CHECK ("entry_type" <> 'ADJUSTMENT' OR "memo" IS NOT NULL);

ALTER TABLE "customer_memberships"
  ADD CONSTRAINT "customer_memberships_active_has_dates"
    CHECK ("status" <> 'ACTIVE' OR ("starts_at" IS NOT NULL AND "ends_at" IS NOT NULL AND "ends_at" > "starts_at"));

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_discount_bps_range" CHECK ("discount_bps" BETWEEN 0 AND 10000);
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_rate_bps_range" CHECK ("rate_bps" BETWEEN 0 AND 10000);

-- ---------------------------------------------------------------------------
-- Append-only tables
-- ---------------------------------------------------------------------------

CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;

CREATE TRIGGER "ledger_entries_immutable" BEFORE UPDATE OR DELETE ON "ledger_entries"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER "audit_logs_immutable" BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
-- Refund status may change PENDING -> SUCCEEDED, so only DELETE is blocked.
CREATE TRIGGER "refunds_no_delete" BEFORE DELETE ON "refunds"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ---------------------------------------------------------------------------
-- Performance indexes that need a WHERE / INCLUDE clause (database-design.md section 5)
-- ---------------------------------------------------------------------------

CREATE INDEX "shows_movie_scheduled_idx" ON "shows" ("movie_id", "starts_at") WHERE "status" = 'SCHEDULED';
CREATE INDEX "shows_ends_at_scheduled_idx" ON "shows" ("ends_at") WHERE "status" = 'SCHEDULED';
CREATE INDEX "booking_seats_held_until_idx" ON "booking_seats" ("held_until") WHERE "status" = 'HELD';
CREATE INDEX "bookings_unrecognised_idx" ON "bookings" ("show_id")
  WHERE "status" IN ('COMPLETED', 'CANCELLED') AND "ledger_recognised_at" IS NULL;
CREATE INDEX "customer_memberships_active_lookup_idx"
  ON "customer_memberships" ("customer_id", "company_id", "ends_at" DESC) WHERE "status" = 'ACTIVE';
CREATE INDEX "ledger_entries_balance_idx" ON "ledger_entries" ("company_id", "account") INCLUDE ("amount");
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" ("available_at") WHERE "processed_at" IS NULL;
CREATE INDEX "movies_genres_gin_idx" ON "movies" USING gin ("genres");
CREATE INDEX "movies_title_trgm_idx" ON "movies" USING gin ("title" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Invoice numbers and payable balances
-- ---------------------------------------------------------------------------

CREATE SEQUENCE "invoice_number_seq";

-- INV-2026-000123. Call inside the transaction that inserts the invoice.
CREATE FUNCTION next_invoice_number() RETURNS text LANGUAGE sql AS $$
  SELECT 'INV-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0')
$$;

CREATE VIEW "company_payable_balances" AS
  SELECT "company_id", COALESCE(SUM("amount"), 0)::bigint AS "balance"
  FROM "ledger_entries"
  WHERE "account" = 'COMPANY_PAYABLE'
  GROUP BY "company_id";
