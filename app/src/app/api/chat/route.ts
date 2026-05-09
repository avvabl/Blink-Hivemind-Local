import { anthropic, CHAT_MODEL } from "@/lib/anthropic";
import { searchSimilar } from "@/lib/embeddings";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { messages } = await req.json();
  const lastMessage = messages[messages.length - 1]?.content ?? "";

  const context = await searchSimilar(lastMessage, 12);

  const contextBlock = context
    .map((c) => `[[${c.file_path}]]\n${c.content}`)
    .join("\n\n---\n\n");

  const stream = await anthropic.messages.stream({
    model: CHAT_MODEL,
    max_tokens: 2048,
    system: `You are the Blink Hivemind assistant. Answer questions about the Blink product ecosystem using only the knowledge base excerpts provided. Always cite the source file for each claim using wikilink format: [[path/to/file.md]]. If the answer isn't in the excerpts, say so — do not guess.\n\nKNOWLEDGE BASE EXCERPTS:\n${contextBlock}`,
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`));
        }
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
