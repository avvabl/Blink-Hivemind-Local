import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white px-6 py-4">
        <h1 className="text-lg font-semibold tracking-tight">Blink Hivemind</h1>
        <p className="text-slate-400 text-sm">Internal knowledge base</p>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="grid sm:grid-cols-2 gap-6 w-full max-w-2xl">
          <Link
            href="/ingest"
            className="group bg-white border border-slate-200 rounded-xl p-8 hover:border-indigo-400 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-4">📥</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Add Knowledge</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Paste a transcript or document. The AI will analyse it, propose where each piece belongs, and file it after your confirmation.
            </p>
            <span className="mt-4 inline-block text-indigo-600 text-sm font-medium group-hover:underline">
              Open ingestion →
            </span>
          </Link>

          <Link
            href="/chat"
            className="group bg-white border border-slate-200 rounded-xl p-8 hover:border-indigo-400 hover:shadow-md transition-all"
          >
            <div className="text-3xl mb-4">💬</div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Ask a Question</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              Chat with the knowledge base. Answers stream in real time and cite the source files so you know exactly where each claim comes from.
            </p>
            <span className="mt-4 inline-block text-indigo-600 text-sm font-medium group-hover:underline">
              Open chat →
            </span>
          </Link>
        </div>
      </div>
    </main>
  );
}
