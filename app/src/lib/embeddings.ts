import { supabase } from "./supabase";

const EMBED_MODEL = "voyage-3-large";
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    i += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

async function fetchEmbeddings(inputs: string[]): Promise<number[][]> {
  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: inputs, model: EMBED_MODEL }),
  });
  if (!res.ok) throw new Error(`Voyage API error: ${res.status}`);
  const json = await res.json() as { data: { embedding: number[]; index: number }[] };
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export async function embedAndStore(filePath: string, content: string) {
  const chunks = chunkText(content);
  const embeddings = await fetchEmbeddings(chunks);

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

export async function searchSimilar(
  query: string,
  limit = 12
): Promise<{ file_path: string; content: string; similarity: number }[]> {
  const [queryEmbedding] = await fetchEmbeddings([query]);

  const { data } = await supabase.rpc("match_embeddings", {
    query_embedding: queryEmbedding,
    match_count: limit,
  });

  return data ?? [];
}
