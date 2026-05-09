"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Message = { role: "user" | "assistant"; content: string };

function Citation({ text }: { text: string }) {
  const parts = text.split(/\[\[([^\]]+)\]\]/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span
            key={i}
            className="inline-flex items-center gap-1 font-[var(--font-geist-mono)] text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md px-1.5 py-0.5 mx-0.5 align-middle"
            title={part}
          >
            <span className="opacity-60 text-[10px]">📄</span>
            {part.split("/").pop()?.replace(".md", "")}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
          } catch { /* partial chunk */ }
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Check that embeddings have been seeded and all API keys are set." },
      ]);
    } finally {
      setStreaming(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">

      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-4 flex items-center gap-4 shrink-0">
        <Link href="/" className="text-zinc-400 hover:text-white text-sm transition-colors shrink-0">
          ← Home
        </Link>
        <div className="w-px h-4 bg-zinc-700" />
        <div>
          <h1 className="text-white text-sm font-semibold">Ask a Question</h1>
          <p className="text-zinc-400 text-xs mt-0.5">Answers cite their source files</p>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-4 py-24 text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-2xl mb-5">💬</div>
            <h2 className="text-gray-900 font-semibold text-base mb-2">Ask anything about Blink</h2>
            <p className="text-gray-500 text-sm max-w-sm leading-relaxed">
              Features, business decisions, client behaviours, product flows — the knowledge base is your source of truth.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center max-w-md">
              {[
                "How does badge printing work?",
                "What is the VIP registration flow?",
                "What products make up Blink?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="text-xs text-gray-600 bg-white border border-gray-200 rounded-full px-3 py-1.5 hover:border-indigo-400 hover:text-indigo-700 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs text-white font-bold shrink-0 mt-0.5">
                    H
                  </div>
                )}
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-tr-sm"
                      : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      <Citation text={msg.content || "…"} />
                      {streaming && i === messages.length - 1 && (
                        <span className="inline-block w-0.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle rounded-full" />
                      )}
                    </>
                  ) : (
                    msg.content
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 font-semibold shrink-0 mt-0.5">
                    U
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3 bg-gray-50 border border-gray-300 rounded-xl px-4 py-1 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
            placeholder="Ask a question about the Blink ecosystem…"
            disabled={streaming}
            className="flex-1 bg-transparent text-gray-900 placeholder-gray-400 text-sm py-2.5 focus:outline-none disabled:opacity-60"
          />
          <button
            onClick={send}
            disabled={!input.trim() || streaming}
            className="shrink-0 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white disabled:text-gray-400 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {streaming ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Thinking
              </span>
            ) : "Send"}
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">
          Press Enter to send · Answers are generated from the knowledge base
        </p>
      </div>
    </div>
  );
}
