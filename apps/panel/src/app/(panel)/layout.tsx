import Link from "next/link";
import { requireSession } from "@/lib/session";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/segments", label: "Segmentler" },
  { href: "/customers", label: "Müşteriler" },
  { href: "/orders", label: "Siparişler" },
  { href: "/campaigns", label: "Kampanyalar" },
  { href: "/templates", label: "Şablonlar" },
  { href: "/messages", label: "Mesajlar" },
  { href: "/consents", label: "İzinler" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
          <span className="font-semibold text-emerald-700">WhatsApp CRM</span>
          <nav className="flex flex-1 gap-4 text-sm">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="text-slate-600 hover:text-slate-900">
                {item.label}
              </Link>
            ))}
          </nav>
          <form action={logoutAction}>
            <button className="text-sm text-slate-500 hover:text-slate-900">Çıkış</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
