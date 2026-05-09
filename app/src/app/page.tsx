import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-5">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-white text-base font-semibold tracking-tight">Blink Hivemind</h1>
            <p className="text-zinc-400 text-xs mt-0.5">Internal knowledge base</p>
          </div>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-20">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">What would you like to do?</h2>
            <p className="text-gray-500 text-sm mt-2">Manage and explore the Blink knowledge base</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/ingest"
              className="group flex items-start gap-5 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all duration-150"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0 group-hover:bg-indigo-100 transition-colors">
                📥
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-gray-900 font-semibold text-base">Add Knowledge</h3>
                  <span className="text-indigo-600 text-sm shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
                <p className="text-gray-500 text-sm mt-1 leading-relaxed">
                  Paste a transcript or notes. The AI will break it into segments, propose where each belongs, and file everything after your review.
                </p>
              </div>
            </Link>

            <Link
              href="/chat"
              className="group flex items-start gap-5 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all duration-150"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0 group-hover:bg-indigo-100 transition-colors">
                💬
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-gray-900 font-semibold text-base">Ask a Question</h3>
                  <span className="text-indigo-600 text-sm shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
                <p className="text-gray-500 text-sm mt-1 leading-relaxed">
                  Chat with the knowledge base. Answers stream in real time and cite the exact source files so you always know where each claim comes from.
                </p>
              </div>
            </Link>

            <Link
              href="/browse"
              className="group flex items-start gap-5 bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:border-indigo-400 hover:shadow-md transition-all duration-150 md:col-span-2"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center text-xl shrink-0 group-hover:bg-indigo-100 transition-colors">
                📂
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-gray-900 font-semibold text-base">Browse Knowledge Base</h3>
                  <span className="text-indigo-600 text-sm shrink-0 group-hover:translate-x-0.5 transition-transform">→</span>
                </div>
                <p className="text-gray-500 text-sm mt-1 leading-relaxed">
                  Explore all files in the knowledge base. Search, navigate the folder tree, and read any document rendered as formatted markdown.
                </p>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
