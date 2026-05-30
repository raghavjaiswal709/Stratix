import React, { useState, useRef, useEffect } from "react";
import { useInstrumentPrice } from "./useInstrumentPrice.js";
import { INSTRUMENTS, formatPrice, formatSpread } from "./instrumentConfig.js";

function TableRow({ id, index, onSelect, isStarred, onToggleStar }) {
  const priceData = useInstrumentPrice(id);
  const inst = INSTRUMENTS[id];

  const [flash, setFlash] = useState(null);
  const prevPriceRef = useRef(null);
  const flashTimeoutRef = useRef(null);

  const mid = priceData?.mid ?? 0;
  const bid = priceData?.bid ?? 0;
  const ask = priceData?.ask ?? 0;
  const spread = priceData?.spread ?? 0;
  const change = priceData?.change ?? 0;
  const changePercent = priceData?.changePercent ?? 0;
  const isStale = priceData?.isStale ?? false;
  const timestamp = priceData?.timestamp;

  useEffect(() => {
    if (mid === 0 || isStale) return;
    if (prevPriceRef.current !== null && prevPriceRef.current !== mid) {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setFlash(mid > prevPriceRef.current ? "up" : "down");
      flashTimeoutRef.current = setTimeout(() => setFlash(null), 400);
    }
    prevPriceRef.current = mid;
  }, [mid, isStale]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, []);

  if (!inst) return null;

  const isUp = changePercent >= 0;
  const formattedPrice = priceData ? formatPrice(id, mid) : "...";
  const formattedBid = priceData ? formatPrice(id, bid) : "...";
  const formattedAsk = priceData ? formatPrice(id, ask) : "...";
  const formattedSpread = priceData ? formatSpread(id, spread) : "...";
  const formattedTime = timestamp 
    ? new Date(timestamp).toLocaleTimeString("en-US", { hour12: false }) 
    : "—";

  let rowBg = index % 2 === 0 ? "bg-[#161616]" : "bg-[#0f0f0f]";
  if (flash === "up") {
    rowBg = "bg-emerald-500/10 transition-colors";
  } else if (flash === "down") {
    rowBg = "bg-rose-500/10 transition-colors";
  }

  return (
    <tr 
      onClick={() => onSelect(id)}
      className={`border-b border-[#1e1e1e]/60 hover:bg-[#1c1c1c]/90 transition-colors cursor-pointer select-none ${rowBg} ${
        isStale ? "opacity-45" : ""
      }`}
    >
      <td className="px-4 py-3 text-left">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleStar(id);
          }}
          className={`mr-3.5 text-[14px] transition-colors relative z-10 ${
            isStarred ? "text-amber-500 hover:text-amber-400" : "text-zinc-600 hover:text-zinc-400"
          }`}
          aria-label={isStarred ? "Starred" : "Unstarred"}
        >
          {isStarred ? "★" : "☆"}
        </button>
        <span className="text-[14px] mr-2.5 filter drop-shadow">{inst.icon}</span>
        <span className="text-[12px] font-black text-white tracking-wide">{inst.name}</span>
        <span className="text-[8px] font-extrabold text-zinc-500 uppercase tracking-widest ml-2 bg-[#1e1e1e] border border-white/5 px-1.5 py-0.5 rounded">
          {inst.group}
        </span>
      </td>
      <td className="px-4 py-3 font-mono font-black text-zinc-100 text-right text-[12px] tracking-tight">{formattedPrice}</td>
      <td className="px-4 py-3 font-mono text-zinc-300 text-right text-[12px] tracking-tight">{formattedBid}</td>
      <td className="px-4 py-3 font-mono text-zinc-300 text-right text-[12px] tracking-tight">{formattedAsk}</td>
      <td className="px-4 py-3 font-mono text-[#F0B90B] font-bold text-right text-[12px] tracking-tight">{formattedSpread}</td>
      <td className={`px-4 py-3 font-mono font-bold text-right text-[12px] tracking-tight ${isUp ? "text-emerald-400" : "text-rose-500"}`}>
        {isUp ? "+" : ""}{change.toFixed(inst.type === "jpy" ? 3 : 5)}
      </td>
      <td className={`px-4 py-3 font-mono font-bold text-right text-[12px] tracking-tight ${isUp ? "text-emerald-400" : "text-rose-500"}`}>
        {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{changePercent.toFixed(2)}%
      </td>
      <td className="px-4 py-3 font-mono text-zinc-500 text-right text-[11px]">{formattedTime}</td>
    </tr>
  );
}

export function TableView({ instruments, onSelect, watchlist, onToggleStar }) {
  const [sortField, setSortField] = useState("name");
  const [sortAsc, setSortAsc] = useState(true);

  const sortedInstruments = [...instruments].sort((a, b) => {
    let valA, valB;
    if (sortField === "name") {
      valA = a.name;
      valB = b.name;
    } else if (sortField === "group") {
      valA = a.group;
      valB = b.group;
    } else {
      valA = a.id;
      valB = b.id;
    }

    if (valA < valB) return sortAsc ? -1 : 1;
    if (valA > valB) return sortAsc ? 1 : -1;
    return 0;
  });

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  return (
    <div className="flex-1 w-full overflow-y-auto border border-[#1e1e1e] rounded-xl bg-[#0f0f0f] shadow-sm">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-20 bg-[#161616] border-b border-[#1e1e1e] text-[9px] font-black uppercase tracking-widest text-zinc-500 select-none">
          <tr>
            <th onClick={() => handleSort("name")} className="px-4 py-3 cursor-pointer hover:text-white transition-colors">
              Instrument {sortField === "name" ? (sortAsc ? "▲" : "▼") : ""}
            </th>
            <th className="px-4 py-3 text-right">Price</th>
            <th className="px-4 py-3 text-right">Bid</th>
            <th className="px-4 py-3 text-right">Ask</th>
            <th className="px-4 py-3 text-right">Spread</th>
            <th className="px-4 py-3 text-right">Change</th>
            <th className="px-4 py-3 text-right">Change %</th>
            <th className="px-4 py-3 text-right">Last Update</th>
          </tr>
        </thead>
        <tbody>
          {sortedInstruments.map((inst, idx) => (
            <TableRow
              key={inst.id}
              id={inst.id}
              index={idx}
              onSelect={onSelect}
              isStarred={watchlist.includes(inst.id)}
              onToggleStar={onToggleStar}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
