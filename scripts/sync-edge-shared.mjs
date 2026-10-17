// Sao chép các module dùng chung từ js/ sang supabase/functions/_shared/ để Edge Function import.
// Chạy: npm run sync:edge. CI kiểm git diff của _shared sau khi đồng bộ.
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SHARED = ['sha256.js', 'policy-engine.js', 'policy-data.js', 'policy-ledger.js', 'semantic-discovery.js',
  'policy-prover.js', 'policy-workflow.js', 'policy-authz.js', 'policy-server.js', 'openai-mapping.js',
  'doc-history.js', 'legal-refs.js', 'legal-page.js', 'legal-fetch.js', 'legal-discovery.js', 'legal-status.js', 'legal-research.js'];

for (const file of SHARED) {
  copyFileSync(join(root, 'js', file), join(root, 'supabase', 'functions', '_shared', file));
}
console.log('Đã đồng bộ ' + SHARED.length + ' module sang supabase/functions/_shared/');
if (process.argv.includes('--check')) {
  for (const file of SHARED) readFileSync(join(root, 'supabase', 'functions', '_shared', file));
}
