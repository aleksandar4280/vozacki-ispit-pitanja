// file: app/api/import/questions/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type IncomingAnswer = { text: string; is_correct: boolean };
type IncomingQuestion = {
  area: string;
  subarea: string;
  points?: number;
  text: string;
  imageDataUrl?: string | null;
  answers: IncomingAnswer[];
};

const BUCKET = "question-images";

function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer; ext: string } {
  const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error("Nevažeći imageDataUrl");
  const mime = m[1];
  const b64 = m[2];
  const buffer = Buffer.from(b64, "base64");
  const ext = mime.includes("png") ? ".png" : mime.includes("webp") ? ".webp" : ".jpg";
  return { mime, buffer, ext };
}

function safeName(name: string) {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_.-]/g, "");
}

// — Normalizacija + validacija odgovora —
function normalizeAnswerText(raw: unknown): string {
  const s = String(raw ?? "")
    .replace(/\r/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^objašn?[šs]n?ј?e/i.test(s)) return "";
  return s;
}
function normalizeAnswers(inAnswers: IncomingAnswer[]) {
  const seen = new Map<string, { text: string; is_correct: boolean }>();
  for (const a of inAnswers || []) {
    const text = normalizeAnswerText(a.text);
    if (!text) continue; // odbaci prazne
    if (!seen.has(text)) {
      seen.set(text, { text, is_correct: !!a.is_correct });
    } else if (a.is_correct) {
      seen.get(text)!.is_correct = true;
    }
  }
  const out = Array.from(seen.values());
  if (out.length < 2) throw new Error("Pitanje mora imati najmanje 2 odgovora.");
  if (!out.some(x => x.is_correct)) throw new Error("Bar jedan odgovor mora biti tačan.");
  return out;
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items = body?.items as IncomingQuestion[] | undefined;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Empty payload" }, { status: 400 });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !serviceKey) throw new Error("Missing Supabase env");

    const supa = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    let ok = 0;
    const errors: Array<{ index: number; message: string; text?: string }> = [];

    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      try {
        const areaName = (item.area || "").trim();
        const subName = (item.subarea || "").trim();
        const qText = (item.text || "").trim();
        const points = Number.isFinite(item.points as any) ? Number(item.points) : 1;

        if (!areaName || !subName || !qText) throw new Error("Nedostaju area/subarea/text.");

        const answers = normalizeAnswers(item.answers);

        // Upsert area
        let { data: area } = await supa.from("areas").select("id").eq("name", areaName).maybeSingle();
        if (!area) {
          const ins = await supa.from("areas").insert({ name: areaName }).select("id").single();
          if (ins.error) throw ins.error; area = ins.data;
        }
        // Upsert subarea
        let { data: sub } = await supa.from("subareas").select("id").eq("area_id", area.id).eq("name", subName).maybeSingle();
        if (!sub) {
          const ins = await supa.from("subareas").insert({ area_id: area.id, name: subName }).select("id").single();
          if (ins.error) throw ins.error; sub = ins.data;
        }

        // Upload slike (ako postoji)
        let image_url: string | null = null;
        if (item.imageDataUrl) {
          const { mime, buffer, ext } = parseDataUrl(item.imageDataUrl);
          const fileName = `${Date.now()}-${safeName(qText.slice(0, 40))}${ext}`;
          const up = await supa.storage.from(BUCKET).upload(fileName, buffer, { contentType: mime, upsert: false });
          if (up.error) throw up.error;
          const { data } = supa.storage.from(BUCKET).getPublicUrl(fileName);
          image_url = data.publicUrl;
        }

        // **UVEK** insert question (bez provere duplikata)
        const insQ = await supa.from("questions").insert({
          area_id: area.id,
          subarea_id: sub.id,
          text: qText,
          image_url,
          points,
          multi_correct: answers.filter(a => a.is_correct).length > 1
        }).select("id").single();
        if (insQ.error) throw insQ.error;

        // Insert answers
        const rows = answers.map(a => ({ question_id: insQ.data.id, text: a.text, is_correct: a.is_correct }));
        const insA = await supa.from("answers").insert(rows);
        if (insA.error) throw insA.error;

        ok++;
      } catch (e: any) {
        errors.push({ index: idx, message: e?.message || String(e), text: items[idx]?.text?.slice(0, 120) });
      }
    }

    return NextResponse.json({ ok, errors }, {
      status: errors.length > 0 && ok === 0 ? 400 : 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}
