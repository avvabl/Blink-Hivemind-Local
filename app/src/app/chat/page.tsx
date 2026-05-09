"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Message = { role: "user" | "assistant"; content: string };

function Citation({ text }: { text: string }) {
  const parts = text.split(/\[\[([^\]]+)\]\]/g);
  return (
    <span>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className="inline-block font-mono text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 mx-0.5"
            title={part}
          >
            📄 {part.split("/").pop()}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    const next: Message[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value, { stream: true });
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const { text: chunk } = JSON.parse(payload);
            assistantText += chunk;
            setMessages((prev) => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: "assistant", content: assistantText };
              return copy;
            });
          } catch { /* ignore partial JSON */ }
        }
      }
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Check that embeddings have been seeded." },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white px-6 py-4 flex items-center gap-4">
        <Link href="/" className="text-slate-400 hover:text-white text-sm">← Home</Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Ask a Question</h1>
          <p className="text-slate-400 text-xs">Answers cite their source files</p>
        </div>
      </header>

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 flex flex-col py-6 gap-4">
        {messages.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center px-8">
            <p>Ask anything about the Blink ecosystem — features, decisions, client behaviour, or product design.</p>
          </div>
        )}

        <div className="flex-1 space-y-4 overflow-y-auto">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white rounded-br-sm"
                    : "bg-white border border-slate-200 text-slate-800 rounded-bl-sm"
                }`}
              >
                {msg.role === "assistant" ? (
                  <Citation text={msg.content || "…"} />
                ) : (
                  msg.content
                )}
                {msg.role === "assistant" && streaming && i === messages.length - 1 && (
                  <span className="inline-block w-1 h-4 bg-slate-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div className="flex gap-2 bg-white border border-slate-200 rounded-xl p-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask a question…"
            disabled={streaming}
            className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent placeholder-slate-400"
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white disabled:text-slate-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
