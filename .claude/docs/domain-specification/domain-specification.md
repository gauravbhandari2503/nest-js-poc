# Book My Ticket — Product Specification

Oct 30, 2026 · @Gaurav

## Overview

Book My Ticket is a multi-tenant movie ticketing marketplace: theater companies register with the platform, run their theaters through a shared admin portal, and sell tickets, food and memberships to customers through a separate client app.

**Two app surfaces**

| Surface | Used by | Purpose |
| --- | --- | --- |
| Admin portal | Super admin, company owners, maintenance staff | One portal; menus and actions shown or hidden by permission |
| Client app | Customers | Separate layout: discover shows, book, pay, manage orders and memberships |

**How the platform earns**

- A one-time registration fee per company, collected offline at onboarding
- A commission on ticket sales, with the rate set per company
- A commission on membership sales, with the rate set per company

The platform collects every customer payment, keeps its commission, and the super admin pays each company its share manually.

**Tenancy:** each company is a tenant. A company and its staff see only their own theaters, shows, bookings, staff and reports. The super admin sees all companies.

## Roles

Four roles use the system; gate workers are not system users and appear only as an employee ID.

| Role | Scope | Responsibilities |
| --- | --- | --- |
| Super Admin | Whole platform | Registers companies and owners at the office; sets each company's commission rates and registration fee; maintains the global movie catalog; defines membership plans; manages tax rates; handles platform requests from companies; pays out companies; views audit logs and the platform dashboard |
| Company Owner | One company | Holds every company-level permission: theaters, screens and seat layouts, shows and timings, ticket pricing, food items, membership opt-in and pricing, cancellation and refund policy, staff invites, sales report |
| Maintenance Staff | Assigned theaters of one company | Handles customer help tickets and maintenance tickets; assigns or releases gate workers by employee ID; reviews cancellation and refund requests and decides the refund amount |
| Client | Customer account | Signs up, logs in and out; finds shows by city; books seats and food; buys company memberships; views orders, tickets (QR, download) and payment history with invoices; raises help tickets and refund requests |
| Gate worker | Not a system user | Verifies the ticket QR at the entrance; recorded only as an employee ID on the actions staff perform |

**Permissions:** admin access is permission-based. Roles are bundles of permissions, the admin portal shows only what the user's permissions allow, and the server checks the permission on every action. The owner invites staff by email and assigns them a role and theaters.

## Domain model

The domain splits into four areas: what the platform owns, what each company owns, what customers create, and the money that moves between them.

&#91;embedded content: domain map · 4 areas\]

| Term | Meaning |
| --- | --- |
| Company | A theater business registered with the platform; the tenant boundary |
| Theater | A cinema location of a company, in one city |
| Screen | An auditorium in a theater, with a seat layout |
| Seat | A physical seat with a row, number and category |
| Movie | A film in the global catalog |
| Show | One screening of a movie on a screen at a start time, with an interval time and seat prices |
| Booking | A customer's purchase for one show: seats, food lines and totals |
| Ticket | The signed QR issued for a confirmed booking |
| Membership plan | A platform template; a membership offer is a company's opted-in, priced version of it |
| Customer membership | A customer's membership with one company, valid for a set period |
| Refund request | A customer's request to cancel and refund a booking |
| Ledger entry | An append-only record of money owed or paid |
| Settlement | A record of a manual payout to a company |

## Booking

A customer can hold up to 10 seats for one show for 10 minutes while paying; a seat can be sold only once per show.

**Flow**

1. Customer picks a city (browser location by default, switchable) and sees only theaters of registered companies there
2. Picks a movie, a show and seats from the screen's seat map
3. Optionally adds food items with a delivery slot: pre-interval or post-interval
4. Seats are held for 10 minutes; held seats show as unavailable to others
5. Price is calculated: seat prices by category, food, membership discount if the customer holds an active membership with this company, then tax
6. Customer pays; on success the booking is confirmed, a ticket with a QR is issued and a confirmation email is sent
7. If payment fails or the hold expires, the seats are released

**Booking states**

| State | Meaning |
| --- | --- |
| Pending | Seats held, awaiting payment (max 10 minutes) |
| Confirmed | Paid; ticket issued |
| Expired | Hold ran out or payment failed; seats released |
| Cancelled | Cancelled by the customer's approved request or by the company cancelling the show |
| Completed | Show has ended; amounts are final |

**Rules**

- Maximum 10 seats per booking
- Prices, discount, tax rates and commission rates are copied onto the booking when it is made; later changes never alter past bookings
- Food is sold in-app but fulfilled manually by the theater; the system does not track preparation or delivery
- The ticket QR is signed by the system so it cannot be forged; a gate worker verifies it, and a used ticket cannot be used again
- Customers can view their tickets with the QR, download them, and see payment history with invoices

## Memberships

Memberships are sold per company: a membership bought from Company A gives discounts only at Company A's theaters.

- The super admin creates membership plans (name, duration, discount, benefits, suggested price)
- A company opts in or out of plans, at registration and later; when opting in, it sets its own price
- A customer can hold memberships with several companies at once
- At booking, the discount applies only if the customer has an active membership with the theater's company; elsewhere they pay full price
- The company absorbs the discount; the platform's ticket commission is calculated on the price after discount
- If a company opts out, existing members keep their benefits until expiry; no new memberships are sold

**Membership payment, example:** a customer buys Company A's plan for ₹1,000. The platform collects ₹1,000, keeps its membership commission (10% = ₹100 in this example; the rate is set per company) and owes Company A ₹900, paid in the next settlement.

## Cancellations and refunds

Customers can only request a refund; company staff decide the amount by hand, following the company's own published policy.

- Each company writes its own cancellation and refund policy, shown to customers before they book
- A customer raises a refund request on a booking, before the show ends
- Maintenance staff review it and approve with an amount (never more than was paid) or reject it
- An approved refund is paid back through the payment gateway and the customer is emailed
- No refunds are possible after the show has completed
- If a company cancels a show, every booking for it is refunded in full and customers are emailed

**Refund request states:** Requested → Approved or Rejected → Refunded.

## Money

The platform collects every payment, but nothing is earned until the show ends: only then is the commission calculated on the final amount and the company's share added to its payable balance.

&#91;embedded content: money flow · payment to settlement\]

- Refunds approved before the show reduce the pending amount; after the show, no refunds are possible, so the commission is calculated once and never reversed
- Commission and tax rates are taken from the booking, as they were at purchase time
- The super admin pays each company its payable balance by bank transfer and records a settlement with the amount, period and bank reference
- Membership sales follow the same pattern: the platform keeps its membership commission and the rest is owed to the company
- The registration fee is platform income, recorded when the company is onboarded
- Money records are never edited; every change is a new entry

## Support tickets

One ticketing system serves three kinds of tickets, each routed to a different handler.

| Ticket type | Raised by | Handled by | Example |
| --- | --- | --- | --- |
| Help ticket | Customer | Maintenance staff of that company | Payment taken but no ticket received |
| Maintenance ticket | Company staff | Maintenance staff of that company | Broken seat in Screen 2; staff assign or release gate or maintenance workers by employee ID |
| Platform request | Company owner | Super admin | Add a missing movie to the catalog, correct movie details |

Worker details are never stored; a ticket records only the worker's employee ID.

## Platform administration

The super admin runs onboarding, the shared catalog, tax and oversight; companies run their own operations.

| Area | Rule |
| --- | --- |
| Company onboarding | Offline: the company visits the office; the super admin registers the company, its owner, commission rates and the registration fee (paid offline, recorded in the system). The owner receives an email to set a password |
| Venue hierarchy | Company → Theaters (can be in different cities) → Screens → Seats with categories |
| Movie catalog | Global and maintained by the super admin; companies only schedule shows from it and raise a platform request for changes |
| Shows | Created by the company: movie, screen, start time, interval time, seat prices by category; shows on the same screen cannot overlap |
| Tax | Rates per item type (ticket, food, membership) are set by the super admin following current government norms, and copied onto each booking |
| Audit log | Every admin action is recorded (who, what, before and after, when); the super admin can view it per module |
| Company report | Sales report for the company's theaters |
| Super admin dashboard | Platform income, companies registered, bookings, amounts pending payout |
| Location | Client app uses browser location, with a manual city switch; only cities with registered theaters are listed |
| Notifications | Email only |

## Out of scope and mocked in v1

| Item | v1 | Later |
| --- | --- | --- |
| Company self-registration online | Out of scope; onboarding is offline | Next phase |
| GST invoices | Mocked invoice number and PDF | Compliant GST invoicing |
| QR verification | Mocked verify step | Third-party verification tool |
| Payouts to companies | Manual bank transfer, recorded by super admin | Automated payouts |
| Food fulfilment | Not tracked; handled manually by the theater | — |
| Coupons and offers | Out of scope | — |
| SMS and push notifications | Out of scope; email only | — |
| Social login | Out of scope; email and password only | — |
| Payroll of company employees | Out of scope | — |
| Gate worker records | Only employee IDs are stored | — |