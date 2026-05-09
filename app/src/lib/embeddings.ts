import VoyageAI from "voyageai";
import { supabase } from "./supabase";

const voyage = new VoyageAI({ apiKey: process.env.VOYAGE_API_KEY });

const EMBED_MODEL = "voyage-3-large";
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

export async function embedAndStore(filePath: string, content: string) {
  const chunks = chunkText(content);
  const { embeddings } = await voyage.embed({ input: chunks, model: EMBED_MODEL });

  await supabase.from("embeddings").delete().eq("file_path", filePath);

  const rows = chunks.map((chunk, i) => ({
    file_path: filePath,
    chunk_id: i,
    content: chunk,
    embedding: embeddings[i],
    updated_at: new Date().toISOString(),
  }));

  await supabase.from("embeddings").insert(rows);
}

export async function searchSimilar(query: string, limit = 12): Promise<{ file_path: string; content: string; similarity: number }[]> {
  const { embeddings } = await voyage.embed({ input: [query], model: EMBED_MODEL });
  const queryEmbedding = embeddings[0];

  const { data } = await supabase.rpc("match_embeddings", {
    query_embedding: queryEmbedding,
    match_count: limit,
  });

  return data ?? [];
}
