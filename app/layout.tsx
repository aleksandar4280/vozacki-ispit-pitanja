// file: app/layout.tsx
'use client'

import './globals.css'
import Link from 'next/link'
import { useState } from 'react'
import {
  LogIn,
  FileText,
  Plus,
  AlertCircle,
  Users,
  UserPlus,
  ClipboardList,
  Copy,
  FileCheck,
  Calendar,
  BookOpen,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <html lang="sr">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside
            className={`bg-slate-900 text-white flex flex-col fixed h-screen transition-all duration-300 ${
              sidebarOpen ? 'w-64' : 'w-0'
            }`}
            style={{ overflow: sidebarOpen ? 'visible' : 'hidden' }}
          >
            {/* Logo/Naziv + Toggle button */}
            <div className="p-6 border-b border-slate-700 flex items-center justify-between">
              {sidebarOpen && (
                <Link
                  href="/"
                  className="text-xl font-bold text-white hover:text-slate-200 transition-colors"
                >
                  Baza Ispitnih Pitanja
                </Link>
              )}
            </div>

            {/* Navigation */}
            {sidebarOpen && (
              <nav className="flex-1 overflow-y-auto p-4 space-y-6">
                {/* PRIJAVA */}
                <div>
                  <Link
                    href="/login"
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-200 hover:text-white"
                  >
                    <LogIn size={20} />
                    <span className="font-medium">Prijava</span>
                  </Link>
                </div>

                {/* PITANJA */}
                <div>
                  <div className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Pitanja
                  </div>
                  <div className="space-y-1">
                    <Link
                      href="/pregled"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <FileText size={18} />
                      <span>Pregled pitanja</span>
                    </Link>
                    <Link
                      href="/admin/questions/new"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <Plus size={18} />
                      <span>Novo pitanje</span>
                    </Link>
                    <Link
                      href="/pogresna"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <AlertCircle size={18} />
                      <span>Pogrešno odgovorena</span>
                    </Link>
                  </div>
                </div>

                {/* KANDIDATI */}
                <div>
                  <div className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Kandidati
                  </div>
                  <div className="space-y-1">
                    <Link
                      href="/admin/candidates"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <Users size={18} />
                      <span>Lista kandidata</span>
                    </Link>
                    <Link
                      href="/admin/candidates/new"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <UserPlus size={18} />
                      <span>Novi kandidat</span>
                    </Link>
                  </div>
                </div>

                {/* SIMULACIJE */}
                <div>
                  <div className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Simulacije
                  </div>
                  <div className="space-y-1">
                    <Link
                      href="/simulacije"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <ClipboardList size={18} />
                      <span>Simulacije</span>
                    </Link>
                    <Link
                      href="/duplikati-simulacije"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <Copy size={18} />
                      <span>Duplikati</span>
                    </Link>
                    <Link
                      href="/provera-simulacija"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <FileCheck size={18} />
                      <span>Simulacija - Realan ispit</span>
                    </Link>
                  </div>
                </div>

                {/* TEORIJSKA OBUKA */}
                <div>
                  <div className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Teorijska obuka
                  </div>
                  <div className="space-y-1">
                    <Link
                      href="/admin/raspored"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <Calendar size={18} />
                      <span>Raspored</span>
                    </Link>
                    <Link
                      href="/admin/dnevnik"
                      className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800 transition-colors text-slate-300 hover:text-white"
                    >
                      <BookOpen size={18} />
                      <span>Dnevnik TO</span>
                    </Link>
                  </div>
                </div>
              </nav>
            )}

            {/* Footer */}
            {sidebarOpen && (
              <div className="p-4 border-t border-slate-700 text-xs text-slate-400">
                © 2026 Autoškola
              </div>
            )}
          </aside>

          {/* Toggle Button - fiksiran na ivici sidebar-a */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`fixed top-4 z-50 bg-slate-900 text-white p-2 rounded-lg shadow-lg hover:bg-slate-800 transition-all duration-300 ${
              sidebarOpen ? 'left-[260px]' : 'left-2'
            }`}
          >
            {sidebarOpen ? (
              <ChevronLeft size={20} />
            ) : (
              <ChevronRight size={20} />
            )}
          </button>

          {/* Main Content */}
          <div
            className={`flex-1 transition-all duration-300 ${
              sidebarOpen ? 'ml-64' : 'ml-0'
            }`}
          >
            <main className="p-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}
