# Fleet Desk: backend API contract

The frontend calls everything through `frontend/assets/js/api.js`. With `<meta name="fleetdesk-mode" content="api">` in `frontend/index.html` — what the frontend container serves — it sends the requests below to `/api/v1`; with `content="mock"` the same calls are answered from the browser's own storage. Responses are JSON. Errors return `{ "message": "...", "details": {...} }` with a 4xx/5xx status; the UI shows `message` to the user as-is, so write it for end users.

IDs are strings. Dates are `YYYY-MM-DD`, times `HH:MM` (24h, Asia/Dhaka), timestamps ISO 8601.

## Reference implementation

`backend/` implements all of this; `docker compose up -d --build` runs it with PostgreSQL (see the README). If you are replacing it with another stack, these are the files to read against each section below:

| This document | Implementation |
|---|---|
| Authentication and roles | `backend/src/auth.js`, `backend/src/sessions.js`, `backend/src/password.js` |
| Sign-in and accounts | `backend/src/routes/auth.js`, `backend/src/routes/users.js` |
| Generic CRUD, entities, validation | `backend/src/schema.js` (columns and types), `backend/src/store.js` (rules), `backend/src/routes/collections.js` |
| Requisition workflow | `backend/src/routes/requisitions.js` |
| Confirmation email fields | `frontend/assets/js/email.js`, sent and retried by `backend/src/mailer.js` |
| Business rules for reports | `frontend/assets/js/calc.js`, exposed by `backend/src/routes/reports.js` |
| Tables, constraints, indexes | `db/migrations/*.sql`, applied at startup by `backend/src/migrate.js` |

`backend/test/smoke.js` checks the whole contract against a running API, including the status codes below.

## Authentication and roles

People sign in on `frontend/login.html`, which posts to `/auth/login` and gets back an HttpOnly, SameSite=Lax session cookie; the session itself lives in the `sessions` table. Every endpoint except `/auth/*` answers 401 without one, and the frontend sends anyone who gets a 401 to the sign-in page.

With `AUTH_MODE=proxy` there is no sign-in page: an authenticating proxy in front passes the identity in (`X-Forwarded-Email`, `X-Forwarded-Groups`, for example LDAP/FreeIPA groups mapped to roles) and Fleet Desk stops managing passwords.

The role on the account decides what is allowed:

| Role | Can do |
|---|---|
| `employee` | Submit a requisition, see their own, and call one off themselves until the trip starts |
| `ags` | Everything in inventory, logbook, fuel, reports; view requests (no approve/reject) |
| `lead` | Everything `ags` can, plus approve/reject requests and change settings |

`GET /api/v1/me` → `{ id, name, designation, email, role, mustChangePassword, authMode }` so the form can prefill and the nav can be built.

The frontend splits the settings page into tabs (`#settings/mail` and so on). That is presentation only — the whole document is still read and written in one go.

### Sign-in and accounts

| Method | Path | Who | Body | Effect |
|---|---|---|---|---|
| GET | `/auth/info` | anyone | | `{ mode, signedIn, demoAccounts, demoPassword }` for the sign-in page |
| POST | `/auth/login` | anyone | `email, password` | Starts a session and sets the cookie. 401 on a bad pair (the same message either way), 403 for a disabled account, 429 after `LOGIN_MAX_FAILURES` tries |
| POST | `/auth/logout` | signed in | | Ends this session, clears the cookie → 204 |
| POST | `/auth/password` | signed in | `currentPassword, newPassword` | Changes your own password and signs out your other sessions |
| PATCH | `/auth/profile` | signed in | `name, designation, mobile` | Your own details |
| GET | `/auth/sessions` | signed in | | Where you are signed in |
| POST | `/auth/sessions/revoke` | signed in | | Ends your other sessions |
| GET | `/users` | lead | | All accounts, without password hashes |
| POST | `/users` | lead | `name, email, designation?, mobile?, role, password?` | Creates the account; returns `temporaryPassword` once if none was given |
| PATCH | `/users/{id}` | lead | `name, designation, mobile, role, status` | 409 when it would remove the last active team lead or the caller's own access |
| POST | `/users/{id}/password` | lead | | New one-time password, returned once; signs that person out everywhere |
| DELETE | `/users/{id}` | lead | | 409 if they have car requests on record — disable the account instead |

**users**: `id, email (unique), name, designation, mobile, role (employee | ags | lead), status (Active | Disabled), mustChangePassword, createdAt, lastLoginAt`

Passwords are stored as scrypt hashes (`backend/src/password.js`) and never returned. A new or reset account carries `mustChangePassword`, and while it is set every endpoint other than `/me` and `/auth/*` answers 403 with `details.mustChangePassword` so the UI can send the person to change it. Disabling an account, changing its role or resetting its password deletes that user's sessions immediately.

## Generic CRUD

For each collection `drivers`, `cars`, `cards`, `trips`, `fuel`, `maintenance`:

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/{collection}` | | array |
| GET | `/{collection}/{id}` | | object |
| POST | `/{collection}` | object without `id` | created object |
| PATCH | `/{collection}/{id}` | changed fields | updated object |
| DELETE | `/{collection}/{id}` | | 204 |

`requisitions` and `outbox` are not created or changed directly; they move through the actions below. The one exception is housekeeping: the team lead can `DELETE /outbox/{id}` to clear a message from the log.

The views compute reports on the client from full lists. When data grows, add query filters (`?from=&to=&carId=`) and move to the report endpoints at the end of this file, which the backend already serves.

Reads are scoped to the caller: `employee` gets only their own requisitions, the emails about them, and the driver and car assigned to them; `cards`, `trips` and `fuel` are refused with 403.

## Entities

**drivers**: `id, empId (unique), name, mobile, licenseNo (unique), licenseExpiry, joinDate, status (Active | On leave | Inactive), otRate (BDT/hour), address`

**cars**: `id, regNo (unique, e.g. "DHAKA METRO-GA 27-4581"), make, model, year, seats, fuelType (Octane | Petrol | Diesel | CNG), tankCapacity, odometer, ownership (Owned | Rented | Leased), driverId (regular driver, nullable), status (Available | On trip | Maintenance | Retired), fitnessExpiry, taxTokenExpiry, insuranceExpiry`

**cards** (payment/fuel cards): `id, provider, cardType (Fleet card | Bank card | Prepaid card), last4 (exactly 4 digits), expiry (YYYY-MM), carId (nullable = pool card), monthlyLimit (BDT), issuedOn, status (Active | Blocked | Closed), notes`
Never accept or store a full card number (PAN), CVV or PIN. Reject anything in `last4` that is not 4 digits.

**trips** (daily logbook, one row per car per day): `id, date, carId, driverId, reqId (nullable), startTime, endTime, startOdo, endOdo, from, to, purpose`

**fuel**: `id, date, time, carId, driverId, cardId (nullable = cash), payment (Card | Cash, derived), fuelType, qty, unitPrice, amount (derived = qty × unitPrice, 2 dp), odometer, station, receiptNo`

**maintenance** (servicing and repairs): `id, date, carId, kind (Service | Repair | Tyres | Battery | Bodywork | Inspection | Other), odometer, workshop, description, cost, invoiceNo, nextServiceDate, nextServiceOdo, notes`
`nextServiceOdo` and `nextServiceDate` are what the garage advised; the most recent record that carries either is what the service reminder reads. Staff only — an employee gets 403.

**requisitions**: `id, reqNo (CR-YYMM-NNN, sequence per month), name, designation, email, requiredDate, startTime, startPoint, destination, reason, status (Pending | Approved | Rejected | Cancelled), createdAt, reviewedAt, reviewedBy, driverId, carId, remarks, cancelledAt, cancelledBy, cancelReason`
`remarks` belongs to the team lead (their note, or why they rejected it); a cancellation keeps its own `cancelReason` so neither overwrites the other.

**outbox**: `id, sentAt, channel (email | sms), status (Queued | Sent | Failed), kind (notification | confirmation | rejection | cancellation), reqId, to, cc, from, subject, html, text, attempts, error`
`error` carries the mail server's own words when a send failed, so the Email log can show why.

**settings** (single object, `GET/PUT /settings`, `lead` only for PUT): `orgName, teamLeadName, teamLeadEmail, senderEmail, shiftStart, shiftEnd, graceMinutes, roundingMinutes, weekendDays [0–6, 0 = Sunday], weekStartDay, weekendMultiplier, holidays [dates], fuelPrices { Octane, Petrol, Diesel, CNG }, smtp { host, port, encryption (none | starttls | tls), user, fromName }`

The `smtp` block is returned to the `lead` only, and never carries the password. Reading it adds `hasPassword` (whether one is stored), `source` (`settings`, `environment` or `none` — where the server details in force come from) and `envHost`. Writing accepts `smtp.password`: a value replaces the stored one, `''` clears it, and leaving the field out keeps it. With no `smtp.host` saved, the mail settings the process was started with (`SMTP_*`) are used instead.

| Method | Path | Who | Body | Effect |
|---|---|---|---|---|
| POST | `/settings/mail-test` | lead | `to?` (defaults to the caller) | Sends one test message through the mail server as currently configured. 200 with the server's own response, or 400 carrying its error. Not recorded in `outbox` |
| POST | `/outbox/{id}/retry` | ags, lead | | Tries a `Queued` or `Failed` message again and returns the updated row |
| DELETE | `/outbox/{id}` | lead | | Removes one message from the log for good. A `Queued` message is then never sent; the request it belongs to is untouched. 204 |

## Validation the server must enforce

- Unique: `drivers.empId`, `drivers.licenseNo`, `cars.regNo` → 409
- `trips`: `endOdo ≥ startOdo`; `endTime > startTime`; one entry per car per date → 409
- `fuel`: `qty > 0`; the card, if given, must be `Active` → 400
- After a trip, fuel or maintenance write, raise `cars.odometer` to the new reading if it is higher
- DELETE on a driver, car or card that is referenced by trips, fuel, maintenance or requisitions → 409 with "Cannot delete: used in N … Mark it inactive instead."
- Approval checks papers against the **trip date**, not today: `cars.fitnessExpiry`, `cars.taxTokenExpiry`, `cars.insuranceExpiry` and `drivers.licenseExpiry` must not fall before `requisitions.requiredDate` → 409 naming each one. An expiry on the trip date itself is still valid, and a date left blank blocks nothing. The rule lives in `frontend/assets/js/papers.js`, mirrored into `backend/src/shared/`

## Requisition workflow

| Method | Path | Who | Body | Effect |
|---|---|---|---|---|
| POST | `/requisitions` | any | `name, designation, email, requiredDate, startTime, startPoint, destination, reason` | Creates `Pending`, assigns `reqNo`, emails the team lead (`notification`) |
| POST | `/requisitions/{id}/approve` | lead | `driverId, carId, remarks?` | Must be `Pending`. Rejects with 409 if the driver or car has another `Approved` request on the same date within 3 hours, or if the car's papers or the driver's licence will have expired by `requiredDate`. Sets `Approved`, `reviewedAt/By`, sends the **confirmation** email to the requester (cc team lead) |
| POST | `/requisitions/{id}/reject` | lead | `remarks` (required) | Must be `Pending`. Sets `Rejected`, sends the **rejection** email |
| POST | `/requisitions/{id}/cancel` | requester, or AGS | `reason` (required once approved) | Allowed while `Pending`, and while `Approved` until the trip's start time passes. Sets `Cancelled` with `cancelledAt/By` and `cancelReason`; a cancelled booking no longer counts towards a clash, so the car and driver are free again. Cancelling an approved trip emails the team lead (`cancellation`, cc the requester). 409 once the trip has started or if it is already cancelled |
| GET | `/requisitions/conflicts?date=&startTime=&driverId=&carId=&excludeId=` | lead | | Approved requests that would clash |

`requiredDate` cannot be in the past. Times are compared in the fleet's timezone (`TZ`, default Asia/Dhaka). `GET /requisitions` returns only the caller's own requisitions when the role is `employee` — filtered by the session email, so no extra parameter is needed — and `cancel` refuses a request belonging to someone else.

### Confirmation email fields

Driver name, Car number, Driver mobile no., Start point, Destination, Request date & time (= `requiredDate` + `startTime`). The template is in `frontend/assets/js/email.js`; render the same on the server and send through the SMTP relay. Write every message to `outbox` with its delivery status, and retry `Failed` ones.

## Business rules for reports

**Running km** = `endOdo − startOdo` per logbook entry, summed by car per week (weeks start on `settings.weekStartDay`) or per calendar month.

**Fuel consumption** per car per month = km run ÷ fuel quantity loaded in that month (km/L, or km/m³ for CNG). Flag when it is more than 15% below the car's average over the previous three months.

**Overtime** per driver per day, from logbook entries:
1. Duty window = earliest `startTime` to latest `endTime` across that driver's entries for the date.
2. Working day: early = time before `shiftStart`, late = time after `shiftEnd`; each counts only if it is more than `graceMinutes`. OT = early + late.
3. Weekend day (`weekendDays`) or a date in `holidays`: the whole duty window is OT, paid at `weekendMultiplier`.
4. Round OT down to `roundingMinutes`. Amount = OT hours × driver `otRate` × multiplier.

Reference implementation: `frontend/assets/js/calc.js`.

## Optional report endpoints (when lists get large)

- `GET /reports/running-km?period=week|month&from=&to=` → `[{ carId, bucket, km }]`
- `GET /reports/fuel-consumption?month=YYYY-MM` → `[{ carId, km, qty, amount, loads, avg, prevAvg }]`
- `GET /reports/overtime?month=YYYY-MM` → `[{ driverId, date, start, end, dutyMin, otMin, offDay, amount }]`
- `GET /reports/card-usage?from=&to=` → `[{ cardId, loads, qty, amount }]`
- `GET /reports/assignments?from=&to=` → `[{ driverId, carId, days, bookings, km, first, last }]` — one row per driver-and-car pairing, counting days from the logbook and bookings from approved requests
