// Every knob comes from the environment so the same image runs in dev and production.
const bool = (v, dflt = false) => (v === undefined || v === '' ? dflt : /^(1|true|yes|on)$/i.test(v));
const int = (v, dflt) => (Number.isFinite(Number(v)) && v !== '' && v !== undefined ? Number(v) : dflt);

export const config = {
  port: int(process.env.PORT, 8080),
  basePath: process.env.API_BASE_PATH || '/api/v1',
  databaseUrl: process.env.DATABASE_URL || 'postgres://fleetdesk:fleetdesk@db:5432/fleetdesk',

  auth: {
    // 'password' — Fleet Desk's own sign-in page and session cookie (the default).
    // 'proxy'    — an authenticating proxy in front sets the identity headers below,
    //              and Fleet Desk trusts them. Nothing else accepts that header.
    mode: (process.env.AUTH_MODE || 'password').toLowerCase(),
    cookieName: process.env.SESSION_COOKIE || 'fleetdesk_session',
    // 'auto' marks the cookie Secure whenever the request arrived over HTTPS.
    cookieSecure: /^(true|false)$/i.test(process.env.COOKIE_SECURE || '') ? bool(process.env.COOKIE_SECURE) : 'auto',
    sessionHours: int(process.env.SESSION_HOURS, 12),
    absoluteDays: int(process.env.SESSION_MAX_DAYS, 7),
    maxFailures: int(process.env.LOGIN_MAX_FAILURES, 8),
    lockoutMinutes: int(process.env.LOGIN_LOCKOUT_MINUTES, 15),
    headerEmail: process.env.AUTH_HEADER_EMAIL || 'x-forwarded-email',
    headerGroups: process.env.AUTH_HEADER_GROUPS || 'x-forwarded-groups',
    groupLead: process.env.ROLE_GROUP_LEAD || 'fleet-lead',
    groupAgs: process.env.ROLE_GROUP_AGS || 'fleet-ags',
  },

  seedDemoData: bool(process.env.SEED_DEMO_DATA, false),
  // The password the sample accounts are seeded with, and whether the sign-in page
  // may name them. Both are demo conveniences — turn the hint off for real use.
  demoPassword: process.env.DEMO_PASSWORD || 'FleetDesk-2026',
  showDemoAccounts: bool(process.env.SHOW_DEMO_ACCOUNTS, bool(process.env.SEED_DEMO_DATA, false)),

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: int(process.env.SMTP_PORT, 25),
    secure: bool(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    retrySeconds: int(process.env.MAIL_RETRY_SECONDS, 300),
    maxAttempts: int(process.env.MAIL_MAX_ATTEMPTS, 5),
  },
};
