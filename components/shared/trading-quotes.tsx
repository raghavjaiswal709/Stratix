"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const quotes = [
  "Cut your losses short and let your winners run.",
  "Plan your trade and trade your plan.",
  "The trend is your friend until the end when it bends.",
  "Don't try to catch a falling knife.",
  "Buy the rumor, sell the news.",
  "Bulls make money, bears make money, pigs get slaughtered.",
  "The goal of a successful trader is to make the best trades. Money is secondary.",
  "Amateurs think about how much money they can make. Professionals think about how much money they could lose.",
  "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.",
  "In trading, the impossible happens about twice a year.",
  "Risk no more than 1% of your total capital on any one trade.",
  "There are old traders and there are bold traders, but there are very few old, bold traders.",
  "Hope is a bogus emotion that only costs you money.",
  "Never add to a losing position.",
  "Losses are the tuition you pay to learn how to trade.",
  "Patience is a virtue, especially in trading.",
  "The hardest thing to do in trading is to do nothing.",
  "Don't trade to make money, trade to make good trades.",
  "The market can remain irrational longer than you can remain solvent.",
  "If you don't know who you are, the market is an expensive place to find out.",
  "Do more of what works and less of what doesn't.",
  "A peak performance trader is totally committed to being the best and doing whatever it takes to be the best.",
  "A good trade is one that was executed well, regardless of the outcome.",
  "Discipline is doing what you hate to do, but doing it like you love it.",
  "Every day I assume every position I have is wrong.",
  "The elements of good trading are: 1. Cutting losses, 2. Cutting losses, and 3. Cutting losses.",
  "The core of trading is risk management.",
  "It is better to be out of the market wishing you were in, than in the market wishing you were out.",
  "Trading is 80% psychology and 20% mechanics.",
  "Don't marry a trade.",
  "A losing trade doesn't mean you are a loser.",
  "If you can't take a small loss, sooner or later you will take the mother of all losses.",
  "Always use a stop loss.",
  "Markets are never wrong, opinions often are.",
  "You don't need to know what is going to happen next in order to make money.",
  "Accept your losses without anger.",
  "Let the market come to you.",
  "A successful trader studies the market, an unsuccessful trader studies the money.",
  "Trade what you see, not what you think.",
  "The secret to being successful from a trading perspective is to have an indefatigable and an undying and unquenchable thirst for information and knowledge.",
  "Never let a winning trade turn into a loser.",
  "Consistency is the key to trading success.",
  "Focus on the process, not the outcome.",
  "Emotion is the enemy of a trader.",
  "Simplicity is the ultimate sophistication in trading.",
  "There is a time to go long, a time to go short and a time to go fishing.",
  "Trading is a business. Treat it like one.",
  "Your edge is the only thing that separates you from a gambler.",
  "Only enter a trade when the odds are overwhelmingly in your favor.",
  "Protect your capital at all costs.",
  "Don't focus on making money, focus on protecting what you have.",
  "The best trades are the ones you never make.",
  "If a trade feels uncomfortable, it's probably the right thing to do.",
  "You have to learn how to lose before you can learn how to win.",
  "The biggest risk is not taking any risk.",
  "A trading strategy is only as good as the trader executing it.",
  "Don't let yesterday's mistakes ruin today's opportunities.",
  "Every mistake is a learning opportunity.",
  "Don't overtrade.",
  "A bored trader is a dangerous trader.",
  "A disciplined trader is a profitable trader.",
  "Trading is not a get-rich-quick scheme.",
  "Success in trading comes from hard work, not luck.",
  "If you fail to plan, you plan to fail.",
  "Don't trade the money, trade the chart.",
  "The market does not care about you or your feelings.",
  "Fear and greed are the two emotions that drive the market.",
  "Be fearful when others are greedy, and greedy when others are fearful.",
  "The trend is your friend.",
  "Never average down.",
  "A margin call is the market's way of telling you you're wrong.",
  "Trading is a marathon, not a sprint.",
  "There is no holy grail in trading.",
  "The best indicator is price.",
  "Volume precedes price.",
  "A breakout is only valid if it holds.",
  "A false breakout is a strong signal.",
  "Trade the reaction, not the news.",
  "Buy support, sell resistance.",
  "Always have a reason for taking a trade.",
  "Never trade based on hope.",
  "A successful trader is a master of their own emotions.",
  "Don't chase a trade.",
  "If you miss a trade, let it go. There will always be another one.",
  "Patience pays.",
  "A trader must be able to change their mind.",
  "Don't be stubbornly bearish or bullish.",
  "Flexibility is a trader's best asset.",
  "Trading is a probability game.",
  "You can't control the market, but you can control your reaction to it.",
  "The most important organ in trading is the brain, not the balls.",
  "A clear mind is essential for trading.",
  "Don't trade when you are emotional, tired, or sick.",
  "Taking a break from trading is sometimes the best trade you can make.",
  "Review your trades to learn from them.",
  "Keep a trading journal.",
  "A trading journal is your best teacher.",
  "Always be learning.",
  "The market is a harsh teacher.",
  "Respect the market."
];

export function TradingQuotesModal() {
  const [show, setShow] = useState(false);
  const [quote, setQuote] = useState("");

  useEffect(() => {
    // Only show once per session or per app load
    // Using sessionStorage makes it show when app loads newly in a tab
    const hasSeenQuote = sessionStorage.getItem("hasSeenQuote");
    if (!hasSeenQuote) {
      const randomIndex = Math.floor(Math.random() * quotes.length);
      const timer = setTimeout(() => {
        setQuote(quotes[randomIndex]);
        setShow(true);
      }, 0);
      sessionStorage.setItem("hasSeenQuote", "true");
      return () => clearTimeout(timer);
    }
  }, []);

  if (!show) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-violet-500/10 pointer-events-none" />
        
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="relative max-w-4xl w-full text-center"
        >
          <button
            onClick={() => setShow(false)}
            className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors hover:bg-white/10 rounded-full"
            aria-label="Close quote"
          >
            <X className="w-8 h-8" />
          </button>
          
          <div className="text-white relative">
            <span className="absolute -top-10 -left-6 text-indigo-500/30 text-8xl font-serif">&quot;</span>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
              {quote}
            </h1>
            <span className="absolute -bottom-10 -right-6 text-violet-500/30 text-8xl font-serif">&quot;</span>
          </div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-12"
          >
            <button
              onClick={() => setShow(false)}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium tracking-wide transition-all border border-white/10 hover:border-white/30 text-lg shadow-[0_0_40px_rgba(99,102,241,0.2)] hover:shadow-[0_0_60px_rgba(99,102,241,0.4)]"
            >
              Enter Dashboard
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
