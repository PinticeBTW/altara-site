"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import type { ReactNode } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

const features = [
  {
    title: "Fast calls",
    description: "Low-friction voice rooms that open instantly and stay clear.",
  },
  {
    title: "Personal spaces",
    description: "Organize chats, calls and communities without the noise.",
  },
  {
    title: "Made for your crew",
    description: "A calm home base for friends, teams and close communities.",
  },
];

function BackgroundGlows() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute left-1/2 top-[-22rem] h-[42rem] w-[42rem] -translate-x-1/2 rounded-full bg-cyan-300/16 blur-3xl"
        animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], x: ["-50%", "-47%", "-50%"] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute left-[-16rem] top-[28rem] h-[38rem] w-[38rem] rounded-full bg-indigo-500/16 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, 36, 0], y: [0, -28, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-18rem] top-56 h-[34rem] w-[34rem] rounded-full bg-sky-400/10 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, -34, 0], y: [0, 30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function Logo() {
  return (
    <a href="#home" className="group flex items-center gap-3" aria-label="Altara home">
      <span className="grid h-9 w-9 place-items-center rounded-2xl border border-white/12 bg-white/[0.07] shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl">
        <Image
          src="/logo.png"
          alt=""
          width={32}
          height={32}
          priority
          className="h-8 w-8 object-contain transition-transform duration-300 group-hover:scale-110"
        />
      </span>
      <span className="text-sm font-semibold tracking-[-0.02em] text-white">Altara</span>
    </a>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="text-sm font-medium text-slate-300 transition-colors duration-300 hover:text-white"
    >
      {children}
    </a>
  );
}

function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const isPrimary = variant === "primary";

  return (
    <motion.a
      href={href}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 360, damping: 24 }}
      className={[
        "group relative inline-flex min-h-12 items-center justify-center overflow-hidden rounded-full px-7 text-sm font-semibold tracking-[-0.01em]",
        "outline-none transition-shadow duration-300 focus-visible:ring-2 focus-visible:ring-cyan-200/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
        isPrimary
          ? "bg-white text-slate-950 shadow-[0_18px_54px_rgba(255,255,255,0.18)] hover:shadow-[0_22px_72px_rgba(125,211,252,0.28)]"
          : "border border-white/12 bg-white/[0.055] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl hover:border-white/22 hover:bg-white/[0.09]",
      ].join(" ")}
    >
      <span
        className={[
          "absolute inset-0 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100",
          isPrimary ? "bg-cyan-200/45" : "bg-cyan-300/14",
        ].join(" ")}
        aria-hidden="true"
      />
      <span className="relative">{children}</span>
    </motion.a>
  );
}

function FloatingCard({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className: string;
  delay?: number;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={
        reduceMotion
          ? { opacity: 1, y: 0 }
          : { opacity: 1, y: [0, -8, 0] }
      }
      transition={{
        opacity: { duration: 0.7, delay },
        y: { duration: 5.5, delay, repeat: Infinity, ease: "easeInOut" },
      }}
      className={[
        "absolute rounded-2xl border border-white/12 bg-slate-950/64 px-4 py-3 text-left shadow-[0_20px_60px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl",
        className,
      ].join(" ")}
    >
      {children}
    </motion.div>
  );
}

function AppMockup() {
  return (
    <motion.div
      variants={fadeUp}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="relative mx-auto mt-16 w-full max-w-5xl"
    >
      <div
        className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/64 p-3 shadow-[0_36px_130px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl"
        role="img"
        aria-label="Altara app interface showing spaces, messages and call status"
      >
        <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/45 to-transparent" aria-hidden="true" />

        <div className="grid min-h-[25rem] grid-cols-[4.75rem_1fr] overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-[#0a0f1c] sm:grid-cols-[5.5rem_15rem_1fr]">
          <aside className="flex flex-col items-center gap-3 border-r border-white/[0.07] bg-white/[0.035] px-3 py-5" aria-label="Spaces sidebar">
            {["A", "V", "C", "S"].map((space, index) => (
              <div
                key={space}
                className={[
                  "grid h-11 w-11 place-items-center rounded-2xl text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
                  index === 0
                    ? "bg-cyan-300/18 ring-1 ring-cyan-200/35"
                    : "bg-white/[0.07] ring-1 ring-white/8",
                ].join(" ")}
              >
                {space}
              </div>
            ))}
          </aside>

          <aside className="hidden border-r border-white/[0.07] bg-slate-900/38 p-5 sm:block" aria-label="Channels">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Spaces</p>
              <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">Design Crew</p>
            </div>
            <div className="space-y-2">
              {["general", "voice lounge", "launch room", "after hours"].map((channel, index) => (
                <div
                  key={channel}
                  className={[
                    "rounded-2xl px-3 py-2 text-sm",
                    index === 1
                      ? "bg-cyan-300/12 text-cyan-100 ring-1 ring-cyan-200/18"
                      : "text-slate-400",
                  ].join(" ")}
                >
                  # {channel}
                </div>
              ))}
            </div>
          </aside>

          <section className="flex min-w-0 flex-col" aria-label="Chat preview">
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Voice room</p>
                <p className="text-base font-semibold tracking-[-0.02em] text-white">Morning sync</p>
              </div>
              <div className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-medium text-emerald-200">
                Live call
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-end gap-4 p-5">
              {[
                ["Mira", "Can we jump into voice for the final pass?"],
                ["Noah", "Already there. Sharing the layout now."],
                ["Altara", "Voice connected in Morning sync."],
              ].map(([name, message], index) => (
                <div key={message} className="flex gap-3">
                  <div
                    className={[
                      "mt-1 h-9 w-9 shrink-0 rounded-full",
                      index === 0
                        ? "bg-cyan-300/22"
                        : index === 1
                          ? "bg-indigo-300/22"
                          : "bg-emerald-300/22",
                    ].join(" ")}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{name}</p>
                    <p className="mt-1 max-w-md rounded-2xl border border-white/[0.07] bg-white/[0.045] px-4 py-3 text-sm leading-6 text-slate-300">
                      {message}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/[0.07] p-5">
              <div className="flex items-center justify-between rounded-2xl border border-white/[0.07] bg-white/[0.045] px-4 py-3 text-sm text-slate-500">
                Message Design Crew
                <span className="h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(125,211,252,0.82)]" />
              </div>
            </div>
          </section>
        </div>
      </div>

      <FloatingCard className="left-2 top-10 hidden sm:block" delay={0.25}>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-emerald-200/70">Voice connected</p>
        <p className="mt-1 text-sm font-semibold text-white">Morning sync</p>
      </FloatingCard>

      <FloatingCard className="right-3 top-16 hidden md:block" delay={0.45}>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-100/70">3 friends online</p>
        <p className="mt-1 text-sm font-semibold text-white">Ready to talk</p>
      </FloatingCard>

      <FloatingCard className="bottom-7 right-4 hidden sm:block" delay={0.65}>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-indigo-100/70">New message</p>
        <p className="mt-1 text-sm font-semibold text-white">Noah sent a file</p>
      </FloatingCard>
    </motion.div>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#070a12] font-sans text-white">
      <BackgroundGlows />
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.12),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96)_42%,rgba(8,13,28,0.99))]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.026)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.026)_1px,transparent_1px)] bg-[size:76px_76px] opacity-20 [mask-image:radial-gradient(circle_at_center,black,transparent_76%)]"
        aria-hidden="true"
      />

      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-slate-950/48 backdrop-blur-2xl">
        <nav className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8" aria-label="Primary navigation">
          <Logo />
          <div className="hidden items-center gap-8 md:flex">
            <NavLink href="#features">Features</NavLink>
            <NavLink href="#download">Download</NavLink>
            <NavLink href="#browser">Browser</NavLink>
          </div>
          <a
            href="#download"
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 shadow-[0_12px_34px_rgba(255,255,255,0.16)] transition-transform duration-300 hover:scale-105"
          >
            Download
          </a>
        </nav>
      </header>

      <main id="home" className="relative z-10">
        <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-7xl flex-col items-center px-5 pb-20 pt-20 text-center sm:px-6 sm:pt-24 lg:px-8" aria-labelledby="hero-title">
          <motion.div
            initial="hidden"
            animate="visible"
            transition={{ staggerChildren: 0.12, delayChildren: 0.08 }}
            className="mx-auto max-w-4xl"
          >
            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mb-6 w-fit rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-medium uppercase tracking-[0.28em] text-cyan-100/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl"
            >
              Altara for desktop and web
            </motion.p>

            <motion.h1
              id="hero-title"
              variants={fadeUp}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="text-balance text-5xl font-bold tracking-[-0.06em] text-white sm:text-7xl lg:text-8xl"
            >
              A better place to talk.
            </motion.h1>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-8 text-slate-300/84 sm:text-lg"
            >
              Altara is a fast, clean and personal communication platform for
              calls, messages and communities.
            </motion.p>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <ButtonLink href="#download">Download Altara</ButtonLink>
              <ButtonLink href="#browser" variant="secondary">Try in Browser</ButtonLink>
            </motion.div>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 text-sm text-slate-500"
            >
              Best experienced in the desktop app.
            </motion.p>
          </motion.div>

          <AppMockup />
        </section>

        <section id="features" className="mx-auto w-full max-w-7xl px-5 pb-24 sm:px-6 lg:px-8" aria-labelledby="features-title">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.35 }}
            transition={{ staggerChildren: 0.1 }}
            className="mx-auto max-w-5xl"
          >
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-2xl text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100/68">Why Altara</p>
              <h2 id="features-title" className="mt-3 text-3xl font-bold tracking-[-0.045em] text-white sm:text-4xl">
                Built for focused communication.
              </h2>
            </motion.div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {features.map((feature, index) => (
                <motion.article
                  key={feature.title}
                  variants={fadeUp}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -8, scale: 1.015 }}
                  className="group rounded-[1.75rem] border border-white/10 bg-white/[0.055] p-6 text-left shadow-[0_24px_80px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-xl transition-colors duration-300 hover:border-cyan-200/18 hover:bg-white/[0.075]"
                >
                  <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.07] text-sm font-bold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                    0{index + 1}
                  </div>
                  <h3 className="text-xl font-semibold tracking-[-0.03em] text-white">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{feature.description}</p>
                </motion.article>
              ))}
            </div>
          </motion.div>
        </section>

        <section id="download" className="mx-auto w-full max-w-7xl px-5 pb-20 sm:px-6 lg:px-8" aria-labelledby="download-title">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 text-center shadow-[0_30px_100px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-2xl sm:p-8 md:flex-row md:text-left">
            <div>
              <h2 id="download-title" className="text-2xl font-bold tracking-[-0.04em] text-white sm:text-3xl">
                Start with the desktop app.
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                The fastest way into Altara, tuned for calls, messages and daily crew spaces.
              </p>
            </div>
            <ButtonLink href="#download">Download Altara</ButtonLink>
          </div>
        </section>

        <section id="browser" className="sr-only" aria-labelledby="browser-title">
          <h2 id="browser-title">Try Altara in your browser</h2>
        </section>
      </main>
    </div>
  );
}
