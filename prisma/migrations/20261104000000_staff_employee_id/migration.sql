-- Every staff member has an employee ID: the company's own number, or `bmt_<user id>`.
ALTER TABLE "company_staff" ADD COLUMN "employee_id" TEXT;

UPDATE "company_staff" SET "employee_id" = 'bmt_' || "user_id"::text;

ALTER TABLE "company_staff" ALTER COLUMN "employee_id" SET NOT NULL;

CREATE UNIQUE INDEX "company_staff_company_id_employee_id_key" ON "company_staff"("company_id", "employee_id");
