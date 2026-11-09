
import VoiceRecorder from "./VoiceRecorder";
const categories = [
  { icon: "🛣️", name: "Road & Infrastructure", desc: "Potholes, damaged roads and unsafe streets.", number: "01" },
  { icon: "🗑️", name: "Waste Management", desc: "Garbage accumulation and missed collection.", number: "02" },
  { icon: "💧", name: "Water Supply", desc: "Water leakage, shortages and supply issues.", number: "03" },
  { icon: "🚰", name: "Drainage & Sanitation", desc: "Blocked drains and overflowing sewage.", number: "04" },
];

const steps = [
  { number: "01", title: "Report your issue", desc: "Describe the problem naturally using your voice." },
  { number: "02", title: "AI understands", desc: "Our AI processes and categorizes your complaint." },
  { number: "03", title: "Follow progress", desc: "Track your complaint as it moves toward resolution." },
];


const workflowNodes = [
  {
    icon: "🎙️",
    name: "Voice Input",
    detail: "Citizen speech",
    color: "cyan",
    status: "Input ready",
  },
  {
    icon: "🗣️",
    name: "Gnani Prisma",
    detail: "STT v2.5 · Speech to Text",
    color: "blue",
    status: "Connected",
  },
  {
    icon: "⚙️",
    name: "Classifier",
    detail: "Multilingual rule engine",
    color: "violet",
    status: "Connected",
  },
  {
    icon: "📋",
    name: "Response Text",
    detail: "Complaint confirmation",
    color: "emerald",
    status: "Output ready",
  },
  {
    icon: "🔊",
    name: "Gnani Timbre",
    detail: "TTS v2.5 · Text to Speech",
    color: "cyan",
    status: "Connected",
  },
];


export default function Home() {
  return (
    <main className="min-h-screen bg-[#f6f8fc] text-slate-900">

      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">

          <a href="#" className="flex items-center">
            <img
              src="/civicvoice-logo.png"
              alt="CivicVoice AI - Intelligent Civic Services"
              className="h-12 w-auto max-w-[260px] object-contain"
            />
          </a>

          <div className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#report" className="transition hover:text-blue-700">Report an issue</a>
            <a href="#categories" className="transition hover:text-blue-700">Services</a>
            <a href="#how" className="transition hover:text-blue-700">How it works</a>
          </div>

          <a
            href="#report"
            className="rounded-lg bg-[#123b70] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900"
          >
            Get started <span className="ml-1">→</span>
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#102f57] text-white">
        <div className="absolute -right-32 -top-40 h-96 w-96 rounded-full bg-blue-400/10 blur-3xl" />
        <div className="absolute -bottom-40 left-1/4 h-96 w-96 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.2fr_0.8fr] lg:px-10 lg:py-28">

          {/* Hero left content */}
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide text-blue-100">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              SMART CIVIC REPORTING PLATFORM
            </div>

            <h2 className="mt-8 max-w-2xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
              Better cities begin with
              <span className="block text-cyan-300">being heard.</span>
            </h2>

            <p className="mt-6 max-w-xl text-base leading-8 text-blue-100 md:text-lg">
              Report public infrastructure and community issues through your
              voice. Let AI help turn everyday concerns into actionable civic reports.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <a
                href="#report"
                className="rounded-lg bg-white px-7 py-4 text-sm font-bold text-[#123b70] shadow-lg transition hover:bg-blue-50"
              >
                🎙️ Report an issue
              </a>
              <a
                href="#how"
                className="rounded-lg border border-white/30 px-7 py-4 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Explore the process →
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-xs font-medium text-blue-200">
              <span>✓ Voice-powered reporting</span>
              <span>✓ AI-assisted understanding</span>
              <span>✓ Citizen-focused design</span>
            </div>
          </div>

          {/* Hero Agent Workflow Canvas */}
          <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-[#0b1b30] p-5 shadow-2xl md:p-6">

            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
                  CivicVoice AI
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">
                  Agent workflow
                </h3>
              </div>

              <span className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                Workflow active
              </span>
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-[#10243d] p-4">

              <div className="mb-5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-300">
                  COMPLAINT PROCESSING PIPELINE
                </span>
                <span className="text-[10px] text-slate-500">
                  LIVE PREVIEW
                </span>
              </div>

              <div className="workflow-scroll">
                <div className="workflow-track">

                  {workflowNodes.map((node, index) => (
                    <div key={node.name} className="workflow-step">

                      <div className={`workflow-node workflow-${node.color}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xl">{node.icon}</span>
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                        </div>

                        <p className="mt-4 text-xs font-bold text-white">
                          {node.name}
                        </p>

                        <p className="mt-1 text-[10px] text-slate-400">
                          {node.detail}
                        </p>

                        <div className="mt-3 border-t border-white/10 pt-2 text-[9px] text-emerald-300">
                          ● {node.status}
                        </div>
                      </div>

                      {index !== workflowNodes.length - 1 && (
                        <div className="workflow-connector">
                          <span className="workflow-packet" />
                        </div>
                      )}

                    </div>
                  ))}

                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="text-[10px] text-slate-400">
                  4 workflow nodes · Sequential processing
                </span>
                <span className="text-[10px] font-semibold text-cyan-300">
                  Prisma + Rule Engine
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] text-slate-400">
                  Speech engine
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Gnani Prisma
                </p>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-[10px] text-slate-400">
                  Classification
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  Rule-based AI
                </p>
              </div>
            </div>

            <p className="mt-4 text-center text-[10px] text-slate-500">
              From citizen voice input to structured civic complaint
            </p>

          </div>
        </div>
      </section>

      {/* Reporting workspace */}
      <section id="report" className="scroll-mt-24 px-6 py-20 lg:px-10">
        <div className="mx-auto max-w-7xl">

          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
              Citizen services
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              How can we help you today?
            </h2>

            <p className="mt-4 leading-7 text-slate-500">
              Choose a reporting method and tell us about the issue affecting your community.
            </p>
          </div>

          <div className="mt-10 grid items-start gap-7 lg:grid-cols-[1.3fr_0.7fr]">

            {/* Voice card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-9">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-blue-700">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                      🎙️
                    </span>
                    VOICE REPORTING
                  </div>

                  <h3 className="mt-5 text-2xl font-bold">
                    Speak your concern
                  </h3>

                  <p className="mt-3 max-w-lg text-sm leading-7 text-slate-500">
                    Describe your civic issue in your own words. Our speech recognition
                    service converts your recording into text.
                  </p>
                </div>

                <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-block">
                  Available
                </span>
              </div>

              <div className="mt-7 rounded-xl bg-[#f5f8fd] p-5 md:p-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Voice recording workspace
                </p>
                <VoiceRecorder />
              </div>

              <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-600">Suggested languages:</span>
                <span>English</span>
                <span>· Hindi</span>
                <span>· Kannada</span>
                <span>· Hinglish</span>
              </div>

              <p className="mt-2 text-[11px] leading-5 text-slate-400">
                Language availability and recognition accuracy depend on the speech service configuration.
              </p>
            </div>

            {/* Text card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl">
                ✍️
              </div>

              <div className="mt-5 flex items-center justify-between">
                <h3 className="text-xl font-bold">Text reporting</h3>
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                  Coming soon
                </span>
              </div>

              <p className="mt-3 text-sm leading-7 text-slate-500">
                Prefer typing? A simple structured reporting form will let you
                submit an issue without recording your voice.
              </p>

              <div className="mt-7 space-y-3">
                {["Describe the issue", "Add location details", "Review your report"].map((item, index) => (
                  <div key={item} className="flex items-center gap-3 text-sm text-slate-500">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                      {index + 1}
                    </span>
                    {item}
                  </div>
                ))}
              </div>

              <button
                disabled
                className="mt-8 w-full cursor-not-allowed rounded-lg bg-slate-100 px-5 py-3.5 text-sm font-semibold text-slate-400"
              >
                Text submission unavailable
              </button>
            </div>

          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="border-y border-slate-200 bg-white px-6 py-20 lg:px-10">
        <div className="mx-auto max-w-7xl">

          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
                Areas of concern
              </p>

              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                Issues that matter
              </h2>
            </div>

            <p className="max-w-md text-sm leading-7 text-slate-500">
              Help identify everyday civic challenges and bring attention to
              the infrastructure and services our communities rely on.
            </p>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <div
                key={category.name}
                className="group rounded-xl border border-slate-200 bg-white p-6 transition duration-200 hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-2xl">
                    {category.icon}
                  </span>

                  <span className="text-xs font-bold tracking-widest text-slate-300">
                    {category.number}
                  </span>
                </div>

                <h3 className="mt-6 font-bold text-slate-900">
                  {category.name}
                </h3>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  {category.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Process */}
      <section id="how" className="px-6 py-20 lg:px-10">
        <div className="mx-auto max-w-7xl">

          <div className="text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">
              Simple and accessible
            </p>

            <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
              From voice to action
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-500">
              A straightforward reporting journey designed to make civic participation easier.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.number} className="rounded-xl border border-slate-200 bg-white p-7 shadow-sm">
                <p className="text-sm font-bold tracking-widest text-blue-700">
                  {step.number}
                </p>

                <h3 className="mt-5 text-xl font-bold">
                  {step.title}
                </h3>

                <p className="mt-3 text-sm leading-7 text-slate-500">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="px-6 pb-20 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-7 rounded-2xl bg-[#123b70] p-8 text-white md:flex-row md:items-center md:p-12">

          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-200">
              Make your voice count
            </p>

            <h2 className="mt-3 text-2xl font-bold md:text-3xl">
              A better community starts with one report.
            </h2>

            <p className="mt-3 text-sm leading-7 text-blue-100">
              Share what needs attention in your neighbourhood.
            </p>
          </div>

          <a
            href="#report"
            className="shrink-0 rounded-lg bg-white px-7 py-4 text-sm font-bold text-[#123b70] transition hover:bg-blue-50"
          >
            Report an issue →
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white px-6 py-10 lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 sm:flex-row sm:items-center">

          <div>
            <p className="font-bold text-[#123b70]">CivicVoice AI</p>
            <p className="mt-1 text-xs text-slate-500">
              Your Voice. Your City. Your Solution.
            </p>
          </div>

          <p className="text-xs text-slate-400">
            AI-powered civic reporting prototype · Built for better communities
          </p>
        </div>
      </footer>

    </main>
  );
}
