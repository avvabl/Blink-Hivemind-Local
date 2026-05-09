"use client";

import { useState } from "react";
import Link from "next/link";
import type { Segment } from "@/lib/markdown";

type Step = "input" | "loading" | "review" | "committing" | "done";
type Override = {
  conflict_resolution?: "update" | "client-specific" | "cancel";
  assigned_slug?: string;
  cancelled?: boolean;
};

const CLASSIFICATION_COLORS: Record<string, string> = {
  new: "bg-indigo-100 text-indigo-700",
  update: "bg-amber-100 text-amber-700",
  "client-specific": "bg-purple-100 text-purple-700",
  decision: "bg-green-100 text-green-700",
};
const OP_COLORS: Record<string, string> = {
  append: "bg-slate-100 text-slate-600",
  update_section: "bg-amber-100 text-amber-600",
  create_file: "bg-emerald-100 text-emerald-600",
  create_client_override: "bg-purple-100 text-purple-600",
};

export default function IngestPage() {
  const [step, setStep] = useState<Step>("input");
  const [author, setAuthor] = useState("");
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ transcriptPath: string; fileCount: number } | null>(null);

  function patch(id: string, update: Partial<Override>) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...update } }));
  }
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function analyze() {
    if (!author.trim() || !transcript.trim()) return;
    setStep("loading");
    setError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, author }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Analysis failed");
      setSegments(data.plan?.segments ?? []);
      setOverrides({});
      setStep("review");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("input");
    }
  }

  async function commit() {
    setStep("committing");
    setError(null);
    try {
      const confirmed = segments.map((s) => ({ ...s, ...(overrides[s.id] ?? {}) }));
      const res = await fetch("/api/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: confirmed, author, transcript }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Commit failed");
      setResult(data);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("review");
    }
  }

  const active = segments.filter((s) => !overrides[s.id]?.cancelled);
  const hasUnresolved = active.some(
    (s) => s.conflicts.length > 0 && !overrides[s.id]?.conflict_resolution
  );
  const hasMissingSlugs = active.some((s) => s.needs_new_slug && !overrides[s.id]?.assigned_slug);
  const canCommit = active.length > 0 && !hasUnresolved && !hasMissingSlugs;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Home</Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Add Knowledge</h1>
          {step === "review" && (
            <p className="text-slate-400 text-xs">{active.length} of {segments.length} segments active</p>
          )}
        </div>
      </header>

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Input */}
        {step === "input" && (
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Your name</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Awwab"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Transcript or notes</label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste your transcript, stream of thoughts, or .md content here…"
                rows={14}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
              />
            </div>
            <button
              onClick={analyze}
              disabled={!author.trim() || !transcript.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
            >
              Analyse →
            </button>
          </div>
        )}

        {/* Loading */}
        {(step === "loading" || step === "committing") && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-slate-500 text-sm">
              {step === "loading" ? "Analysing transcript…" : "Committing to GitHub…"}
            </p>
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button onClick={() => setStep("input")} className="text-sm text-slate-500 hover:text-slate-800">← Back</button>
              <button
                onClick={commit}
                disabled={!canCommit}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                Commit {active.length} segment{active.length !== 1 ? "s" : ""} →
              </button>
            </div>

            {!canCommit && !hasUnresolved && !hasMissingSlugs && active.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-2">All segments cancelled.</p>
            )}
            {hasUnresolved && (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                Resolve all conflicts before committing.
              </p>
            )}
            {hasMissingSlugs && (
              <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
                Assign a slug to all new features before committing.
              </p>
            )}

            {segments.map((seg, i) => {
              const ov = overrides[seg.id] ?? {};
              const cancelled = ov.cancelled ?? false;
              return (
                <div
                  key={seg.id}
                  className={`bg-white border rounded-xl overflow-hidden transition-opacity ${cancelled ? "opacity-40" : "border-slate-200"}`}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                    <span className="text-xs text-slate-400 font-mono">Segment {i + 1}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CLASSIFICATION_COLORS[seg.classification] ?? "bg-slate-100 text-slate-600"}`}>
                        {seg.classification}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${OP_COLORS[seg.operation] ?? "bg-slate-100 text-slate-600"}`}>
                        {seg.operation.replace("_", " ")}
                      </span>
                      <button
                        onClick={() => patch(seg.id, { cancelled: !cancelled })}
                        className="text-xs text-slate-400 hover:text-red-500 ml-1"
                      >
                        {cancelled ? "Restore" : "Skip"}
                      </button>
                    </div>
                  </div>

                  {!cancelled && (
                    <div className="p-4 space-y-3">
                      {/* Excerpt */}
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-4">{seg.text}</p>

                      {/* Target path */}
                      <div className="text-xs font-mono text-slate-500 bg-slate-50 rounded px-3 py-1.5 flex items-center gap-2">
                        <span className="text-slate-400">→</span>
                        <span className="break-all">{seg.target_path}</span>
                      </div>

                      {/* New slug input */}
                      {seg.needs_new_slug && (
                        <div>
                          <label className="block text-xs font-medium text-amber-700 mb-1">
                            New feature slug required
                          </label>
                          <input
                            type="text"
                            value={ov.assigned_slug ?? ""}
                            onChange={(e) => patch(seg.id, { assigned_slug: e.target.value })}
                            placeholder="e.g. qr-checkin"
                            className="w-full border border-amber-300 bg-amber-50 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-400"
                          />
                        </div>
                      )}

                      {/* Conflicts */}
                      {seg.conflicts.length > 0 && (
                        <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 space-y-2">
                          <p className="text-xs font-semibold text-amber-700">⚠ Conflict detected</p>
                          {seg.conflicts.map((c, ci) => (
                            <div key={ci} className="text-xs text-amber-800">
                              <p className="mb-1">{c.description}</p>
                              {c.current_text && (
                                <pre className="bg-white border border-amber-200 rounded p-2 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{c.current_text}</pre>
                              )}
                            </div>
                          ))}
                          <div className="flex gap-3 pt-1">
                            {(["update", "client-specific", "cancel"] as const).map((opt) => (
                              <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`conflict-${seg.id}`}
                                  value={opt}
                                  checked={ov.conflict_resolution === opt}
                                  onChange={() => patch(seg.id, { conflict_resolution: opt })}
                                  className="accent-indigo-600"
                                />
                                <span className="text-xs text-slate-700 capitalize">{opt.replace("-", " ")}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reasoning accordion */}
                      <button
                        onClick={() => toggleExpand(seg.id)}
                        className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
                      >
                        <span>{expanded.has(seg.id) ? "▾" : "▸"}</span>
                        AI reasoning
                      </button>
                      {expanded.has(seg.id) && (
                        <p className="text-xs text-slate-500 bg-slate-50 rounded px-3 py-2 leading-relaxed">{seg.reasoning}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-2 flex justify-end">
              <button
                onClick={commit}
                disabled={!canCommit}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                Commit {active.length} segment{active.length !== 1 ? "s" : ""} →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === "done" && result && (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-4">
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-semibold text-slate-800">Committed</h2>
            <p className="text-slate-500 text-sm">
              {result.fileCount} file{result.fileCount !== 1 ? "s" : ""} updated in the knowledge base.
            </p>
            <p className="text-xs font-mono text-slate-400">{result.transcriptPath}</p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => { setStep("input"); setTranscript(""); setSegments([]); setOverrides({}); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2 rounded-lg"
              >
                Add more
              </button>
              <Link href="/" className="border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium px-5 py-2 rounded-lg">
                Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
