// src/app/layout.tsx

import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Nomoosh — Partner with us",
  description: "Register your restaurant with Nomoosh — fast onboarding & smooth ordering",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="nomoosh-root min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}


