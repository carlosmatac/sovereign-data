import { createClient } from '@supabase/supabase-js';

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpcmdhcmZqcWJ5bXpxcGdxamdoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDg5NjczMywiZXhwIjoyMDg2NDcyNzMzfQ.p6YZwXbBirhSlIYQXFddovboN01TgfgejSYAWerOXL8';

const client = createClient(
  'https://pirgarfjqbymzqpgqjgh.supabase.co',
  SERVICE_ROLE_KEY
);

async function main() {
  // 1) Check source_entities.context
  const { error: ctxErr } = await client
    .from('source_entities')
    .select('context')
    .limit(1);
  console.log('source_entities.context:', ctxErr ? '❌ MISSING => ' + ctxErr.message : '✅ EXISTS');

  // 2) Check entities.metadata
  const { error: metaErr } = await client
    .from('entities')
    .select('metadata')
    .limit(1);
  console.log('entities.metadata:      ', metaErr ? '❌ MISSING => ' + metaErr.message : '✅ EXISTS');

  // 3) Applied migrations
  const { data: migs, error: migErr } = await (client as any)
    .schema('supabase_migrations')
    .from('schema_migrations')
    .select('version')
    .order('version');

  if (migErr) {
    console.log('\n⚠️  Cannot read migration table:', migErr.message);
  } else {
    const applied = (migs ?? []).map((r: { version: string }) => r.version);
    console.log('\nApplied migrations (' + applied.length + '):');
    applied.forEach((v: string) => console.log('  ' + v));
  }
}

main().catch(console.error);
