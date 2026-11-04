import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
    <html lang="en" className={hanken.variable} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
