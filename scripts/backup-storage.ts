// path: scripts/backup-storage.ts
// Run: npx tsx scripts/backup-storage.ts
import * as dotenv from "dotenv";
import { existsSync, promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Load .env.local ili .env
const root = process.cwd();
const envLocal = path.join(root, ".env.local");
if (existsSync(envLocal)) dotenv.config({ path: envLocal, override: true });
else if (existsSync(path.join(root, ".env"))) dotenv.config({ path: path.join(root, ".env"), override: true });

// ✅ Fallback na NEXT_PUBLIC_* ako SUPABASE_URL/SERVICE_ROLE nisu postavljeni
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||           // preporučeno
  process.env.SUPABASE_SERVICE_KEY ||                // alternativno ime
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";   // fallback (radi samo ako policy dozvoljava)

const BUCKET = process.env.BUCKET_NAME || "question-images";
const OUT_DIR = process.env.OUT_DIR || "storage-backup";

// Bolja poruka ako fali nešto
if (!SUPABASE_URL) {
  console.error("Greška: SUPABASE_URL nije setovan (ni NEXT_PUBLIC_SUPABASE_URL). Proveri .env.local/.env");
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error("Greška: SERVICE KEY nije setovan. Postavi SUPABASE_SERVICE_ROLE_KEY (ili bar NEXT_PUBLIC_SUPABASE_ANON_KEY za public bucket).");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

/** Rekurzivno listaj sve fajlove u bucket-u. */
async function listAll(prefix = "", acc: string[] = []): Promise<string[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw error;

  for (const item of data || []) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) acc.push(rel);
    else await listAll(rel, acc);
  }
  return acc;
}

async function main() {
  console.log(`Bucket: ${BUCKET}`);
  const files = await listAll();
  console.log(`Nađeno fajlova: ${files.length}. Preuzimam u: ${OUT_DIR}`);
  await fs.mkdir(OUT_DIR, { recursive: true });

  let ok = 0, fail = 0;
  for (const rel of files) {
    const { data, error } = await supabase.storage.from(BUCKET).download(rel);
    if (error) {
      console.error("FAIL", rel, error.message);
      fail++; continue;
    }
    const dst = path.join(OUT_DIR, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.writeFile(dst, Buffer.from(await data.arrayBuffer()));
    ok++;
    if (ok % 50 === 0) console.log(`...${ok}/${files.length}`);
  }
  console.log(`Gotovo. OK=${ok}, FAIL=${fail}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
