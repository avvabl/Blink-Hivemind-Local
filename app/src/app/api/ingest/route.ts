import { NextRequest, NextResponse } from "next/server";
import { anthropic, CATEGORIZE_MODEL } from "@/lib/anthropic";
import { getFile } from "@/lib/github";

const SYSTEM_PROMPT = `You are the Blink Hivemind ingestion assistant.

Your job is to read a transcript or document and produce a structured filing plan. You will:
1. Break the input into discrete segments — each segment is one coherent idea, feature detail, decision, or behavior.
2. For each segment, identify the best target file in the knowledge base and the section within that file.
3. Flag any content that appears to contradict or duplicate existing knowledge.
4. NEVER invent a feature slug. If the content refers to a feature that isn't in the taxonomy, set "needs_new_slug": true and leave "feature_slug" empty.

IMPORTANT — granularity and compactness:
- Create a SEPARATE segment for EACH distinct feature, behavior, configuration option, or business decision. A transcript covering 10 features must produce at least 10 segments. DO NOT merge different topics into one segment.
- "text": write a SHORT 2–4 sentence summary. Do NOT copy verbatim.
- "reasoning": one sentence only.
- "conflicts[].current_text": max 2 sentences.

Return a JSON object matching this schema exactly:
{
  "segments": [
    {
      "id": "string (sequential: s1, s2, ...)",
      "text": "short 1-3 sentence summary of the content being filed",
      "target_path": "path relative to repo root, e.g. products/event-app/features/qr-checkin/feature.md",
      "section": "section heading to append under, or null if a new file",
      "operation": "append | update_section | create_file | create_client_override",
      "product_slug": "string",
      "feature_slug": "string or null",
      "needs_new_slug": true | false,
      "client_slug": "string or null",
      "classification": "new | update | client-specific | decision",
      "conflicts": [
        { "description": "what contradicts what", "current_text": "brief quote of conflicting existing text" }
      ],
      "reasoning": "one sentence explaining why this segment belongs here"
    }
  ]
}`;

export async function POST(req: NextRequest) {
  try {
    const { transcript, taxonomy, author } = await req.json();

    if (!transcript || !author) {
      return NextResponse.json({ error: "transcript and author are required" }, { status: 400 });
    }

    const taxonomyFile = await getFile("_meta/taxonomy.md");

    // Stream so Netlify never sees an idle connection.
    // The client accumulates raw text and parses JSON when the stream closes.
    const stream = anthropic.messages.stream({
      model: CATEGORIZE_MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `TAXONOMY:\n${taxonomyFile?.content ?? taxonomy ?? "(none yet)"}\n\nTRANSCRIPT:\n${transcript}`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const body = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[ingest] stream error:", msg);
          controller.enqueue(encoder.encode(`\n__ERROR__:${msg}`));
          controller.close();
        }
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ingest] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
