import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LBP OTC Management",
  description: "PT Lintas Batas Pembayaran — Institutional OTC Management",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="min-h-full">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
