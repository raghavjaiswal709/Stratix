"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { GraffitiLogo } from "./graffiti-logo";
import { HftBackground } from "./hft-background";
import { useAppContext } from "@/lib/context";

interface Quote {
  text: string;
  author: string;
}

// Curated, attributed wisdom from legendary traders, investors and thinkers.
// No anonymous clichés — every line earns its place.
const quotes: Quote[] = [
  // ── Jesse Livermore ──
  { text: "It was never my thinking that made the big money for me. It was my sitting. Men who can both be right and sit tight are uncommon.", author: "Jesse Livermore" },
  { text: "The market is never wrong — opinions often are.", author: "Jesse Livermore" },
  { text: "There is nothing new in Wall Street. Whatever happens has happened before and will happen again.", author: "Jesse Livermore" },
  { text: "The desire for constant action irrespective of underlying conditions is responsible for many losses on Wall Street.", author: "Jesse Livermore" },

  // ── Paul Tudor Jones ──
  { text: "Don't be a hero. Don't have an ego. The second you think you're very good, you're dead.", author: "Paul Tudor Jones" },
  { text: "Losers average losers.", author: "Paul Tudor Jones" },
  { text: "At the end of the day, the most important thing is how good you are at risk control.", author: "Paul Tudor Jones" },
  { text: "The secret is an unquenchable thirst for information and knowledge.", author: "Paul Tudor Jones" },

  // ── George Soros ──
  { text: "It's not whether you're right or wrong, but how much money you make when you're right and how much you lose when you're wrong.", author: "George Soros" },
  { text: "Money is made by discounting the obvious and betting on the unexpected.", author: "George Soros" },
  { text: "It's not about being right or wrong; it's about how much you make when right and how much you lose when wrong.", author: "Stanley Druckenmiller" },

  // ── Warren Buffett ──
  { text: "Be fearful when others are greedy, and greedy when others are fearful.", author: "Warren Buffett" },
  { text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett" },
  { text: "Risk comes from not knowing what you're doing.", author: "Warren Buffett" },
  { text: "Rule No. 1: Never lose money. Rule No. 2: Never forget Rule No. 1.", author: "Warren Buffett" },
  { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },

  // ── Charlie Munger ──
  { text: "The big money is not in the buying and the selling, but in the waiting.", author: "Charlie Munger" },
  { text: "It is remarkable how much long-term advantage people like us have gotten by trying to be consistently not stupid, instead of trying to be very intelligent.", author: "Charlie Munger" },
  { text: "Knowing what you don't know is more useful than being brilliant.", author: "Charlie Munger" },
  { text: "Invert, always invert.", author: "Charlie Munger" },

  // ── Ed Seykota ──
  { text: "The elements of good trading are: cutting losses, cutting losses, and cutting losses.", author: "Ed Seykota" },
  { text: "Win or lose, everybody gets what they want out of the market.", author: "Ed Seykota" },
  { text: "Risk no more than you can afford to lose, and also risk enough so that a win is meaningful.", author: "Ed Seykota" },

  // ── Stanley Druckenmiller ──
  { text: "The way to build long-term returns is through preservation of capital and home runs.", author: "Stanley Druckenmiller" },
  { text: "Never, ever invest in the present.", author: "Stanley Druckenmiller" },
  { text: "When you're right on something, you can't own enough.", author: "Stanley Druckenmiller" },

  // ── Bruce Kovner ──
  { text: "Whenever I enter a position, I have a predetermined stop. That's the only way I can sleep.", author: "Bruce Kovner" },
  { text: "Don't get caught in a position where you can lose a great deal of money for reasons you don't understand.", author: "Bruce Kovner" },

  // ── Richard Dennis ──
  { text: "You should expect the unexpected in this business; expect the extreme. Don't think in terms of boundaries.", author: "Richard Dennis" },
  { text: "I could publish my trading rules in the newspaper and no one would follow them. The key is consistency and discipline.", author: "Richard Dennis" },

  // ── Mark Douglas (Trading in the Zone) ──
  { text: "The consistency you seek is in your mind, not in the markets.", author: "Mark Douglas" },
  { text: "You don't need to know what's going to happen next to make money.", author: "Mark Douglas" },
  { text: "Anything can happen. Every moment in the market is unique.", author: "Mark Douglas" },

  // ── Marty Schwartz ──
  { text: "Learn to take losses. The most important thing in making money is not letting your losses get out of hand.", author: "Marty Schwartz" },
  { text: "I turned from a loser to a winner when I stopped caring about being right and started caring about making money.", author: "Marty Schwartz" },

  // ── Peter Lynch ──
  { text: "Know what you own, and know why you own it.", author: "Peter Lynch" },
  { text: "The key to making money in stocks is not to get scared out of them.", author: "Peter Lynch" },
  { text: "In this business, if you're good, you're right six times out of ten. You're never right nine times out of ten.", author: "Peter Lynch" },

  // ── Howard Marks ──
  { text: "You can't predict. You can prepare.", author: "Howard Marks" },
  { text: "The biggest investing errors come not from analysis, but from psychology.", author: "Howard Marks" },
  { text: "Being too far ahead of your time is indistinguishable from being wrong.", author: "Howard Marks" },

  // ── Ray Dalio ──
  { text: "He who lives by the crystal ball will eat shattered glass.", author: "Ray Dalio" },
  { text: "Pain plus reflection equals progress.", author: "Ray Dalio" },
  { text: "Truth — an accurate understanding of reality — is the essential foundation for any good outcome.", author: "Ray Dalio" },

  // ── Benjamin Graham ──
  { text: "The investor's chief problem, and even his worst enemy, is likely to be himself.", author: "Benjamin Graham" },
  { text: "In the short run the market is a voting machine, but in the long run it is a weighing machine.", author: "Benjamin Graham" },

  // ── Seth Klarman ──
  { text: "The single greatest edge an investor can have is a long-term orientation.", author: "Seth Klarman" },
  { text: "Value investing is the marriage of a contrarian streak and a calculator.", author: "Seth Klarman" },

  // ── Jim Rogers ──
  { text: "I just wait until there is money lying in the corner, and all I have to do is go over and pick it up.", author: "Jim Rogers" },
  { text: "Don't do anything until you know what you're doing.", author: "Jim Rogers" },

  // ── Bernard Baruch ──
  { text: "Don't try to buy at the bottom and sell at the top. It can't be done — except by liars.", author: "Bernard Baruch" },
  { text: "The main purpose of the stock market is to make fools of as many people as possible.", author: "Bernard Baruch" },

  // ── William O'Neil ──
  { text: "The whole secret to winning is to lose the least amount possible when you're not right.", author: "William O'Neil" },
  { text: "What seems too high and risky usually goes higher; what seems low and cheap usually goes lower.", author: "William O'Neil" },

  // ── Nassim Nicholas Taleb ──
  { text: "It is far more sound to be approximately right than precisely wrong.", author: "Nassim Nicholas Taleb" },
  { text: "Don't tell me what you think — tell me what you have in your portfolio.", author: "Nassim Nicholas Taleb" },

  // ── Philosophy & discipline ──
  { text: "Every battle is won before it is ever fought.", author: "Sun Tzu" },
  { text: "In the midst of chaos, there is also opportunity.", author: "Sun Tzu" },
  { text: "Luck is what happens when preparation meets opportunity.", author: "Seneca" },
  { text: "You have power over your mind — not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "I fear not the man who has practiced 10,000 kicks once, but the man who has practiced one kick 10,000 times.", author: "Bruce Lee" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
];

export function TradingQuotesModal() {
  const [show, setShow] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const { preferences } = useAppContext();

  useEffect(() => {
    // Hide if preferences specify showQuotes is false
    if (preferences?.showQuotes === false) {
      setShow(false);
      return;
    }
    // Show a fresh quote every time the dashboard mounts (each visit/navigation).
    const randomIndex = Math.floor(Math.random() * quotes.length);
    const timer = setTimeout(() => {
      setQuote(quotes[randomIndex]);
      setShow(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [preferences?.showQuotes]);

  if (!show || !quote) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-6"
      >
        <HftBackground />
        
        <motion.div 
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
          className="relative z-10 max-w-4xl w-full text-center"
        >
          <button
            onClick={() => setShow(false)}
            className="absolute -top-12 right-0 p-2 text-white/50 hover:text-white transition-colors hover:bg-white/10 rounded-full"
            aria-label="Close quote"
          >
            <X className="w-8 h-8" />
          </button>
          
          {/* Graffiti Stratix logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85, rotate: -6 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 14 }}
            className="flex justify-center mb-10 md:mb-14"
          >
            <GraffitiLogo size={64} drips className="md:scale-125" />
          </motion.div>

          <div className="text-white relative">
            <span className="absolute -top-10 -left-6 text-white/[0.08] text-8xl font-serif select-none">&quot;</span>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-[1.15] text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">
              {quote.text}
            </h1>
            <span className="absolute -bottom-10 -right-6 text-white/[0.06] text-8xl font-serif select-none">&quot;</span>
          </div>

          {/* Author attribution */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-white/30" />
            <span className="text-sm md:text-base font-medium uppercase tracking-[0.25em] text-white/55">
              {quote.author}
            </span>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-white/30" />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-10"
          >
            <button
              onClick={() => setShow(false)}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full font-medium tracking-wide transition-all border border-white/10 hover:border-white/30 text-lg shadow-[0_0_40px_rgba(255,255,255,0.06)] hover:shadow-[0_0_60px_rgba(255,255,255,0.12)]"
            >
              Enter Dashboard
            </button>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
