import Image from "next/image";
import Link from "next/link";

export default function WorkspaceHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--workspace-border)] bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/workspace/sales"
          className="inline-flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-focus)] focus-visible:ring-offset-2"
        >
          <Image
            src="/brand/nameless/nameless-logo-black.png"
            alt="Nameless Genetics"
            width={192}
            height={48}
            priority
            className="h-auto w-[150px] object-contain sm:w-[180px]"
          />
          <span className="hidden border-l border-[var(--workspace-border)] pl-3 text-xs font-medium text-[var(--workspace-muted)] sm:inline">
            Retail Sales CRM
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/workspace/customers/new"
            className="hidden min-h-10 items-center rounded-lg bg-[var(--workspace-primary)] px-4 text-sm font-semibold text-white transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-focus)] focus-visible:ring-offset-2 sm:inline-flex"
          >
            Add Retail Shop
          </Link>
          <form action="/auth/logout" method="post">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center rounded-lg border border-[var(--workspace-border-strong)] bg-white px-3 text-sm font-semibold text-[var(--workspace-text)] transition hover:bg-[var(--workspace-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--workspace-focus)] focus-visible:ring-offset-2"
            >
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
