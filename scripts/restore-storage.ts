// path: scripts/restore-storage.ts
// Run: npx tsx scripts/restore-storage.ts
import * as dotenv from "dotenv";
import { existsSync, promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const envLocal = path.join(root, ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal, override: true });
else if (existsSync(path.join(root, ".env"))) dotenv.config({ path: path.join(root, ".env"), override: true });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const BUCKET = process.env.BUCKET_NAME || "question-images";
const SRC_DIR = process.env.OUT_DIR || "storage-backup"; // folder iz koga vraćaš

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Nedostaje SUPABASE_URL ili SERVICE ROLE KEY."); process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function walk(dir: string, acc: string[] = []) {
  const items = await fs.readdir(dir, { withFileTypes: true });
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) await walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

async function main() {
  const files = await walk(SRC_DIR);
  console.log(`Upload ${files.length} fajlova u bucket "${BUCKET}"...`);
  let ok = 0, fail = 0;
  for (const abs of files) {
    const rel = path.relative(SRC_DIR, abs).replace(/\\/g, "/");
    const buf = await fs.readFile(abs);
    const { error } = await supabase.storage.from(BUCKET).upload(rel, buf, { upsert: true });
    if (error) { console.error("FAIL", rel, error.message); fail++; }
    else ok++;
    if ((ok + fail) % 50 === 0) console.log(`...${ok + fail}/${files.length}`);
  }
  console.log(`Gotovo. OK=${ok}, FAIL=${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
