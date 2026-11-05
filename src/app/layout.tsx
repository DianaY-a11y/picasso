import type { Metadata } from "next";
import { Instrument_Sans } from "next/font/google";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-app",
  subsets: ["latin"],
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
    <html lang="en" className={instrumentSans.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
