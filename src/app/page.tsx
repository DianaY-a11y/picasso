import { StudioHeader } from "@/components/StudioHeader";
import { StickerGrid } from "@/components/StickerGrid";
import { CompositionsRow } from "@/components/CompositionsRow";

export default function Home() {
  return (
    <div className="min-h-screen">
      <StudioHeader />

      <main className="w-full max-w-5xl mx-auto px-8 pb-24">
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h1 className="display-italic text-[2.6rem] leading-none text-ink">
              your studio
            </h1>
            <div className="hidden sm:block max-w-md text-right text-[0.82rem] text-muted leading-relaxed">
              Picasso once said: &ldquo;I paint objects as I think them, not as I see them.&rdquo; This reflects a deeper
              idea that existence precedes essence, meaning we create our own meaning and identity.
              This studio is a small place for making art as we think it, not just as we see it. 
            </div>
          </div>

          <div className="rule mt-6 mb-10" />

          <div className="flex items-baseline justify-between mb-5">
            <h2 className="eyebrow">compositions</h2>
            <span className="display-italic text-muted text-[0.85rem]">
              what you assemble of them
            </span>
          </div>

          <CompositionsRow />
        </section>

        <section className="mt-20">
          <div className="rule mb-10" />

          <div className="flex items-baseline justify-between mb-5">
            <h2 className="eyebrow">stickers</h2>
            <span className="display-italic text-muted text-[0.85rem]">
              fragments of things you&rsquo;ve seen
            </span>
          </div>

          <StickerGrid />
        </section>

        <footer className="mt-32 flex items-baseline justify-between text-[0.72rem] text-muted">
          <span className="eyebrow">existence · before · essence</span>
          <span className="display-italic">a small place for making.</span>
        </footer>
      </main>
    </div>
  );
}
