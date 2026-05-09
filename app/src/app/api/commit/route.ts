import { NextRequest, NextResponse } from "next/server";
import { getFile, commitMultipleFiles } from "@/lib/github";
import { applyOperation, buildHistoryEntry, getHistoryPath, prependHistoryEntry } from "@/lib/markdown";
import type { ConfirmedSegment } from "@/lib/markdown";

export async function POST(req: NextRequest) {
  try {
    const { segments, author, transcript } = await req.json() as {
      segments: ConfirmedSegment[];
      author: string;
      transcript: string;
    };

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const authorSlug = author.toLowerCase().replace(/\s+/g, "-");
    const transcriptPath = `transcripts/${ts.slice(0, 4)}/${ts.slice(5, 7)}/${ts}-${authorSlug}.md`;

    const active = segments.filter((s) => !s.cancelled && s.conflict_resolution !== "cancel");

    // Resolve target path for each segment
    const resolved = active.map((s) => ({
      segment: s,
      path: s.assigned_slug
        ? s.target_path.replace(/(features\/)([^/]+)(\/feature\.md)/, `$1${s.assigned_slug}$3`)
        : s.target_path,
    }));

    // Collect all unique paths, then fetch in parallel to stay under Netlify's timeout
    const uniquePaths = [...new Set(resolved.flatMap(({ path }) => [path, getHistoryPath(path)]))];
    const fetched = await Promise.all(uniquePaths.map(async (p) => [p, (await getFile(p))?.content ?? ""] as const));
    const fileCache: Record<string, string> = Object.fromEntries(fetched);

    // Apply operations sequentially (order matters for the same file)
    for (const { segment, path } of resolved) {
      fileCache[path] = applyOperation(fileCache[path] || null, { ...segment, target_path: path });
      const histPath = getHistoryPath(path);
      fileCache[histPath] = prependHistoryEntry(
        fileCache[histPath] || null,
        buildHistoryEntry(segment, author, transcriptPath)
      );
    }

    const fileChanges = [
      { path: transcriptPath, content: `---\nauthor: ${author}\ndate: ${new Date().toISOString()}\n---\n\n${transcript}\n` },
      ...Object.entries(fileCache).map(([path, content]) => ({ path, content })),
    ];

    const slugs = active.map((s) => s.assigned_slug || s.feature_slug || s.product_slug).filter(Boolean).slice(0, 3).join(", ");
    await commitMultipleFiles(fileChanges, `ingest(${author}): ${slugs || "knowledge update"}`);

    return NextResponse.json({ success: true, transcriptPath, fileCount: fileChanges.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[commit] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
