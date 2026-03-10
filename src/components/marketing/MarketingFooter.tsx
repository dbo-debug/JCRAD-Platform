import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/copack", label: "Copack" },
  { href: "/wholesale", label: "Wholesale" },
  { href: "/compliance", label: "Compliance" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export default function MarketingFooter() {
  return (
    <footer className="border-t border-[#d9e7ee] bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-[#4a6575]">JC RAD Inc. Wholesale and Copack platform.</p>
          <nav className="flex flex-wrap gap-4">
            {FOOTER_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className="text-sm text-[#3d5a6a] transition hover:text-[#0f766e]">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
