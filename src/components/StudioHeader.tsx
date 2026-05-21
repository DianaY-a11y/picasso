import Link from "next/link";

export function StudioHeader() {
  return (
    <header className="w-full max-w-5xl mx-auto px-8 pt-10 pb-6">
      <div className="flex items-baseline justify-between">
        <Link href="/" className="block group" aria-label="picasso, home">
          <div className="display text-[1.05rem] tracking-[0.42em] text-ink select-none">
            P I C A S S O
          </div>
          <div className="display-italic text-muted text-[0.85rem] mt-1 ml-[2px]">
            making what you think
          </div>
        </Link>
        <nav className="flex items-center gap-6 text-[0.78rem]">
          <Link href="/upload" className="btn-ghost">
            new piece &nbsp;⊕
          </Link>
        </nav>
      </div>
      <div className="rule mt-8" />
    </header>
  );
}
