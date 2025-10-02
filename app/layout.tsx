import "./globals.css";
import Link from "next/link";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <header className="border-b bg-white">
          <nav className="container mx-auto max-w-4xl px-4 flex items-center justify-between py-3">
            <Link href="/" className="font-semibold">Baza Ispitnih Pitanja</Link>
            <div className="flex gap-4 text-sm">
              <Link href="/pregled">Pregled</Link>
              <Link href="/admin/areas">Admin: Oblasti</Link>
              <Link href="/admin/subareas">Admin: Podoblasti</Link>
              <Link href="/admin/questions/new">Admin: Novo pitanje</Link>
              <Link href="/login">Prijava</Link>
            </div>
          </nav>
        </header>
        <main className="container mx-auto max-w-4xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
