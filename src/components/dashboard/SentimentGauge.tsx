import { motion } from "framer-motion";

interface SentimentGaugeProps {
  score?: number; // -1 to +1 scale; falls back to 0.32 when absent
}

export function SentimentGauge({ score: scoreProp }: SentimentGaugeProps) {
  const score = scoreProp ?? 0.32;
  const angle = score * 90; // -90 to 90 degrees mapped from -1 to 1
  
  return (
    <div className="bg-card border border-border/50 rounded-lg p-5">
      <h3 className="font-mono text-sm text-muted-foreground mb-4">Market Sentiment</h3>
      <div className="flex items-center justify-center">
        <div className="relative w-48 h-28">
          {/* Arc background */}
          <svg viewBox="0 0 200 110" className="w-full h-full">
            <defs>
              <linearGradient id="sentGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="hsl(0, 72%, 55%)" />
                <stop offset="50%" stopColor="hsl(38, 92%, 55%)" />
                <stop offset="100%" stopColor="hsl(160, 100%, 50%)" />
              </linearGradient>
            </defs>
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="hsl(220, 15%, 18%)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke="url(#sentGradient)"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray="251"
              strokeDashoffset="0"
              opacity="0.6"
            />
            {/* Needle */}
            <motion.line
              x1="100"
              y1="100"
              x2="100"
              y2="30"
              stroke="hsl(190, 100%, 50%)"
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ rotate: -90 }}
              animate={{ rotate: angle }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              style={{ transformOrigin: "100px 100px" }}
            />
            <circle cx="100" cy="100" r="4" fill="hsl(190, 100%, 50%)" />
          </svg>
          <div className="absolute bottom-0 left-0 right-0 text-center">
            <span className="font-mono text-2xl font-bold text-positive">{score > 0 ? "+" : ""}{score.toFixed(2)}</span>
            <span className="block text-xs font-mono text-muted-foreground mt-1">
              {score > 0.2 ? "Bullish" : score < -0.2 ? "Bearish" : "Neutral"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
