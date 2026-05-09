import { NextRequest, NextResponse } from "next/server";
import { anthropic, CATEGORIZE_MODEL } from "@/lib/anthropic";
import { getFile } from "@/lib/github";

const SYSTEM_PROMPT = `You are the Blink Hivemind ingestion assistant.

Your job is to read a transcript or document and produce a structured filing plan. You will:
1. Break the input into discrete segments — each segment is one coherent idea, feature detail, decision, or behavior.
2. For each segment, identify the best target file in the knowledge base and the section within that file.
3. Flag any content that appears to contradict or duplicate existing knowledge.
4. NEVER invent a feature slug. If the content refers to a feature that isn't in the taxonomy, set "needs_new_slug": true and leave "feature_slug" empty.

Return a JSON object matching this schema exactly:
{
  "segments": [
    {
      "id": "string (sequential: s1, s2, ...)",
      "text": "the relevant excerpt from the transcript",
      "target_path": "path relative to repo root, e.g. products/event-app/features/qr-checkin/feature.md",
      "section": "section heading to append under, or null if a new file",
      "operation": "append | update_section | create_file | create_client_override",
      "product_slug": "string",
      "feature_slug": "string or null",
      "needs_new_slug": true | false,
      "client_slug": "string or null",
      "classification": "new | update | client-specific | decision",
      "conflicts": [
        { "description": "what contradicts what", "current_text": "the existing text that conflicts" }
      ],
      "reasoning": "one sentence explaining why this segment belongs here"
    }
  ]
}`;

export async function POST(req: NextRequest) {
  const { transcript, taxonomy, author } = await req.json();

  if (!transcript || !author) {
    return NextResponse.json({ error: "transcript and author are required" }, { status: 400 });
  }

  const taxonomyFile = await getFile("_meta/taxonomy.md");

  const message = await anthropic.messages.create({
    model: CATEGORIZE_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `TAXONOMY (use this to identify valid product and feature slugs):\n${taxonomyFile?.content ?? taxonomy ?? "(none yet)"}\n\nTRANSCRIPT:\n${transcript}`,
      },
    ],
  });

  const raw = message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const plan = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    return NextResponse.json({ plan, author });
  } catch {
    return NextResponse.json({ error: "Failed to parse LLM response", raw }, { status: 500 });
  }
}
