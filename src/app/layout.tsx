import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import "./globals.css";

// Copperplate Gothic Bold is a licensed font, so it isn't bundled: visitors
// who have it installed (Windows/Office: "Copperplate Gothic Bold"; macOS:
// "Copperplate") see it, everyone else gets Cinzel, the closest free match.
const cinzel = Cinzel({
  variable: "--font-fallback",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "picasso — a studio for making",
  description:
    "Upload an image, turn it into a small 3D object, take stickers of it from any angle, and compose them on canvas. An homage to existence before essence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cinzel.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
