import { NextRequest, NextResponse } from "next/server";
import { getFile, commitMultipleFiles } from "@/lib/github";
import { applyOperation, buildHistoryEntry, getHistoryPath, prependHistoryEntry } from "@/lib/markdown";
import type { ConfirmedSegment } from "@/lib/markdown";

export async function POST(req: NextRequest) {
  const { segments, author, transcript } = await req.json() as {
    segments: ConfirmedSegment[];
    author: string;
    transcript: string;
  };

  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const authorSlug = author.toLowerCase().replace(/\s+/g, "-");
  const transcriptPath = `transcripts/${ts.slice(0, 4)}/${ts.slice(5, 7)}/${ts}-${authorSlug}.md`;

  const fileCache: Record<string, string> = {};
  const active = segments.filter((s) => !s.cancelled && s.conflict_resolution !== "cancel");

  for (const segment of active) {
    const path = segment.assigned_slug
      ? segment.target_path.replace(/(features\/)([^/]+)(\/feature\.md)/, `$1${segment.assigned_slug}$3`)
      : segment.target_path;

    if (!(path in fileCache)) {
      fileCache[path] = (await getFile(path))?.content ?? "";
    }
    fileCache[path] = applyOperation(fileCache[path] || null, { ...segment, target_path: path });

    const histPath = getHistoryPath(path);
    if (!(histPath in fileCache)) {
      fileCache[histPath] = (await getFile(histPath))?.content ?? "";
    }
    fileCache[histPath] = prependHistoryEntry(
      fileCache[histPath] || null,
      buildHistoryEntry(segment, author, transcriptPath)
    );
  }

  const fileChanges = [
    {
      path: transcriptPath,
      content: `---\nauthor: ${author}\ndate: ${new Date().toISOString()}\n---\n\n${transcript}\n`,
    },
    ...Object.entries(fileCache).map(([path, content]) => ({ path, content })),
  ];

  const slugs = active
    .map((s) => s.assigned_slug || s.feature_slug || s.product_slug)
    .filter(Boolean)
    .slice(0, 3)
    .join(", ");

  await commitMultipleFiles(fileChanges, `ingest(${author}): ${slugs || "knowledge update"}`);

  return NextResponse.json({ success: true, transcriptPath, fileCount: fileChanges.length });
}
