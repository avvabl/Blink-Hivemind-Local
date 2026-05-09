import { Octokit } from "@octokit/rest";

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const owner = process.env.GITHUB_OWNER!;
const repo = process.env.GITHUB_REPO!;
const branch = "main";

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

export async function commitMultipleFiles(
  files: { path: string; content: string }[],
  message: string
) {
  const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const latestSha = ref.object.sha;

  const { data: latestCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: latestSha });
  const baseTreeSha = latestCommit.tree.sha;

  const treeItems = await Promise.all(
    files.map(async (f) => {
      const { data: blob } = await octokit.git.createBlob({
        owner, repo,
        content: Buffer.from(f.content).toString("base64"),
        encoding: "base64",
      });
      return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    })
  );

  const { data: newTree } = await octokit.git.createTree({ owner, repo, base_tree: baseTreeSha, tree: treeItems });
  const { data: newCommit } = await octokit.git.createCommit({ owner, repo, message, tree: newTree.sha, parents: [latestSha] });
  await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha });
}
