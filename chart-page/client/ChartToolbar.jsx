import React from "react";

export function ChartToolbar({
  instrument,
  onInstrumentChange,
  timeframe,
  onTimeframeChange,
  seriesType,
  onSeriesTypeChange,
  onFitContent,
  onToggleFullscreen,
  isFullscreen,
  indicatorsOpen,
  setIndicatorsOpen
}) {
  const timeframes = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"];

  return (
    <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between mt-6 shrink-0 bg-[#161616] border border-[#1e1e1e] rounded-xl px-4 py-3 select-none text-left">
      
      {/* Left side controls: dropdown picker + timeframe tabs */}
      <div className="flex flex-wrap items-center gap-3">
        
        {/* Instrument Dropdown Selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest leading-none">Symbol:</span>
          <select 
            value={instrument}
            onChange={(e) => onInstrumentChange(e.target.value)}
            className="bg-[#0f0f0f] border border-[#1e1e1e] text-[11px] font-bold text-white rounded-lg px-3 py-2 outline-none focus:border-[#F0B90B]/50 transition-all duration-150 cursor-pointer"
          >
            <optgroup label="👑 Metals" className="bg-[#161616] text-zinc-300">
              <option value="xauusd">Gold (XAU/USD)</option>
              <option value="xagusd">Silver (XAG/USD)</option>
            </optgroup>
            
            <optgroup label="🇪🇺 Forex Majors" className="bg-[#161616] text-zinc-300">
              <option value="eurusd">EUR/USD</option>
              <option value="usdjpy">USD/JPY</option>
              <option value="gbpusd">GBP/USD</option>
              <option value="usdchf">USD/CHF</option>
              <option value="audusd">AUD/USD</option>
              <option value="usdcad">USD/CAD</option>
              <option value="nzdusd">NZD/USD</option>
            </optgroup>
            
            <optgroup label="₿ Cryptocurrencies" className="bg-[#161616] text-zinc-300">
              <option value="btcusd">Bitcoin (BTC/USD)</option>
              <option value="ethusd">Ethereum (ETH/USD)</option>
              <option value="ltcusd">Litecoin (LTC/USD)</option>
              <option value="xrpusd">Ripple (XRP/USD)</option>
              <option value="bnbusd">Binance Coin (BNB/USD)</option>
              <option value="solusd">Solana (SOL/USD)</option>
            </optgroup>
            
            <optgroup label="🔀 Forex Crosses" className="bg-[#161616] text-zinc-300">
              <option value="eurgbp">EUR/GBP</option>
              <option value="eurjpy">EUR/JPY</option>
              <option value="gbpjpy">GBP/JPY</option>
              <option value="audjpy">AUD/JPY</option>
              <option value="eurchf">EUR/CHF</option>
              <option value="gbpchf">GBP/CHF</option>
            </optgroup>
            
            <optgroup label="📈 Market Indices" className="bg-[#161616] text-zinc-300">
              <option value="spx500">S&P 500 (SPX500)</option>
              <option value="nasusd">NASDAQ 100 (NASUSD)</option>
              <option value="deuidxeur">DAX 40 (DEUIDXEUR)</option>
            </optgroup>
          </select>
        </div>

        <div className="w-px h-5 bg-[#1e1e1e] hidden sm:block" />

        {/* Timeframe Switcher Selector */}
        <div className="flex items-center gap-1">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={`text-[10px] font-black uppercase tracking-wider px-3.5 py-2 rounded-lg border transition-all duration-150 ${
                timeframe === tf
                  ? "bg-[#F0B90B] text-[#0f0f0f] border-[#F0B90B] shadow-[0_0_10px_rgba(240,185,11,0.15)]"
                  : "bg-[#0f0f0f]/40 text-zinc-400 border-[#1e1e1e] hover:text-zinc-200 hover:bg-[#0f0f0f]"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

      </div>

      {/* Right side controls: Chart Type, Indicators Toggle, Auto-fit, Fullscreen */}
      <div className="flex flex-wrap items-center gap-2.5">
        
        {/* Indicators Panel Toggle Button */}
        <button
          onClick={() => setIndicatorsOpen(!indicatorsOpen)}
          className={`text-[10px] font-black uppercase tracking-wider border rounded-lg px-3 py-2 flex items-center gap-1.5 transition-all duration-150 ${
            indicatorsOpen 
              ? "bg-[#F0B90B]/10 text-[#F0B90B] border-[#F0B90B]/20" 
              : "bg-[#0f0f0f]/40 text-zinc-400 border-[#1e1e1e] hover:text-zinc-200"
          }`}
        >
          <span>📊</span>
          <span>Indicators</span>
        </button>

        {/* Chart Type Segmented Control */}
        <div className="flex items-center bg-[#0f0f0f] border border-[#1e1e1e] rounded-lg p-0.5">
          {["Candles", "Line", "Area"].map((type) => (
            <button
              key={type}
              onClick={() => onSeriesTypeChange(type)}
              className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-md transition-all duration-150 ${
                seriesType === type
                  ? "bg-[#161616] text-[#F0B90B] border border-[#1e1e1e]"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Auto Fit Time Scale */}
        <button
          onClick={onFitContent}
          className="text-[10px] font-black uppercase tracking-wider bg-[#0f0f0f]/40 text-zinc-400 border border-[#1e1e1e] rounded-lg px-3 py-2 hover:text-zinc-200 hover:bg-[#0f0f0f] transition-all duration-150"
        >
          Auto Fit
        </button>

        {/* Fullscreen Toggle */}
        <button
          onClick={onToggleFullscreen}
          className={`text-[10px] font-black uppercase tracking-wider border rounded-lg px-3 py-2 flex items-center gap-1 transition-all duration-150 ${
            isFullscreen 
              ? "bg-indigo-600/10 text-indigo-400 border-indigo-500/20" 
              : "bg-[#0f0f0f]/40 text-zinc-400 border-[#1e1e1e] hover:text-zinc-200 hover:bg-[#0f0f0f]"
          }`}
        >
          <span>{isFullscreen ? "🗖" : "🗗"}</span>
          <span>{isFullscreen ? "Exit Full" : "Full Screen"}</span>
        </button>

      </div>

    </div>
  );
}
