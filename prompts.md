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
