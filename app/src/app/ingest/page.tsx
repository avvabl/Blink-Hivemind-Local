"use client";

import { useState } from "react";
import Link from "next/link";
import type { Segment } from "@/lib/markdown";

// ── JSON recovery helpers ─────────────────────────────────────────────────
// Streaming from the LLM can be truncated at the token limit, leaving broken
// JSON. We try three strategies in order before giving up.

function scanNesting(s: string) {
  let inString = false, escape = false, braces = 0, brackets = 0;
  for (const ch of s) {
    if (escape)        { escape = false; continue; }
    if (ch === "\\")   { escape = true;  continue; }
    if (ch === '"')    { inString = !inString; continue; }
    if (inString)      continue;
    if (ch === "{")    braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }
  return { inString, braces, brackets };
}

// Tier 2: close unclosed strings/brackets/braces.
function repairJson(raw: string): string {
  let s = raw.trimEnd().replace(/,\s*$/, "");
  const { inString, braces, brackets } = scanNesting(s);
  if (inString) s += '"';      // close the unclosed string value
  s = s.trimEnd().replace(/,\s*$/, "");   // trailing comma after string close
  for (let i = 0; i < brackets; i++) s += "]";
  for (let i = 0; i < braces; i++) s += "}";
  return s;
}

// Tier 3: pull out every complete {...} segment object regardless of outer structure.
function extractSegments(raw: string): Segment[] {
  const results: Segment[] = [];
  const match = raw.match(/"segments"\s*:\s*\[/);
  if (!match || match.index == null) return results;
  const content = raw.slice(match.index + match[0].length);

  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (esc)          { esc = false; continue; }
    if (ch === "\\")  { esc = true;  continue; }
    if (ch === '"')   { inStr = !inStr; continue; }
    if (inStr)        continue;
    if (ch === "{")   { if (depth === 0) start = i; depth++; }
    else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const obj = JSON.parse(content.slice(start, i + 1)) as Segment;
          if (obj.id) results.push(obj);
        } catch { /* incomplete object, skip */ }
        start = -1;
      }
    }
  }
  return results;
}

// Try all three strategies; return a plan or throw.
function parsePlan(raw: string): { segments: Segment[] } {
  const start = raw.indexOf("{");
  if (start === -1) throw new Error("No JSON found in AI response.");
  const json = raw.slice(start);

  // Tier 1: direct
  try { return JSON.parse(json); } catch { /* fall through */ }

  // Tier 2: structural repair
  try { return JSON.parse(repairJson(json)); } catch { /* fall through */ }

  // Tier 3: extract only complete segment objects
  const segments = extractSegments(raw);
  if (segments.length > 0) return { segments };

  throw new Error("Could not parse the AI response. The transcript may be too long — try splitting it into shorter sections.");
}

type Step = "input" | "loading" | "review" | "committing" | "done";
type Override = {
  conflict_resolution?: "update" | "client-specific" | "cancel";
  assigned_slug?: string;
  cancelled?: boolean;
  target_path_override?: string;
};
type SplitState = { id: string; textA: string; textB: string };

const CLASSIFICATION_BADGE: Record<string, string> = {
  new:              "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-200",
  update:           "bg-amber-100 text-amber-800 ring-1 ring-amber-200",
  "client-specific":"bg-purple-100 text-purple-700 ring-1 ring-purple-200",
  decision:         "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
};
const OP_BADGE: Record<string, string> = {
  append:                "bg-gray-100 text-gray-700 ring-1 ring-gray-200",
  update_section:        "bg-amber-100 text-amber-700 ring-1 ring-amber-200",
  create_file:           "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200",
  create_client_override:"bg-purple-100 text-purple-700 ring-1 ring-purple-200",
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  );
}

export default function IngestPage() {
  const [step, setStep] = useState<Step>("input");
  const [author, setAuthor] = useState("");
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ transcriptPath: string; fileCount: number } | null>(null);
  const [streamedChars, setStreamedChars] = useState(0);
  const [split, setSplit] = useState<SplitState | null>(null);
  const [allFiles, setAllFiles] = useState<string[]>([]);
  const [fileSearch, setFileSearch] = useState<Record<string, string>>({});

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

  // Lazy-load file list for path search
  async function ensureFiles() {
    if (allFiles.length > 0) return;
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      if (data.files) setAllFiles(data.files);
    } catch { /* non-critical */ }
  }

  // Split a segment into two
  function confirmSplit() {
    if (!split) return;
    const orig = segments.find((s) => s.id === split.id);
    if (!orig) return;
    const a: Segment = { ...orig, id: `${orig.id}a`, text: split.textA };
    const b: Segment = { ...orig, id: `${orig.id}b`, text: split.textB };
    setSegments((prev) => prev.flatMap((s) => s.id === split.id ? [a, b] : [s]));
    setSplit(null);
  }

  async function analyze() {
    if (!author.trim() || !transcript.trim()) return;
    setStep("loading");
    setStreamedChars(0);
    setError(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, author }),
      });

      // Non-2xx before streaming starts means a JSON error response
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Analysis failed");
      }

      // Read the streamed plain-text response
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let raw = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        raw += chunk;
        setStreamedChars(raw.length);
      }

      // Check for an in-stream error signal
      if (raw.includes("__ERROR__:")) {
        const msg = raw.split("__ERROR__:")[1]?.trim() ?? "Analysis failed";
        throw new Error(msg);
      }

      const plan = parsePlan(raw);
      setSegments(plan.segments ?? []);
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
      const confirmed = segments.map((s) => {
        const ov = overrides[s.id] ?? {};
        return {
          ...s,
          ...ov,
          // Apply path override as the canonical target_path
          target_path: ov.target_path_override ?? s.target_path,
        };
      });
      const res = await fetch("/api/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments: confirmed, author, transcript }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.error) throw new Error(data?.error || "Commit failed — the function may have timed out");
      setResult(data);
      setStep("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStep("review");
    }
  }

  const active = segments.filter((s) => !overrides[s.id]?.cancelled);
  const hasUnresolved = active.some((s) => s.conflicts.length > 0 && !overrides[s.id]?.conflict_resolution);
  const hasMissingSlugs = active.some((s) => s.needs_new_slug && !overrides[s.id]?.assigned_slug);
  const canCommit = active.length > 0 && !hasUnresolved && !hasMissingSlugs;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-zinc-400 hover:text-white text-sm transition-colors shrink-0">
          ← Home
        </Link>
        <div className="w-px h-4 bg-zinc-700" />
        <div>
          <h1 className="text-white text-sm font-semibold">Add Knowledge</h1>
          {step === "review" && (
            <p className="text-zinc-400 text-xs mt-0.5">{active.length} of {segments.length} segments active</p>
          )}
        </div>
      </header>

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">

        {/* Error banner */}
        {error && (
          <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 text-sm">
            <span className="shrink-0 mt-0.5">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Step 1: Input ── */}
        {step === "input" && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7 space-y-6">
            <div>
              <h2 className="text-gray-900 font-semibold text-lg">New ingestion</h2>
              <p className="text-gray-500 text-sm mt-1">Paste a transcript, notes, or stream of thought. The AI will analyse and file it.</p>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Your name</label>
              <input
                type="text"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Awwab"
                className="w-full bg-white text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Transcript or notes</label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder={"Paste your transcript, stream of thoughts, or .md content here…\n\nThe AI will split it into segments and propose where each one belongs."}
                rows={14}
                className="w-full bg-white text-gray-900 placeholder-gray-400 border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm font-[var(--font-geist-mono)] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y leading-relaxed transition-shadow"
              />
              {transcript.length > 0 && (
                <p className="text-xs text-gray-400 text-right">{transcript.length.toLocaleString()} characters</p>
              )}
            </div>

            <button
              onClick={analyze}
              disabled={!author.trim() || !transcript.trim()}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm"
            >
              Analyse →
            </button>
          </div>
        )}

        {/* ── Loading ── */}
        {(step === "loading" || step === "committing") && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-16 flex flex-col items-center gap-5">
            <div className="w-9 h-9 border-[3px] border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-gray-800 font-medium text-sm">
                {step === "loading" ? "Analysing transcript…" : "Committing to GitHub…"}
              </p>
              {step === "loading" && streamedChars > 0 ? (
                <p className="text-indigo-500 text-xs mt-1 font-[var(--font-geist-mono)]">
                  {streamedChars.toLocaleString()} characters received…
                </p>
              ) : (
                <p className="text-gray-400 text-xs mt-1">
                  {step === "loading" ? "Long transcripts can take 30–60 seconds." : "Writing files and updating history…"}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 2: Review ── */}
        {step === "review" && (
          <div className="space-y-4">

            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep("input")}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-1"
              >
                ← Back to input
              </button>
              <button
                onClick={commit}
                disabled={!canCommit}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors"
              >
                Commit {active.length} segment{active.length !== 1 ? "s" : ""} →
              </button>
            </div>

            {/* Validation notices */}
            {hasUnresolved && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm">
                <span>⚠</span> Resolve all conflicts before committing.
              </div>
            )}
            {hasMissingSlugs && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm">
                <span>⚠</span> Assign a slug to all new features before committing.
              </div>
            )}
            {!canCommit && active.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-2">All segments skipped.</p>
            )}

            {/* Segment cards */}
            {segments.map((seg, i) => {
              const ov = overrides[seg.id] ?? {};
              const cancelled = ov.cancelled ?? false;
              const isSplitting = split?.id === seg.id;
              const currentPath = ov.target_path_override ?? seg.target_path;
              const searchQuery = fileSearch[seg.id] ?? "";
              const fileSuggestions = searchQuery.length > 1
                ? allFiles.filter((f) => f.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 8)
                : [];

              return (
                <div
                  key={seg.id}
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
                    cancelled ? "opacity-40 border-gray-200" : "border-gray-200"
                  }`}
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-100">
                    <span className="text-xs text-gray-400 font-[var(--font-geist-mono)]">
                      Segment {i + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge label={seg.classification} className={CLASSIFICATION_BADGE[seg.classification] ?? "bg-gray-100 text-gray-700"} />
                      <Badge label={seg.operation.replace(/_/g, " ")} className={OP_BADGE[seg.operation] ?? "bg-gray-100 text-gray-700"} />
                      {!cancelled && (
                        <button
                          onClick={() => {
                            const mid = Math.floor(seg.text.length / 2);
                            const splitAt = seg.text.indexOf(" ", mid);
                            const point = splitAt > 0 ? splitAt : mid;
                            setSplit({ id: seg.id, textA: seg.text.slice(0, point).trim(), textB: seg.text.slice(point).trim() });
                          }}
                          className="text-xs text-gray-400 hover:text-indigo-600 transition-colors"
                        >
                          Split
                        </button>
                      )}
                      <button
                        onClick={() => patch(seg.id, { cancelled: !cancelled })}
                        className="text-xs text-gray-400 hover:text-red-600 ml-1 transition-colors"
                      >
                        {cancelled ? "Restore" : "Skip"}
                      </button>
                    </div>
                  </div>

                  {!cancelled && (
                    <div className="px-5 py-4 space-y-3.5">

                      {/* Split editor */}
                      {isSplitting ? (
                        <div className="space-y-3 bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                          <p className="text-xs font-semibold text-indigo-700">Split into two segments — edit each part</p>
                          <textarea
                            value={split.textA}
                            onChange={(e) => setSplit({ ...split, textA: e.target.value })}
                            rows={3}
                            className="w-full bg-white text-gray-900 border border-indigo-200 rounded-lg px-3 py-2 text-xs leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <textarea
                            value={split.textB}
                            onChange={(e) => setSplit({ ...split, textB: e.target.value })}
                            rows={3}
                            className="w-full bg-white text-gray-900 border border-indigo-200 rounded-lg px-3 py-2 text-xs leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={confirmSplit}
                              disabled={!split.textA.trim() || !split.textB.trim()}
                              className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-medium px-4 py-1.5 rounded-lg transition-colors"
                            >
                              Confirm split
                            </button>
                            <button
                              onClick={() => setSplit(null)}
                              className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 border border-gray-200 rounded-lg"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-800 leading-relaxed">{seg.text}</p>
                      )}

                      {/* Target path with search */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                          <span className="text-gray-400 text-xs shrink-0">→</span>
                          <span className="text-xs font-[var(--font-geist-mono)] text-gray-600 break-all leading-relaxed flex-1">
                            {currentPath}
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            value={searchQuery}
                            onFocus={ensureFiles}
                            onChange={(e) => setFileSearch((prev) => ({ ...prev, [seg.id]: e.target.value }))}
                            placeholder="Search to change target file…"
                            className="w-full bg-white text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400"
                          />
                          {fileSuggestions.length > 0 && (
                            <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-md mt-1 max-h-48 overflow-y-auto">
                              {fileSuggestions.map((f) => (
                                <button
                                  key={f}
                                  onClick={() => {
                                    patch(seg.id, { target_path_override: f });
                                    setFileSearch((prev) => ({ ...prev, [seg.id]: "" }));
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-[var(--font-geist-mono)] text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors truncate"
                                >
                                  {f}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* New slug input */}
                      {seg.needs_new_slug && (
                        <div className="space-y-1.5">
                          <label className="block text-xs font-semibold text-amber-700">
                            Feature slug required
                          </label>
                          <input
                            type="text"
                            value={ov.assigned_slug ?? ""}
                            onChange={(e) => patch(seg.id, { assigned_slug: e.target.value })}
                            placeholder="e.g. qr-checkin"
                            className="w-full bg-amber-50 text-gray-900 placeholder-amber-400 border border-amber-300 rounded-lg px-3 py-2 text-xs font-[var(--font-geist-mono)] focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                      )}

                      {/* Conflict block */}
                      {seg.conflicts.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                            <span>⚠</span> Conflict detected
                          </p>
                          {seg.conflicts.map((c, ci) => (
                            <div key={ci} className="space-y-1.5">
                              <p className="text-xs text-amber-900">{c.description}</p>
                              {c.current_text && (
                                <pre className="bg-white border border-amber-200 rounded-lg p-2.5 text-xs font-[var(--font-geist-mono)] text-gray-700 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                  {c.current_text}
                                </pre>
                              )}
                            </div>
                          ))}
                          <div className="flex gap-4 pt-1">
                            {(["update", "client-specific", "cancel"] as const).map((opt) => (
                              <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="radio"
                                  name={`conflict-${seg.id}`}
                                  value={opt}
                                  checked={ov.conflict_resolution === opt}
                                  onChange={() => patch(seg.id, { conflict_resolution: opt })}
                                  className="accent-indigo-600"
                                />
                                <span className="text-xs text-gray-800 font-medium capitalize">
                                  {opt.replace("-", " ")}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Reasoning toggle */}
                      <button
                        onClick={() => toggleExpand(seg.id)}
                        className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1.5 transition-colors"
                      >
                        <span>{expanded.has(seg.id) ? "▾" : "▸"}</span>
                        AI reasoning
                      </button>
                      {expanded.has(seg.id) && (
                        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3.5 py-2.5 leading-relaxed">
                          {seg.reasoning}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Bottom commit bar */}
            <div className="pt-2 flex justify-end border-t border-gray-200">
              <button
                onClick={commit}
                disabled={!canCommit}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium px-6 py-2.5 rounded-lg transition-colors"
              >
                Commit {active.length} segment{active.length !== 1 ? "s" : ""} →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Done ── */}
        {step === "done" && result && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center space-y-4">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center text-2xl mx-auto">✅</div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Committed</h2>
              <p className="text-gray-500 text-sm mt-1">
                {result.fileCount} file{result.fileCount !== 1 ? "s" : ""} updated in the knowledge base.
              </p>
            </div>
            <p className="text-xs font-[var(--font-geist-mono)] text-gray-400 bg-gray-50 rounded-lg px-4 py-2 break-all">
              {result.transcriptPath}
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={() => { setStep("input"); setTranscript(""); setSegments([]); setOverrides({}); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                Add more
              </button>
              <Link
                href="/"
                className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
              >
                Home
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
