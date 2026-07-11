Commit 1:

complete the step 1 from plan.md
work only in prohori-api
this is basic nestjs project now, make the backend foundation ready
use fastify instead of express
add env validation, .env.example, api prefix, health endpoint, error format, correlation id and openapi file
update readme and npm scripts
remove default hello world files if not needed
keep it only step 1, dont add database, supabase, auth, provider features or payments yet
test everything before finish

Commit 2:

set up supabase schema, migrations, seed data, prisma models and provider/area/outlet endpoints
keep endpoints protected until auth step is ready


Commit 3:

set up supabase auth properly, validate jwt, add rls and make `/me` endpoint work
make sure provider data stays isolated, provider A should never see provider B data
keep it secure, dont trust provider id from request body

update env example/readme if new auth config is needed
test auth errors, invalid token and provider isolation before finish

Commit 4:

add liquidity/feed tables and correct cash-in/cash-out balance rules
shared cash and provider e-money must always stay separate
test pending, failed, reversed and duplicate cases too

after balance rules work, add prisma models and normal synthetic seed balances/transactions too
make sure the same seed always gives same starting data
keep this step only about liquidity data and balance semantics, dont add simulation or analytics yet
test everything before finish

Commit 5:

build provider feed ingestion properly, provider key should decide provider not request body
validate batches, checksum, sequence, duplicate events and bad data
add deterministic scenario controls for A to D, only demo admin can run them
make sure bad feed data creates visible quality issue and never silently changes old data
test every ingestion and simulation path before finish

Commit 6:

build deterministic liquidity forecast for shared cash and each provider e-money separately
show 30 minute to 4 hour forecast, risk, confidence and reserve eta
if data is stale or conflicting, show degraded/unreliable and hide exact eta
add scoped outlet health, balance, forecast and transaction APIs
make sure provider balances never become one combined usable balance
test normal, surge, low balance, stale and conflict cases before finish

Commit 7:

build unusual activity checks for repeated amounts and abnormal transaction velocity
show clear evidence, baseline, threshold, score, time window and possible normal reason
keep it review only, never call anything fraud
correlate it with liquidity pressure only when both rules match, dont say correlation means cause
add Scenario B tests and scoped anomaly/data-quality APIs
test normal and bad cases before finish

Commit 8:

turn forecast and anomaly signals into provider-aware alerts
route alert only to right provider/outlet people, never leak another provider data
add alert evidence, safe next step, localization key, owner/recipient and stable deduplication
build alert list/detail, acknowledge, assign and create-case APIs with idempotency
no transfer/refill/funds action wording or behavior
test routing, redaction, duplicate alert and unauthorized requests before finish

Commit 9:

move to the next step
build full case workflow from alert to closed case
add assign, acknowledge, note, verification, escalate, review, resolve, close and reopen
keep every action versioned and idempotent, write case event and audit event together
make timeline append-only and provider scoped
never let case or alert action touch transaction or balance data
test lifecycle, invalid transition, cross-provider access, duplicate command and audit trail before finish

Commit 10:

finish every client API still missing, especially feed health, data quality and management readiness
make filters/pagination scoped and validated
make catalog routes use real jwt/rls now, no temporary placeholder
freeze openapi contract at 1.0.0 with examples, errors, auth and scope behavior
update env/readme/reset/scenario docs so web and mobile can integrate without guessing
test every documented route and unauthorized access before finish

Commit 11:

make final security and scenario gates we can run from clean reset
prove provider A cannot access provider B with guessed ids, filters or mutations
prove no public workflow endpoint can touch transaction or balance ledger
run deterministic Scenario A to D checks, including full case lifecycle and audit timeline
add scripts and readme commands so final demo validation is repeatable
test everything possible before finish
make backend ready for web and mobile integration, but do not change frozen 1.0.0 contract unless there is real blocker
add clear client setup, CORS config and clean-reset rehearsal instructions
add final freeze checks without named web/mobile/provider token env vars
run all backend validation, document only Docker/local Supabase requirement
after this, freeze features and only fix integration/security/demo blockers
