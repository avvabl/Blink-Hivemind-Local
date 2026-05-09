import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const owner = process.env.GITHUB_OWNER!;
const repo = process.env.GITHUB_REPO!;
const branch = process.env.GITHUB_BRANCH ?? "main";

export async function getFile(path: string): Promise<{ content: string; sha: string } | null> {
  try {
    const res = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if ("content" in res.data && res.data.type === "file") {
      return {
        content: Buffer.from(res.data.content, "base64").toString("utf-8"),
        sha: res.data.sha,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function upsertFile(path: string, content: string, message: string, sha?: string) {
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString("base64"),
    branch,
    ...(sha ? { sha } : {}),
  });
}

export async function listDirectory(path: string): Promise<string[]> {
  try {
    const res = await octokit.repos.getContent({ owner, repo, path, ref: branch });
    if (Array.isArray(res.data)) {
      return res.data.map((f) => f.path);
    }
    return [];
  } catch {
    return [];
  }
}
