import type { Metadata } from "next";
import {
  Caveat,
  Fraunces,
  Hanken_Grotesk,
  Instrument_Sans,
  Instrument_Serif,
  Special_Elite,
  Young_Serif,
} from "next/font/google";

// A temporary page for choosing type: each card renders the real fonts.
export const metadata: Metadata = { title: "picasso — font options" };

const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const instrumentSans = Instrument_Sans({ subsets: ["latin"] });
const fraunces = Fraunces({ subsets: ["latin"], style: ["normal", "italic"] });
const hanken = Hanken_Grotesk({ subsets: ["latin"] });
const youngSerif = Young_Serif({ subsets: ["latin"], weight: "400" });
const caveat = Caveat({ subsets: ["latin"] });
const specialElite = Special_Elite({ subsets: ["latin"], weight: "400" });

type Option = {
  key: string;
  name: string;
  mood: string;
  display: string;
  body: string;
  note: string;
  noteItalic?: boolean;
};

const OPTIONS: Option[] = [
  {
    key: "A",
    name: "Instrument Serif + Instrument Sans",
    mood: "gallery wall label — quiet, elegant, very current",
    display: instrumentSerif.className,
    body: instrumentSans.className,
    note: instrumentSerif.className,
    noteItalic: true,
  },
  {
    key: "B",
    name: "Fraunces + Hanken Grotesk",
    mood: "warm old-style serif with a little wobble; body stays what you have now",
    display: fraunces.className,
    body: hanken.className,
    note: fraunces.className,
    noteItalic: true,
  },
  {
    key: "C",
    name: "Young Serif + Hanken Grotesk + Caveat",
    mood: "a kept scrapbook — sturdy headings, handwritten labels",
    display: youngSerif.className,
    body: hanken.className,
    note: caveat.className,
  },
  {
    key: "D",
    name: "Special Elite + Instrument Sans",
    mood: "archive card — typewritten titles, clean reading text",
    display: specialElite.className,
    body: instrumentSans.className,
    note: specialElite.className,
  },
  {
    key: "now",
    name: "Hanken Grotesk (current)",
    mood: "one plain sans everywhere, close to the sample you sent",
    display: hanken.className,
    body: hanken.className,
    note: hanken.className,
  },
];

export default function FontsPage() {
  return (
    <main className="fonts-page">
      <h1 className="fonts-title">font options for picasso</h1>
      <p className="fonts-intro">
        Each card shows the title-page quote, body text and a scrapbook label
        in the real fonts. Pick a letter (or mix: e.g. &ldquo;A headings with
        C labels&rdquo;).
      </p>
      <div className="fonts-grid">
        {OPTIONS.map((o) => (
          <section key={o.key} className="fonts-card page">
            <div className="fonts-card__inner">
              <div className={`fonts-tag ${o.body}`}>
                {o.key} · {o.name}
              </div>
              <div className={`fonts-mood ${o.body}`}>{o.mood}</div>

              <div className={`fonts-mark ${o.display}`}>P I C A S S O</div>
              <blockquote className={`fonts-quote ${o.display}`}>
                &ldquo;I paint objects as I think them, not as I see them.&rdquo;
              </blockquote>
              <p className={`fonts-body ${o.body}`}>
                This reflects a deeper idea that existence precedes essence,
                meaning we create our own meaning and identity. This studio is
                a small place for making art as we think it, not just as we see
                it.
              </p>
              <div className="fonts-row">
                <span
                  className={`fonts-note ${o.note}`}
                  style={o.noteItalic ? { fontStyle: "italic" } : undefined}
                >
                  fragments of things you&rsquo;ve seen
                </span>
                <span className={`fonts-cta ${o.body}`}>
                  create new stickers →
                </span>
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
