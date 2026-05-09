import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GITHUB_OWNER!;
const repo = process.env.GITHUB_REPO!;

// GET /api/files          → full recursive tree (md files only)
// GET /api/files?path=... → single file content
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path");

  try {
    if (path) {
      // Return file content
      const res = await octokit.repos.getContent({ owner, repo, path, ref: "main" });
      if ("content" in res.data && res.data.type === "file") {
        const content = Buffer.from(res.data.content, "base64").toString("utf-8");
        return NextResponse.json({ type: "file", path, content });
      }
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }

    // Return recursive tree of .md files
    const { data } = await octokit.git.getTree({ owner, repo, tree_sha: "main", recursive: "1" });
    const files = (data.tree ?? [])
      .filter((f) => f.type === "blob" && f.path?.endsWith(".md") && !f.path.startsWith("app/"))
      .map((f) => f.path as string);

    return NextResponse.json({ type: "tree", files });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
