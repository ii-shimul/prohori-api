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
