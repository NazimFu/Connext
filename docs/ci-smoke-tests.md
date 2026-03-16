# CI smoke tests (scheduling/token/cancellation)

This repo includes a fast smoke test that validates core scheduling flows without needing any DB schema changes.

## What it covers

- Create a meeting request (token deducted)
- Mentor can see the request
- Mentor accepts the request (status updated for both sides)
- Mentee cancels (requires admin approval, no immediate refund)
- Admin approves cancellation (token refunded, cancellation marked approved)

## Requirements

The smoke test uses Cosmos DB (a dedicated database is recommended).

Required env vars:

- `COSMOS_DB_ENDPOINT`
- `COSMOS_DB_KEY`
- `COSMOS_DB_DATABASE` (recommended: a CI-only database name, e.g. `demoDB_ci`)

Note: the smoke script will also use `COSMOS_DB_*_CI` (or `SMOKE_COSMOS_DB_*`) if present, and will pass the selected values into the dev server it starts. `COSMOS_DB_ENDPOINT` may be a normal endpoint URL or a Cosmos connection string (`AccountEndpoint=...;AccountKey=...;`).

The script expects containers named `mentor` and `mentee` to exist inside `COSMOS_DB_DATABASE` (it does not create them, to avoid Cosmos throughput-limit issues).

## Run locally

1. Ensure your `.env.local` contains the Cosmos variables above (or export them in your shell).
2. Run:
   - `npm ci`
   - `npm run test:smoke`

Tips:

- `.env.local` should use `KEY=value` (no spaces around `=`). If you write `KEY = value`, some tools will treat that as a different variable name.
- By default the script refuses to run if `COSMOS_DB_DATABASE` doesn't look like a test DB (doesn't contain `ci` or `test`). To override: `SMOKE_ALLOW_ANY_DB=1 npm run test:smoke`
- By default the script will not run if a dev server is already running at `SMOKE_BASE_URL` (safety). Stop it first, or explicitly opt in: `SMOKE_START_SERVER=0 npm run test:smoke` (only if you're sure the server is using the CI/test DB).
- By default the script picks a random free port for the dev server. To force a port, set `SMOKE_PORT=9002` (or set `SMOKE_BASE_URL=http://127.0.0.1:9002`).
- If Next dev runs out of memory locally, set `SMOKE_NODE_OPTIONS=--max-old-space-size=4096` (or any size your machine can handle).
- The script creates temporary docs with IDs prefixed by `ci-mentor-` and `ci-mentee-` and deletes them after.

## GitHub Actions

The workflow expects repository secrets (CI-only):

- `COSMOS_DB_ENDPOINT_CI`
- `COSMOS_DB_KEY_CI`
- `COSMOS_DB_DATABASE_CI` (recommended: a CI-only database name, e.g. `demoDB_ci`)

If these secrets aren't set, the smoke job will be skipped.
