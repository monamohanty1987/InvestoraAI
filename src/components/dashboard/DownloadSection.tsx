import { motion } from "framer-motion";
import { Download, FileJson, Code, BookOpen } from "lucide-react";

const downloads = [
  {
    icon: FileJson,
    title: "n8n Workflow JSON",
    description: "Complete financial agent workflow with News API, Alpha Vantage, Finnhub, Pinecone RAG, Telegram alerts, and Notion reporting.",
    file: "/downloads/n8n-financial-agent-workflow.json",
    filename: "n8n-financial-agent-workflow.json",
    size: "12 KB",
  },
  {
    icon: Code,
    title: "FastAPI + LangChain Agent",
    description: "Python backend with ReAct agent, LangGraph state machine, sentiment analysis, and Pinecone vector store integration.",
    file: "/downloads/fastapi-langchain-agent/main.py",
    filename: "main.py",
    size: "8 KB",
  },
  {
    icon: BookOpen,
    title: "Requirements & Setup",
    description: "Python dependencies and environment configuration for the FastAPI server.",
    file: "/downloads/fastapi-langchain-agent/requirements.txt",
    filename: "requirements.txt",
    size: "1 KB",
  },
  {
    icon: BookOpen,
    title: "README - Setup Guide",
    description: "Step-by-step instructions for configuring n8n, FastAPI, API keys, and all integrations.",
    file: "/downloads/fastapi-langchain-agent/README.md",
    filename: "README.md",
    size: "2 KB",
  },
];

export function DownloadSection() {
  return (
    <div className="space-y-6">
      <div className="bg-card border border-primary/20 rounded-lg p-5 glow-primary">
        <h3 className="font-mono text-sm text-primary mb-2">Configuration Required</h3>
        <p className="text-sm text-muted-foreground mb-4">
          After downloading, you need to configure the following in n8n:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
          {[
            "NEWS_API_KEY → newsapi.org",
            "ALPHA_VANTAGE_API_KEY → alphavantage.co",
            "FINNHUB_API_KEY → finnhub.io",
            "PINECONE_API_KEY → pinecone.io",
            "OPENAI_API_KEY → platform.openai.com",
            "TELEGRAM_BOT_TOKEN → @BotFather",
            "TELEGRAM_CHAT_ID → via getUpdates",
            "NOTION_DATABASE_ID → notion.so",
            "FASTAPI_URL → http://localhost:8000",
          ].map((item) => (
            <div key={item} className="flex items-center gap-2 text-muted-foreground bg-muted/50 px-3 py-1.5 rounded">
              <span className="text-primary">→</span> {item}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {downloads.map((item, i) => (
          <motion.a
            key={item.title}
            href={item.file}
            download={item.filename}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-card border border-border/50 rounded-lg p-5 hover:border-glow transition-all group block"
          >
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 rounded-md p-2">
                <item.icon className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h4 className="font-mono text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                  {item.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.description}</p>
                <div className="flex items-center gap-2 mt-3">
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span className="text-xs font-mono text-primary">{item.filename}</span>
                  <span className="text-xs font-mono text-muted-foreground">({item.size})</span>
                </div>
              </div>
            </div>
          </motion.a>
        ))}
      </div>
    </div>
  );
}
