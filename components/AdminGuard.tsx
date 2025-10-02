"use client";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { useEffect, useState } from "react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getSession().then(({ data }) => setOk(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setOk(!!session));
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  if (ok === null) return <p>Provera...</p>;
  if (!ok) return <p className="text-red-600">Niste prijavljeni. Idite na “Prijava”.</p>;
  return <>{children}</>;
}
