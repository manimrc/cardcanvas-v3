/**
 * @file layout.tsx
 * @description Next.js Root Layout wrapper.
 * Injects the global auth session provider (`AuthProvider`) and binds the monolithic global stylesheet
 * (`globals.css`) across all dynamic sub-pages.
 */

import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sleekly",
  description: "A local-first desktop workspace for cards, notes, media, tags, and whiteboards.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
