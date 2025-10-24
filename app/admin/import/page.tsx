// file: app/admin/import/page.tsx
"use client";
import { useState } from "react";
import AdminGuard from "@/components/AdminGuard";

type IncomingAnswer = { text: string; is_correct: boolean };
type IncomingQuestion = {
  area: string;
  subarea: string;
  points: number;
  text: string;
  imageDataUrl?: string | null; // optional base64 data URL
  answers: IncomingAnswer[];
};

export default function ImportPage() {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<IncomingQuestion[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function tryParse() {
    setErr(null); setOk(null);
    try {
      const j = JSON.parse(raw);
      if (!Array.isArray(j)) throw new Error("Očekivan je niz ([]) pitanja.");
      j.forEach((q, i) => {
        ["area","subarea","text","answers"].forEach(k => { if (!(k in q)) throw new Error(`Red #${i+1}: nedostaje ${k}`); });
        if (!Array.isArray(q.answers) || q.answers.length < 2) throw new Error(`Red #${i+1}: potrebna su bar 2 odgovora.`);
      });
      setParsed(j);
      setOk(`Pripremljeno za uvoz: ${j.length} pitanja.`);
    } catch (e: any) {
      setParsed(null);
      setErr(e?.message || "Nevažeći JSON.");
    }
  }

  async function doImport() {
    if (!parsed || parsed.length === 0) return;
    setErr(null); setOk(null); setBusy(true);
    try {
      const res = await fetch("/api/import/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: parsed })
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Greška pri uvozu.");
      setOk(`Uvezeno: ${j.ok} (preskočeno duplikata: ${j.skipped || 0})`);
    } catch (e: any) {
      setErr(e?.message || "Greška pri uvozu.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminGuard>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Import pitanja (bulk)</h1>
        <p className="text-sm text-gray-700">
          Nalepi JSON (niz objekata): {"{ area, subarea, points, text, imageDataUrl?, answers:[{text,is_correct}] }"}.
        </p>

        <textarea
          className="w-full border rounded p-2 font-mono text-sm min-h-[200px]"
          placeholder='[{"area":"Propisi","subarea":"Krivine","points":2,"text":"...","imageDataUrl":"data:image/jpeg;base64,...","answers":[{"text":"...","is_correct":true}]}]'
          value={raw}
          onChange={(e)=>setRaw(e.target.value)}
        />

        <div className="flex gap-2">
          <button className="border rounded px-3 py-1" onClick={tryParse}>Proveri JSON</button>
          <button className="bg-black text-white rounded px-3 py-1" onClick={doImport} disabled={!parsed || busy}>
            {busy ? "Uvoz..." : "Uvezi"}
          </button>
        </div>

        {err && <p className="text-red-600 text-sm">{err}</p>}
        {ok && <p className="text-green-600 text-sm">{ok}</p>}

        {parsed && (
          <div className="bg-white rounded shadow p-3">
            <div className="text-sm text-gray-700 mb-2">Pregled ({parsed.length}):</div>
            <ul className="space-y-2 max-h-80 overflow-auto">
              {parsed.map((q, i) => (
                <li key={i} className="border rounded p-2">
                  <div className="text-sm">
                    <span className="font-medium">{q.area} / {q.subarea}</span> • bodovi: {q.points ?? 1}
                  </div>
                  <div className="font-medium">{q.text}</div>
                  {q.imageDataUrl && <div className="mt-2">
                    <img src={q.imageDataUrl} alt="slika" className="w-64 h-40 object-contain border rounded" />
                  </div>}
                  <ul className="mt-2 text-sm list-disc list-inside">
                    {q.answers.map((a, j) => (
                      <li key={j} className={a.is_correct ? "text-green-700" : ""}>
                        {a.text} {a.is_correct ? "(tačan)" : ""}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
