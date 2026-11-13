# Fleet Desk: car and driver tracking

Tracks cars, drivers, fuel and payment cards, and handles employee car requests with
team-lead approval. Three containers: the **frontend** (Nginx serving plain HTML, CSS
and ES modules), the **backend** (Node REST API), and the **database** (PostgreSQL).
A fourth, Mailpit, catches the emails the app sends so you can read them without a
mail relay.

Nothing is loaded from the internet at runtime — the fonts are bundled — so it works
on an isolated network.

![The Fleet Desk dashboard: cars and drivers available now, panels showing which cars are on trip, available or in maintenance and which drivers are on duty, free or on leave, trips booked for the next three days, papers and licences about to expire, spend against each fuel card's monthly limit, and km charts](docs/screenshots/dashboard.png)

## What's in it

| Page | Who sees it | Covers |
|---|---|---|
| Request a car | Everyone | Requisition form: name, designation, email, date, start point, destination, starting time, reason |
| My requests | Everyone | The user's requests and their status, the confirmation email they received, the trip slip for a booked trip, and calling off a trip themselves — while it is still waiting, or after approval right up until it starts, which frees the car and driver and tells AGS why |
| Approvals | AGS staff (view), team lead (act) | Review a request, pick car and driver (clashes within 3 hours are flagged, as are papers that run out before the trip), preview and send the confirmation email, or reject with a reason. A booked trip prints a slip for the driver |
| Dashboard | AGS | Which cars are on trip, available or in maintenance and which drivers are on duty, free or on leave right now; waiting requests; trips booked for the next 3 days; expiring papers and licences; spend against each card's monthly limit; km charts |
| Cars | AGS | Car inventory, regular driver, fuel card, papers expiry (fitness, tax token, insurance) |
| Drivers | AGS | Driver inventory, licence expiry, OT rate, this month's duty days and overtime |
| Payment cards | AGS | Card inventory (last 4 digits only), spending against the monthly limit, and the full fuel-load history per card |
| Daily logbook | AGS | One entry per car per day: driver, duty start and end, odometer at start and end |
| Fuel loads | AGS | Every refuel with the card used, plus a by-card summary |
| Servicing and repairs | AGS | Every workshop visit — what was done, what it cost, the odometer at the time — and when each car is next due, which the dashboard warns about |
| Driver leave | AGS | A month at a glance: a row per driver, a column per day, shaded where somebody is away. A driver on leave cannot be given a trip that day |
| Running km | AGS | Km per car by week and by month |
| Fuel consumption | AGS | Fuel and cost per car per month, km/L, cost per km, and a flag when efficiency drops |
| Driver overtime | AGS | Overtime per driver per month with a day-by-day breakdown |
| Assignment history | AGS | Which driver took which car over any period — days driven and km from the logbook, trips booked through approved requests, and whether each pairing is the car's regular driver or cover |
| Message log | AGS | Every email and SMS sent (to the team lead, confirmations, rejections, cancellations, expiry reminders), why any of them failed, and a way to send it again. The team lead can delete entries |
| People and access | Team lead | Who can sign in, their role, and resetting a password |
| Activity | Team lead | The audit trail: every change to the fleet records, the accounts and the settings, with who made it and what it was before |
| Settings | Team lead | Six tabs — approval contacts, shift and overtime rules, mail server, SMS gateway, expiry reminders, fuel prices. Each has its own address (`#settings/mail`), and one Save button covers the lot |

Tables can be sorted and exported to CSV; reports can be printed. A booked trip prints
a one-page **trip slip** for the driver — the car, where to go, who to collect and who
to call — with blanks for the times and odometer readings they bring back, which is
what AGS types into the logbook afterwards.

The top menu groups these pages by category. Its search box (`/` or Ctrl-K from
anywhere) looks through the pages you can open and the records you are allowed to
see — car requests, cars, drivers, payment cards, logbook entries and fuel loads —
then opens the right page with its filters already set to the match. A logbook entry
from three months ago opens the logbook on that day and that car, even though the
page normally starts on the current month. An employee's search covers only their
own requests. It runs in the browser over the lists the app already loads; for a much
larger fleet, move it behind a search endpoint on the API.

## Screens

| | |
|---|---|
| [<img src="docs/screenshots/approve-request.png" alt="Reviewing a car request: the requester's details, a car and driver to assign, and the confirmation email previewed beside them">](docs/screenshots/approve-request.png) | [<img src="docs/screenshots/logbook.png" alt="The daily logbook: one row per car per day with driver, duty times, odometer readings and km run">](docs/screenshots/logbook.png) |
| **Approving a request** — assign the car and driver, with clashes flagged, and read the confirmation email exactly as the requester will get it. | **Daily logbook** — one entry per car per day. Running km and driver overtime are worked out from these. |
| [<img src="docs/screenshots/fuel-consumption.png" alt="Fuel consumption report: cost and quantity for the month, fuel cost per car, and a table flagging cars running below their own three-month average">](docs/screenshots/fuel-consumption.png) | [<img src="docs/screenshots/search.png" alt="The search box open with results grouped into cars and logbook entries">](docs/screenshots/search.png) |
| **Fuel consumption** — km per litre against each car's own three-month average, with a flag when efficiency drops. | **Search** — one box over pages, cars, drivers, cards, requests, logbook entries and fuel loads. |
| [<img src="docs/screenshots/people-and-access.png" alt="People and access: the list of accounts with role, status, last sign-in and actions to edit or reset a password">](docs/screenshots/people-and-access.png) | [<img src="docs/screenshots/sign-in.png" alt="The Fleet Desk sign-in page">](docs/screenshots/sign-in.png) |
| **People and access** — who can sign in and what they may do, managed by the team lead. | **Signing in** — accounts and roles, or hand identity over to an SSO proxy. |
| [<img src="docs/screenshots/menu.png" alt="The top menu with the Daily records category open, showing the daily logbook and fuel loads">](docs/screenshots/menu.png) | [<img src="docs/screenshots/mobile-menu.png" alt="Fleet Desk on a phone, with the menu open as a drawer grouped by category">](docs/screenshots/mobile-menu.png) |
| **Navigation** — pages grouped by category in the top menu. | **On a phone** — the menu becomes a drawer, and tables scroll. |

## Start the whole stack

Needs Docker with the Compose plugin (`docker compose version`).

```bash
cp .env.example .env          # optional: ports, password, timezone
docker compose up -d --build
```

| What | Where |
|---|---|
| The app | http://localhost:8080 |
| Emails it sends | http://localhost:8025 (Mailpit) |
| API, for curl and tests | http://127.0.0.1:8081/api/v1 (loopback only) |

The database starts empty, creates its schema from `db/init/`, and the API loads the
sample fleet — 7 drivers, 6 cars, 5 cards, three months of logbook and fuel entries,
and a requisition history dated relative to today. Data lives in the `pgdata` volume
and survives `docker compose down`.

Sign in with one of the sample accounts — the sign-in page lists them, and they all
use the password `FleetDesk-2026`:

| Account | Role | Sees |
|---|---|---|
| `ags.lead@company.local` | AGS team lead | Everything, including approvals, settings and accounts |
| `habibur.rahman@company.local` | AGS staff | Inventory, logbook, fuel and reports |
| `tahmina.akter@company.local` | Employee | Requesting a car and following their own requests |

Change that password and turn `SHOW_DEMO_ACCOUNTS` off before anyone real uses this —
see [Before real use](#before-real-use).

```bash
docker compose ps                      # health of each container
docker compose logs -f backend         # API log
docker compose down                    # stop, keep the data
docker compose down -v                 # stop and delete the database volume
```

## How the pieces fit

```
browser ──▶ frontend (Nginx :8080)
              ├── /            index.html, login.html, assets/   (static files)
              └── /api/   ──▶  backend (Node :8080)  ──▶  db (PostgreSQL :5432)
                                   └── SMTP ──▶ mail (Mailpit :1025, UI :8025)
```

The browser only ever talks to the frontend; the API and the database are not
published off the host. The frontend decides where its data comes from at runtime
from `<meta name="fleetdesk-mode">` in `frontend/index.html`, which the container
rewrites on start — so the same files serve both the container stack (`api`) and the
browser-only demo (`mock`).

The email and SMS templates, the overtime and running-km rules, the papers and roster
rules and the demo data generator are shared: `backend/scripts/sync-shared.mjs` copies
`frontend/assets/js/{utils,calc,papers,roster,email,sms,seed}.js` into `backend/src/shared/`
when the API image is built. The confirmation email the team lead previews before
approving is rendered by the same module that sends it, and the expiry warning shown
in the approval screen is the same rule the API enforces.

### Settings

All defaults work without a `.env`.

| Variable | Default | What it does |
|---|---|---|
| `WEB_PORT` | `8080` | Host port for the app |
| `API_PORT` | `8081` | Host port for the API, bound to 127.0.0.1 |
| `MAIL_UI_PORT` | `8025` | Host port for Mailpit's web UI |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `fleetdesk` | Database name and credentials |
| `TZ` | `Asia/Dhaka` | Timezone for dates, times and `createdAt` |
| `FLEETDESK_MODE` | `api` | `api` uses the backend; `mock` serves the browser-only demo |
| `AUTH_MODE` | `password` | `password` uses Fleet Desk's own sign-in page; `proxy` trusts an SSO proxy |
| `SESSION_HOURS` | `12` | How long a signed-in session survives without use |
| `SHOW_DEMO_ACCOUNTS` | `true` | Lists the three sample accounts on the sign-in page |
| `DEMO_PASSWORD` | `FleetDesk-2026` | The password the sample accounts are seeded with |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Create your own team lead instead of the samples |
| `SEED_DEMO_DATA` | `true` | Loads the sample fleet, but only into an empty database |
| `SMTP_HOST` / `SMTP_PORT` | `mail` / `1025` | Mail relay. Point at your own and drop the `mail` service |
| `MAIL_RETRY_SECONDS` | `300` | How often failed emails and texts are retried |
| `SMS_URL` | — | SMS gateway address, with `{to}` `{text}` `{sender}` `{apiKey}` in it |
| `SMS_METHOD` / `SMS_HEADERS` / `SMS_BODY` | `GET` / — / — | The rest of the request to the gateway |
| `SMS_API_KEY` / `SMS_SENDER` | — | The account's key and sender ID |
| `SMS_NUMBER_FORMAT` / `SMS_COUNTRY_CODE` | `digits` / `880` | How numbers are written for the gateway |
| `SMS_SUCCESS_TEXT` | — | A word the reply must contain to count as sent |

## Accounts

Everyone who uses Fleet Desk has an account, and the role on it decides what they see.
The **AGS team lead** manages them under **Admin → People and access**: add someone,
change their role, disable an account, or reset a password. A new account gets a
one-time password, shown once, which the person has to replace the first time they
sign in — until they do, nothing else opens for them.

Everyone can open **My account** from the user menu in the top-right to fix their own
name and designation, change their password, and see — and end — the sessions they
have open elsewhere.

Starting with an empty database and no sample data, set `ADMIN_EMAIL` (and optionally
`ADMIN_PASSWORD`) and the first start creates that team lead; without `ADMIN_PASSWORD`
a one-time password is printed to the API log:

```bash
docker compose logs backend | grep '\[accounts\]'
```

Passwords are stored as scrypt hashes and never leave the server. Sessions live in the
database, so disabling an account, changing someone's role, or resetting a password
signs that person out everywhere at once.

## Mail

Fleet Desk emails the team lead when a request comes in, the requester when it is
approved, rejected or cancelled. Where it sends from is set in two places:

- **Settings → Mail server**, by the team lead: server address, port, encryption,
  username, password and sender name, with a **Send a test email** button that reports
  back exactly what the server said — including the error, when there is one. The
  password is stored on the server and never returned by the API, to anyone.
- **The container environment** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASS`), which is what a fresh deployment uses until somebody fills the form in.
  Clearing the server address on the Settings page hands control back to it.

Common relays:

| Relay | Address | Port | Encryption |
|---|---|---|---|
| Microsoft 365 | `smtp.office365.com` | 587 | STARTTLS |
| Google Workspace | `smtp.gmail.com` | 587 | STARTTLS |
| A company relay that needs no sign-in | its hostname | 25 | None |
| Mailpit, in this compose file | `mail` | 1025 | None |

Every message is written to the `outbox` table before it is sent, so nothing is lost
when the relay is down: the **Message log** shows the delivery state with the reason a
message failed, offers **Send again**, and a background worker retries failures on its
own every `MAIL_RETRY_SECONDS`. The team lead can also delete an entry from the log —
the only way anything leaves it. Deleting a message that is still queued means it is
never sent; the request it belongs to is untouched.

## SMS to drivers

An email reaches the person who asked for the car. The driver is out on the road, so
when a trip is approved or called off they get a text instead — trip number, time, car,
who to pick up and where to go, in one SMS.

Fleet Desk has no gateway of its own and no list of supported vendors. **Settings → SMS
gateway** is the HTTP request itself, so whatever your provider documents can be pasted
in: address, method, headers and body are templates, and four placeholders are filled
in before sending.

| Placeholder | What goes in |
|---|---|
| `{to}` | The driver's mobile, written as **Send numbers as** says |
| `{text}` | The message |
| `{sender}` | Your sender ID or masking name |
| `{apiKey}` | The account's key — stored apart from the settings and never returned by the API |

Three shapes, all real:

```
A key in the address (GET)
  Address  https://api.provider.com/sendsms?api_key={apiKey}&to={to}&msg={text}
  Request  GET

A JSON body with a bearer token (POST)
  Address  https://api.provider.com/v1/sms
  Request  POST
  Headers  Authorization: Bearer {apiKey}
  Body     {"from":"{sender}","to":"{to}","text":"{text}"}

Form data (POST)
  Address  https://api.provider.com/api/v2/send
  Request  POST
  Body     api_key={apiKey}&senderid={sender}&number={to}&message={text}
```

The content type is worked out from the body — JSON, XML or form data — unless a header
sets it. Values are escaped to match, so a destination written as `7 Gulshan "Pink City"`
cannot break the JSON and an `&` in a message cannot split a form field.

Two settings exist because gateways misbehave in predictable ways. **Send numbers as**
turns `01711-234567` into `01711234567` or `8801711234567`, since almost none of them
accept a number the way people write it here. **Counts as sent when the reply contains**
is for gateways that answer `200 OK` whatever happened: name a word their success reply
carries — often `SUCCESS` — and anything else is recorded as a failure with the
gateway's own words beside it.

**Send a test SMS** saves the page, sends one message, and reports back the request it
built with the key masked, along with whatever the gateway replied. That is usually
enough to settle an argument between a provider's documentation and its behaviour.

Texts go through the same outbox as email: stored first, retried by the same worker,
listed in the **Message log** with **Via** showing which channel each one went by.
Clearing the gateway address, or turning **Send driver texts** off, holds them in the
log without sending — nothing is lost, and **Send again** picks them up once a gateway
is in place.

## Driver leave

`drivers.status` says whether somebody is on the roster at all. It cannot say that
Jamal is away from the 14th to the 20th, so a trip on the 16th could be given to him in
good faith. **Daily records → Driver leave** is that calendar: a month at a glance, one
row per driver, one column per day, shaded where somebody is away and coloured by the
kind of leave — annual, sick, casual, unpaid, training or other.

Click any shaded day, or a row in the list below the grid, to change or delete that
spell. Two overlapping spells for the same driver are refused, in the browser and again
at the API, as is a spell that ends before it starts.

What it is for: **a driver on leave cannot be given a trip that day.** The approval
screen marks them in the dropdown (`· on annual leave`), explains the problem and
disables **Approve**, and the API refuses it too. The dashboard's *On leave* column now
means the calendar as well as the status flag, and says when each person is back.

## Papers and licences

A trip booked for next month needs papers that are valid next month. So when the team
lead approves a request, the car's **fitness certificate**, **tax token** and
**insurance**, and the driver's **licence**, are checked against the date of the trip
rather than against today. If any of them runs out before then, the approval is
refused and the message says which paper, whose, and when it lapsed.

On the review screen the same rule marks the dropdowns — `· tax token expired`,
`· fitness expires in 15 days` — so a car that cannot be used is obvious before it is
chosen, and **Approve** is disabled while the problem stands. Rejecting still works,
and anything expiring within 30 days of the trip is mentioned without blocking.

An expiry date falling on the day of the trip is still valid; that is the last day the
paper counts. A date left blank stops nobody — the dashboard is where missing and
ageing papers get chased. To clear a block, renew the paper and update the date on the
**Cars** or **Drivers** page.

### The reminder

Nobody has to open the dashboard for a tax token to be noticed. **Settings → Expiry
reminders** sets a standing email — once a week on a chosen day, or every day, at a
chosen time — listing what has already expired and what runs out within the next *N*
days (30 by default). It goes to the team lead, or to whatever addresses are listed
there, separated by commas.

Nothing is sent on a day when there is nothing to report, and only one digest goes out
per day however often the API restarts. **Send one now** saves the page and sends
today's digest to your own address, so you can see what it looks like — that counts as
the day's reminder. Retired cars and inactive drivers are left out; a driver on leave
is not, since they will be back.

The digest goes through the same outbox as everything else: it appears in the **Message
log** under *Expiry reminder*, with its delivery state, and a failed one is retried by
the same worker.

## Who changed what

Fuel loads, card limits and odometer readings are money and mileage, and until now a
corrected figure left no trace of who corrected it. Every change now writes a line to
an audit trail: who, when, which record, and the value on both sides of the change.

**Admin → Activity** (team lead only) shows it, filtered by period, by kind of record,
by what happened, or by person, and exports to CSV. Opening an entry shows every field
that moved, before and after.

It covers cars, drivers, payment cards, logbook entries, fuel loads and workshop
records; car requests through their whole life — submitted, approved, rejected,
cancelled — and accounts and settings, including role changes and password resets. A
password, a hash and a mail-server password are never written to it. The label of a
record is kept on the entry itself, so a car that was deleted last March still reads as
its registration number rather than an id.

The trail is append-only. There is no endpoint that changes or removes an entry, and
the table refuses `UPDATE` and `DELETE` outright — see `db/migrations/008_audit.sql`.
Reloading the sample data clears it along with everything else, which is why a fresh
demo database starts with an empty Activity page: nobody has changed anything yet.

Changes the machine makes on its own — the demo seeder, the retry worker, the expiry
reminder — have no person behind them and are not recorded. The message log already
shows what was sent.

## Everyday operations

```bash
# Reload the sample data from scratch (deletes everything else)
docker compose exec backend node src/seed.js --force

# End-to-end check of the API: CRUD, validation, roles, the approval workflow, reports
docker compose exec backend npm run smoke

# Back up and restore
docker compose exec -T db pg_dump -U fleetdesk fleetdesk | gzip > fleetdesk-$(date +%F).sql.gz
gunzip -c fleetdesk-2026-11-10.sql.gz | docker compose exec -T db psql -U fleetdesk -d fleetdesk

# Open a SQL prompt
docker compose exec db psql -U fleetdesk -d fleetdesk
```

`npm run smoke` creates records, checks the rules reject what they should, and deletes
what it can — it is safe against the demo database, and it leaves one driver and a few
requisitions behind (reload the sample data to clear them).

After changing anything under `frontend/` or `backend/src/`, rebuild:
`docker compose up -d --build`.

## Before real use

- **Accounts.** Set `SHOW_DEMO_ACCOUNTS=false`, create your own team lead with
  `ADMIN_EMAIL`, and delete or disable the three sample accounts under **People and
  access**. If you keep them, change `DEMO_PASSWORD` first.
- **Single sign-on (optional).** Set `AUTH_MODE=proxy` and put an authenticating proxy
  in front (oauth2-proxy, mod_auth_openidc, Keycloak) that sets `X-Forwarded-Email` and
  `X-Forwarded-Groups`. Fleet Desk then stops managing passwords and maps the groups in
  `ROLE_GROUP_LEAD` and `ROLE_GROUP_AGS` onto team lead and AGS staff, treating everyone
  else as an employee. Only do this where that proxy is the only route to the API: the
  headers are trusted completely. See `backend/src/auth.js`.
- **TLS.** Terminate it at the ingress in front of the frontend container, which
  speaks plain HTTP on 8080 and sets the security headers itself. Over HTTPS the
  session cookie is marked Secure automatically; `COOKIE_SECURE=true` forces it.
- **Password.** Change `POSTGRES_PASSWORD` before the first start (it is baked into the
  volume at initialisation) and keep `.env` out of version control.
- **SMS.** Fill in **Settings → SMS gateway** with your provider's request and send a
  test. Until a gateway is set, driver texts queue in the message log unsent.
- **Mail.** Point Fleet Desk at the company relay — **Settings → Mail server**, or
  `SMTP_HOST`/`SMTP_PORT` — and remove the `mail` service, which exists only to catch
  demo mail. See [Mail](#mail).
- **Card data.** Only the last four digits of a card are ever accepted or stored. The
  column has a check constraint to keep it that way.

## Project layout

Each tier owns a folder, and each folder holds everything that tier needs —
its source, its Dockerfile and its configuration.

```
docker-compose.yml            The four services: frontend, backend, db, mail
.env.example                  Ports, credentials, behaviour

frontend/                     Everything the browser is served
├── index.html                App shell
├── login.html                Sign-in page
├── assets/
│   ├── css/app.css           All styles
│   ├── fonts/                Barlow (SIL Open Font License)
│   └── js/
│       ├── app.js            Router, navigation, roles, who is signed in
│       ├── api.js            Data layer: the REST backend, or mock data in the browser
│       ├── calc.js           Overtime and running-km rules
│       ├── papers.js         Whether papers and licences are valid on a given day
│       ├── roster.js          Whether a driver is available on a given day
│       ├── email.js          Email templates (request, confirmation, rejection, cancellation)
│       ├── sms.js            SMS templates — one text each for a trip and a cancellation
│       ├── seed.js           Demo data and default settings
│       ├── ui.js             Tables, forms, modals, charts, toasts
│       ├── utils.js          Formatting and date helpers
│       ├── login.js          Sign-in page logic
│       └── views/            One file per page, 20 of them
├── Dockerfile                Nginx image (unprivileged, port 8080)
├── nginx.conf                Static files, security headers, /api/ proxy
└── entrypoint/               Sets the data mode from FLEETDESK_MODE

backend/                      The REST API
├── src/
│   ├── server.js             Express app and startup
│   ├── config.js             Everything that comes from the environment
│   ├── db.js                 PostgreSQL pool, and date and number parsing
│   ├── migrate.js            Applies db/migrations at startup
│   ├── schema.js             Field registry: columns, types, uniqueness
│   ├── store.js              Generic CRUD and the business rules
│   ├── errors.js             ApiError, and messages written for end users
│   ├── auth.js               Identity and role checks
│   ├── password.js           scrypt hashing and password rules
│   ├── sessions.js           Session store and cookie
│   ├── settings.js           The settings document, and the secrets kept apart from it
│   ├── mailer.js             Outbox, SMTP and SMS delivery, retries
│   ├── sms.js                The gateway request, built from the templates in Settings
│   ├── reminders.js          The standing expiry digest and its schedule
│   ├── audit.js              The audit trail: one row per change, append-only
│   ├── context.js            Carries who is calling, for the trail to name
│   ├── seed.js               Loads the sample fleet and the first account
│   ├── routes/               auth · users · me · settings · requisitions · reports · audit · collections
│   └── shared/               Generated copy of the frontend's shared modules, not in git
├── scripts/sync-shared.mjs   Copies those modules out of frontend/ at build time
├── test/smoke.js             End-to-end API test (npm run smoke)
├── package.json              start · seed · smoke · shared
└── Dockerfile                API image (Node 22)

db/migrations/                001 schema · 002 auth · 003 cancellation · 004 secrets · 005 maintenance · 006 sms · 007 reminders · 008 audit · 009 leave
docs/screenshots/             The images in this README
API_CONTRACT.md               What the backend provides
LICENSE                       MIT
```

Two of those deserve a note. `frontend/assets/js/{utils,calc,papers,roster,email,sms,seed}.js`
are the single definition of the templates, the overtime, papers and roster rules and the demo data: the
API image copies them into `backend/src/shared/` when it is built, so the two sides
cannot drift apart — edit them in `frontend/`, never in `backend/src/shared/`. And
`db/migrations/` is the only place the schema is described; the API applies whatever
is pending when it starts.

## Defaults you may want to change (Settings page)

- Shift 9:00 AM to 6:00 PM, 15-minute grace, overtime rounded down to 30 minutes
- Weekend Friday and Saturday, paid at 1.5×; weeks start Sunday
- Fuel prices: placeholders. Set them to the current government rates

## License

Fleet Desk is released under the [MIT License](LICENSE).

The bundled Barlow fonts are not covered by it. They are licensed separately under
the SIL Open Font License, included as `frontend/assets/fonts/OFL-LICENSE.txt`.
