import Link from "next/link";
import { Transfer } from "@/components/motion/transfer";
import { FixturePlaybook } from "./fixture-playbook";

const serif = "[font-family:var(--font-source-serif),Georgia,serif]";

export default function HomePage() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-6 px-6 pt-7">
        <p className={`${serif} text-[1.7rem] leading-none tracking-[-0.03em]`}>
          Handoff
        </p>
        <a
          href="#northline"
          className="text-sm text-[#3f3a33] underline decoration-[#1c1916]/30 underline-offset-4 outline-offset-4 hover:decoration-[#1c1916] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916]"
        >
          Northline fixture
        </a>
      </header>

      <div className="mx-auto mt-5 w-full max-w-6xl px-6" aria-hidden="true">
        <div className="h-px bg-[#1c1916]/15" />
      </div>

      <section className="mx-auto grid w-full max-w-6xl items-end gap-14 px-6 pt-12 pb-20 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)] lg:gap-16 lg:pt-16 lg:pb-24">
        <div className="max-w-2xl">
          <h1
            className={`${serif} text-[clamp(2.35rem,4.4vw,3.65rem)] leading-[1.12] tracking-[-0.025em] text-balance`}
          >
            A departing leader&apos;s knowledge becomes a day-1 playbook
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#3f3a33]">
            An exit interview captures what only they know, then turns that
            record into a cited playbook the successor can open on Monday.
          </p>
          <div className="mt-8">
            <Link
              href="/handoff"
              className="inline-flex bg-[#1c1916] px-5 py-3 text-sm font-medium text-[#f6f1e7] outline-offset-4 hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#1c1916]"
            >
              Start exit interview
            </Link>
          </div>
        </div>
        <Transfer />
      </section>

      <FixturePlaybook />
    </main>
  );
}
