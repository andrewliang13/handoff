import type { ReactNode } from "react";
import { Source_Serif_4 } from "next/font/google";
import Link from "next/link";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${sourceSerif.variable} flex min-h-full flex-1 flex-col bg-[#f3efe6] font-sans text-[#1c1916]`}
    >
      <header className="border-b border-[#1c1916]/15">
        <div className="mx-auto flex w-full max-w-3xl items-baseline justify-between px-6 py-5">
          <Link
            href="/handoff"
            className="[font-family:var(--font-source-serif),Georgia,serif] text-2xl tracking-[-0.03em]"
          >
            Handoff
          </Link>
          <Link
            href="/"
            className="text-sm text-[#3f3a33] underline decoration-[#1c1916]/30 underline-offset-4 outline-offset-4 hover:decoration-[#1c1916] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916]"
          >
            Home
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
