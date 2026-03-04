// ── InvestoraAI Chat Agent Widget ─────────────────────────────────────────────
// Floating bottom-right chat bubble with predefined Q&A.
// No backend needed — all answers are local (agent-faq.ts).

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, X, ChevronLeft, Bot, Sparkles } from "lucide-react";
import {
  FAQ_CATEGORIES,
  GREETING_MESSAGE,
  type FaqCategory,
  type FaqItem,
} from "@/lib/agent-faq";

// ── Types ─────────────────────────────────────────────────────────────────────
type View = "home" | "category" | "answer";

interface ChatMessage {
  role: "bot" | "user";
  text: string;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BotBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-1 flex-shrink-0 w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
        <Bot className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-foreground leading-relaxed max-w-[85%]">
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-primary/15 border border-primary/25 rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-primary-foreground leading-relaxed max-w-[85%]">
        {text}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function ChatAgent() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("home");
  const [activeCategory, setActiveCategory] = useState<FaqCategory | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "bot", text: GREETING_MESSAGE },
  ]);
  const [unread, setUnread] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Clear unread badge when opened
  useEffect(() => {
    if (open) setUnread(false);
  }, [open]);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSelectCategory = (cat: FaqCategory) => {
    setActiveCategory(cat);
    setView("category");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: `${cat.icon} ${cat.label}` },
      {
        role: "bot",
        text: `Here are some common questions about "${cat.label}". Tap one to see the answer:`,
      },
    ]);
  };

  const handleSelectQuestion = (item: FaqItem) => {
    setView("answer");
    setMessages((prev) => [
      ...prev,
      { role: "user", text: item.question },
      { role: "bot", text: item.answer },
      {
        role: "bot",
        text: "Was that helpful? You can ask another question or pick a different topic below.",
      },
    ]);
  };

  const handleBack = () => {
    if (view === "answer") {
      setView("category");
    } else {
      setView("home");
      setActiveCategory(null);
    }
  };

  const handleReset = () => {
    setView("home");
    setActiveCategory(null);
    setMessages([{ role: "bot", text: GREETING_MESSAGE }]);
  };

  return (
    <>
      {/* ── Floating Trigger Button ── */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {!open && (
            <motion.button
              key="trigger"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleOpen}
              className="relative w-14 h-14 rounded-full bg-primary shadow-lg shadow-primary/30 flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors"
              aria-label="Open chat assistant"
            >
              <MessageCircle className="w-6 h-6" />
              {/* Unread pulse dot */}
              {unread && (
                <span className="absolute top-1 right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-background animate-pulse" />
              )}
            </motion.button>
          )}
        </AnimatePresence>

        {/* ── Chat Panel ── */}
        <AnimatePresence>
          {open && (
            <motion.div
              key="panel"
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 24, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 340, damping: 28 }}
              className="absolute bottom-0 right-0 w-[340px] sm:w-[380px] h-[560px] flex flex-col rounded-2xl bg-background border border-border shadow-2xl shadow-black/50 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border flex-shrink-0">
                <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-none mb-0.5">
                    InvestoraAI Assistant
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                    Always online
                  </p>
                </div>
                {/* Back or Reset */}
                {view !== "home" && (
                  <button
                    onClick={handleBack}
                    className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Go back"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Messages Area */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                {messages.map((msg, i) =>
                  msg.role === "bot" ? (
                    <BotBubble key={i} text={msg.text} />
                  ) : (
                    <UserBubble key={i} text={msg.text} />
                  )
                )}
                <div ref={bottomRef} />
              </div>

              {/* ── Bottom Action Area ── */}
              <div className="flex-shrink-0 border-t border-border bg-card px-4 py-3 space-y-2">
                {/* HOME: category chips */}
                {view === "home" && (
                  <>
                    <p className="text-xs text-muted-foreground font-medium mb-2">
                      Choose a topic:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {FAQ_CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => handleSelectCategory(cat)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all text-left text-xs font-medium text-foreground"
                        >
                          <span className="text-base leading-none">{cat.icon}</span>
                          <span className="leading-tight">{cat.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* CATEGORY: question list */}
                {view === "category" && activeCategory && (
                  <>
                    <p className="text-xs text-muted-foreground font-medium mb-2">
                      {activeCategory.icon} {activeCategory.label}
                    </p>
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                      {activeCategory.items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => handleSelectQuestion(item)}
                          className="w-full text-left px-3 py-2 rounded-xl bg-muted/50 border border-border hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all text-xs text-foreground leading-snug"
                        >
                          {item.question}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* ANSWER: quick actions */}
                {view === "answer" && (
                  <div className="flex gap-2">
                    <button
                      onClick={handleBack}
                      className="flex-1 px-3 py-2 rounded-xl bg-muted/50 border border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all text-xs font-medium text-muted-foreground"
                    >
                      ← More questions
                    </button>
                    <button
                      onClick={handleReset}
                      className="flex-1 px-3 py-2 rounded-xl bg-muted/50 border border-border hover:border-primary/40 hover:bg-primary/10 hover:text-primary transition-all text-xs font-medium text-muted-foreground"
                    >
                      🏠 Start over
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
