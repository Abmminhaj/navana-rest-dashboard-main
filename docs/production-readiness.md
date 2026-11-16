# Navana demo and production operations

## Before staff switch to real guest records

- **Hosting:** The Vercel deployment is for the non-commercial demo. Move
  business use to a plan that permits it. Vercel Hobby is restricted to
  personal, non-commercial use. Cloudflare Workers Free is an alternative to
  evaluate on its request and CPU quotas. Both target builds are covered by CI.
  Local builds do not validate the Workers runtime limits or an account's
  settings. Test the staff login, booking, checkout and reports on the new
  URL before switching staff over.
- **Staff accounts:** Only approved staff can use the database. Keep public
  and anonymous signup disabled in Supabase. Create confirmed Auth users
  through **Authentication → Users**. For a mobile number fill the **Users &
  Roles** form with that number to see the matching synthetic login email.
  Create the Auth account with that email, a unique password, and auto confirm,
  then save the staff profile with its permitted pages. Login uses the mobile
  number and the Supabase Auth password. Manage password changes through
  Supabase Auth. Use separate accounts so access can be revoked individually.
- **Access:** Grant each staff member only the pages they need. Booking,
  checkout, dashboard and reports read overlapping operational records.
  Grant dashboard and report access only to staff who may see those records.
  Staff administration and hotel settings changes require an admin.
- **Recovery:** Verify a complete SQL restore in an isolated compatible
  database before relying on the live system. Keep encrypted backups and the
  key in separate secure locations. Move automated backups to a private
  GitHub repository before entering real guest details. The current artifact
  contains ciphertext and aggregate metadata in a public repository. See
  [database backups](database-backups.md).
- **Guest data:** Agree on what identification details are required and how
  long the hotel needs them. NID and customer photos are stored in database
  fields. Limit image capture to the hotel's documented needs. Monitor
  Supabase database size and egress as bookings grow. A move to a private
  object bucket needs separate object backups and a migration of existing
  photos.

## Free tier limits

Supabase Free includes 500 MB of database capacity and 5 GB of uncached
egress. It can pause a project after a week with too little activity and
does not include automatic database backups. Keep owner email alerts enabled
and inspect usage regularly. If dependable uptime or full managed recovery
becomes necessary, reassess the plan before reaching a limit.

- [Vercel plan rules](https://vercel.com/docs/limits/fair-use-guidelines)
- [Supabase free limits](https://supabase.com/pricing)
- [Supabase inactivity rules](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Cloudflare Workers quotas](https://developers.cloudflare.com/workers/platform/pricing/)

## Build and deploy

Use Node 24 and run `npm ci`. Copy `.env.example` to `.env.local` for local
development. Supply only the Supabase project URL and publishable key
(or legacy anon key) to the frontend. Keep database URLs and service keys
outside Vite build variables. The database backup workflow reads its own
`SUPABASE_DB_URL` GitHub secret.

Use the deployment provider's repository integration to build on pushes to
the release branch. For a manual Cloudflare Workers build, set
`NITRO_PRESET=cloudflare-module` and run `npm run build`. Nitro creates
`.output/server/wrangler.json` and `.wrangler/deploy/config.json`. Configure
the Cloudflare account, Worker name and build environment before the first
deploy. The demo's Vercel deployment uses its existing Git integration.

GitHub CI runs a locked dependency install, a vulnerability check, TypeScript,
both provider builds with test configuration, and the backup tests. Keep
`package-lock.json` and `bun.lock` synchronized when changing dependencies.
Review upgrades before merging, especially changes to TanStack, Supabase and
Nitro. The latest dependency audit found one development-only moderate
`minimatch` advisory under ESLint. Revisit after its parent dependency supports
a patched version.

## Database schema

The `supabase/migrations/` directory records changes against the existing
Navana schema. The access migrations link existing staff to confirmed Supabase
Auth accounts, protect credential functions, hash the room confirmation
password, and enforce page permissions through RLS. Test migrations on a
compatible restored copy before reusing them for another database. On the
current project the access migrations were applied through the Supabase SQL
Editor.

Apply the legacy login revocation only after the Auth-based client is deployed
and an administrator has verified access. Old browser tabs should reload after
this change.
