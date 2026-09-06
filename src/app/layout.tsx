import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JFMCSS Control",
  description: "CRM, billing, support and operations workspace for JFMCSS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
