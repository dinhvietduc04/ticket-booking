import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppNav } from "@/components/app-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Seatly",
  description: "High-confidence live event ticketing",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-50 border-b border-white/10 bg-midnight/88 backdrop-blur-xl">
          <div className="app-container flex items-center justify-between py-3">
            <Link
              href="/events"
              className="flex items-center"
              aria-label="Seatly home"
            >
              <span className="relative block h-12 w-32 overflow-hidden rounded-lg border border-coral/40 bg-coral/15 shadow-glow sm:h-14 sm:w-40">
                <Image
                  alt="Seatly"
                  className="object-contain p-1.5"
                  fill
                  priority
                  src="/seatly_logo.png"
                  sizes="(min-width: 640px) 160px, 128px"
                />
              </span>
            </Link>
            <AppNav />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
