import { Scrapbook } from "@/components/Scrapbook";

export default function Home() {
  return (
    <div className="landing">
      <header className="landing__mark">
        <div className="display tracking-[0.42em] select-none">P I C A S S O</div>
      </header>

      <main className="landing__stage">
        <Scrapbook />
      </main>

      <footer className="landing__foot display-italic">
        &ldquo;I paint objects as I think them, not as I see them.&rdquo;
      </footer>
    </div>
  );
}
