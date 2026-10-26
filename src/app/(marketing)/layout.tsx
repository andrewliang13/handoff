import type { ReactNode } from "react";
import { Source_Serif_4 } from "next/font/google";

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${sourceSerif.variable} flex min-h-full flex-1 flex-col bg-[#f3efe6] font-sans text-[#1c1916]`}
    >
      {children}
    </div>
  );
}
