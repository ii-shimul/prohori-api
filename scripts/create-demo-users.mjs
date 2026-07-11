import pg from 'pg';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');

const envContent = readFileSync(envPath, 'utf8');
const directUrlMatch = envContent.match(/^DIRECT_URL=(.+)$/m);
const directUrl = directUrlMatch?.[1];

if (!directUrl) {
  console.error('DIRECT_URL not found in .env');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: directUrl });

const users = [
  ['40000000-0000-4000-8000-000000000001', 'agent.a@prohori.test', 'Agent A'],
  ['40000000-0000-4000-8000-000000000002', 'operations.a@prohori.test', 'Operations A'],
  ['40000000-0000-4000-8000-000000000003', 'operations.b@prohori.test', 'Operations B'],
  ['40000000-0000-4000-8000-000000000004', 'data.steward.c@prohori.test', 'Data Steward C'],
  ['40000000-0000-4000-8000-000000000005', 'validation.auditor@prohori.test', 'Validation Auditor'],
  ['40000000-0000-4000-8000-000000000006', 'demo.admin@prohori.test', 'Demo Administrator'],
  ['40000000-0000-4000-8000-000000000007', 'platform.management@prohori.test', 'Platform Management'],
];

const PASSWORD = 'prohori-demo-2026';

async function main() {
  const client = await pool.connect();
  try {
    for (const [id, email, displayName] of users) {
      const existing = await client.query('SELECT 1 FROM auth.users WHERE id = $1', [id]);
      if (existing.rows.length > 0) {
        console.log(`User ${email} already exists, skipping`);
        continue;
      }

      await client.query(`
        INSERT INTO auth.users (
          id, instance_id, email, encrypted_password,
          email_confirmed_at, confirmation_sent_at,
          raw_app_meta_data, raw_user_meta_data,
          created_at, updated_at, role, aud,
          confirmation_token, is_super_admin
        ) VALUES (
          $1, '00000000-0000-0000-0000-000000000000', $2,
          crypt($3, gen_salt('bf')),
          now(), now(),
          '{"provider":"email","providers":["email"]}',
          jsonb_build_object('display_name', $4),
          now(), now(),
          'authenticated', 'authenticated', '', false
        )
      `, [id, email, PASSWORD, displayName]);

      await client.query(`
        INSERT INTO auth.identities (
          id, user_id, identity_data, provider,
          last_sign_in_at, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1,
          jsonb_build_object('sub', $1::text, 'email', $2, 'email_verified', true),
          'email', now(), now(), now()
        )
      `, [id, email]);

      console.log(`Created user: ${email} / ${displayName}`);
    }
    console.log('\nAll users created. Password for all: prohori-demo-2026');
    console.log('Emails:');
    for (const [, email] of users) {
      console.log(`  ${email}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
