export interface Segment {
  id: string;
  text: string;
  target_path: string;
  section: string | null;
  operation: "append" | "update_section" | "create_file" | "create_client_override";
  product_slug: string;
  feature_slug: string | null;
  needs_new_slug: boolean;
  client_slug: string | null;
  classification: "new" | "update" | "client-specific" | "decision";
  conflicts: { description: string; current_text: string }[];
  reasoning: string;
}

export interface ConfirmedSegment extends Segment {
  conflict_resolution?: "update" | "client-specific" | "cancel" | null;
  assigned_slug?: string;
  cancelled?: boolean;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toTitle(slug: string) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function insertUnderSection(content: string, section: string, text: string): string {
  const lines = content.split("\n");
  const pat = new RegExp(`^#{2,}\\s+${escapeRegex(section)}`, "i");
  const idx = lines.findIndex((l) => pat.test(l.trim()));
  if (idx === -1) {
    return content.trimEnd() + `\n\n## ${section}\n\n${text.trim()}\n`;
  }
  let nextIdx = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^#{2,}\s/.test(lines[i])) { nextIdx = i; break; }
  }
  const before = lines.slice(0, nextIdx).join("\n").trimEnd();
  const after = lines.slice(nextIdx).join("\n");
  return before + "\n\n" + text.trim() + "\n" + (after ? "\n" + after : "");
}

function replaceSection(content: string, section: string, text: string): string {
  const lines = content.split("\n");
  const pat = new RegExp(`^#{2,}\\s+${escapeRegex(section)}`, "i");
  const idx = lines.findIndex((l) => pat.test(l.trim()));
  if (idx === -1) {
    return content.trimEnd() + `\n\n## ${section}\n\n${text.trim()}\n`;
  }
  let nextIdx = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^#{2,}\s/.test(lines[i])) { nextIdx = i; break; }
  }
  const before = lines.slice(0, idx + 1).join("\n");
  const after = lines.slice(nextIdx).join("\n");
  return before + "\n\n" + text.trim() + "\n" + (after ? "\n" + after : "");
}

function generateNewFile(segment: ConfirmedSegment, slug: string): string {
  const today = new Date().toISOString().split("T")[0];
  if (segment.operation === "create_client_override") {
    return `---
product: ${segment.product_slug}
feature: ${slug}
client: ${segment.client_slug ?? "unknown"}
override_type: feature-flag
status: active
last_updated: ${today}
---

# ${toTitle(slug)} — ${toTitle(segment.client_slug ?? "client")} Override

${segment.text.trim()}
`;
  }
  if (segment.classification === "decision") {
    return `---
type: decision
scope: ${segment.product_slug}
status: active
date: ${today}
---

# ${toTitle(slug)}

${segment.text.trim()}
`;
  }
  return `---
product: ${segment.product_slug}
feature: ${slug}
status: live
clients_with_overrides: []
related: []
tags: []
last_updated: ${today}
---

# ${toTitle(slug)}

## Overview

${segment.text.trim()}

## Behaviors

<!-- Add -->

## Edge cases

<!-- Add -->
`;
}

export function applyOperation(currentContent: string | null, segment: ConfirmedSegment): string {
  const slug = segment.assigned_slug || segment.feature_slug || "unknown";
  if (!currentContent || segment.operation === "create_file" || segment.operation === "create_client_override") {
    return generateNewFile(segment, slug);
  }
  if (segment.operation === "append") {
    if (!segment.section) return currentContent.trimEnd() + "\n\n" + segment.text.trim() + "\n";
    return insertUnderSection(currentContent, segment.section, segment.text);
  }
  if (segment.operation === "update_section") {
    if (!segment.section) return currentContent.trimEnd() + "\n\n" + segment.text.trim() + "\n";
    return replaceSection(currentContent, segment.section, segment.text);
  }
  return currentContent;
}

export function getHistoryPath(targetPath: string): string {
  if (targetPath.endsWith("/feature.md")) return targetPath.replace("/feature.md", "/history.md");
  const dir = targetPath.substring(0, targetPath.lastIndexOf("/"));
  return `${dir}/history.md`;
}

export function buildHistoryEntry(segment: ConfirmedSegment, author: string, transcriptPath: string): string {
  const date = new Date().toISOString().split("T")[0];
  const summary = segment.text.replace(/\n/g, " ").slice(0, 120) + (segment.text.length > 120 ? "..." : "");
  return `## ${date} — ${author}
- **Section touched:** ${segment.section ?? "New file"}
- **Type:** ${segment.conflict_resolution ?? segment.classification}
- **Summary:** ${summary}
- **AI reasoning:** ${segment.reasoning}
- **Source:** [[${transcriptPath}]]

`;
}

export function prependHistoryEntry(currentHistory: string | null, entry: string): string {
  const header = `---
type: history
---

`;
  if (!currentHistory) return header + entry;
  const fm = currentHistory.indexOf("\n---\n", 4);
  if (fm !== -1) {
    return currentHistory.slice(0, fm + 5) + "\n" + entry + currentHistory.slice(fm + 5);
  }
  return header + entry + currentHistory;
}
