"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ── Tree helpers ────────────────────────────────────────────────────────────

type TreeNode = {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: TreeNode[];
};

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const filePath of paths.sort()) {
    const parts = filePath.split("/");
    let level = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");
      let node = level.find((n) => n.name === part);

      if (!node) {
        node = { name: part, path: currentPath, type: isLast ? "file" : "dir", children: isLast ? undefined : [] };
        level.push(node);
      }
      if (!isLast) level = node.children!;
    }
  }

  return root;
}

// ── Tree sidebar ─────────────────────────────────────────────────────────────

function FileNode({ node, selected, onSelect, depth }: {
  node: TreeNode;
  selected: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);

  if (node.type === "file") {
    const isActive = selected === node.path;
    const label = node.name.replace(/\.md$/, "");
    return (
      <button
        onClick={() => onSelect(node.path)}
        className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors ${
          isActive ? "bg-indigo-50 text-indigo-700 font-medium" : "text-gray-700 hover:bg-gray-100"
        }`}
        style={{ paddingLeft: `${depth * 12 + 12}px` }}
      >
        <span className="opacity-50 text-xs">📄</span>
        <span className="truncate">{label}</span>
      </button>
    );
  }

  // Dir
  const isIndex = node.name === "_index" || node.name === "_meta";
  const icon = open ? "▾" : "▸";

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full text-left flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors font-medium"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="text-xs w-3 shrink-0">{icon}</span>
        <span className="opacity-60 text-xs">📁</span>
        <span className="truncate">{node.name}</span>
      </button>
      {open && (
        <div>
          {(node.children ?? [])
            .sort((a, b) => {
              if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <FileNode key={child.path} node={child} selected={selected} onSelect={onSelect} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/files")
      .then((r) => r.json())
      .then((data) => {
        if (data.files) setTree(buildTree(data.files));
      })
      .catch(() => setError("Failed to load file tree"))
      .finally(() => setLoading(false));
  }, []);

  const openFile = useCallback(async (path: string) => {
    setSelected(path);
    setFileLoading(true);
    setContent(null);
    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      const data = await res.json();
      setContent(data.content ?? "");
    } catch {
      setContent("Failed to load file.");
    } finally {
      setFileLoading(false);
    }
  }, []);

  const filteredTree = search.trim()
    ? buildTree(
        (function flatPaths(nodes: TreeNode[]): string[] {
          return nodes.flatMap((n) => n.type === "file" ? [n.path] : flatPaths(n.children ?? []));
        })(tree).filter((p) => p.toLowerCase().includes(search.toLowerCase()))
      )
    : tree;

  const breadcrumbs = selected?.split("/") ?? [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-4 shrink-0">
        <Link href="/" className="text-zinc-400 hover:text-white text-sm transition-colors shrink-0">← Home</Link>
        <div className="w-px h-4 bg-zinc-700" />
        <h1 className="text-white text-sm font-semibold">Knowledge Base</h1>
      </header>

      <div className="flex flex-1 overflow-hidden h-[calc(100vh-57px)]">

        {/* Sidebar */}
        <aside className="w-72 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-1">
            {loading && <p className="text-xs text-gray-400 px-4 py-3">Loading…</p>}
            {error && <p className="text-xs text-red-500 px-4 py-3">{error}</p>}
            {filteredTree.map((node) => (
              <FileNode key={node.path} node={node} selected={selected} onSelect={openFile} depth={0} />
            ))}
          </div>
        </aside>

        {/* Content panel */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          {selected ? (
            <>
              {/* Breadcrumb */}
              <div className="px-8 py-4 border-b border-gray-100 flex items-center gap-1.5 text-xs text-gray-400 bg-white shrink-0">
                {breadcrumbs.map((crumb, i) => (
                  <span key={i} className="flex items-center gap-1.5">
                    {i > 0 && <span>/</span>}
                    <span className={i === breadcrumbs.length - 1 ? "text-gray-700 font-medium" : ""}>
                      {crumb.replace(/\.md$/, "")}
                    </span>
                  </span>
                ))}
              </div>

              <div className="flex-1 px-12 py-10">
                {fileLoading ? (
                  <div className="flex items-center gap-3 text-gray-400 text-sm">
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <div className="prose prose-gray prose-sm max-w-none
                    prose-headings:font-semibold prose-headings:text-gray-900
                    prose-h1:text-2xl prose-h2:text-lg prose-h3:text-base
                    prose-p:text-gray-700 prose-p:leading-relaxed
                    prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline
                    prose-code:text-indigo-700 prose-code:bg-indigo-50 prose-code:px-1 prose-code:rounded prose-code:text-xs
                    prose-pre:bg-gray-900 prose-pre:text-gray-100
                    prose-blockquote:border-l-indigo-400 prose-blockquote:text-gray-500
                    prose-table:text-sm prose-th:text-gray-900 prose-td:text-gray-700
                    prose-hr:border-gray-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {content ?? ""}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-20">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center text-2xl mb-5">📂</div>
              <h2 className="text-gray-900 font-semibold text-base mb-2">Select a file to read</h2>
              <p className="text-gray-500 text-sm max-w-xs leading-relaxed">
                Browse the knowledge base on the left. Click any file to render it here.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
