//+------------------------------------------------------------------+
//|  StratixEA.mq5                                                   |
//|  Stratix Trading Journal — Auto-Sync Expert Advisor              |
//|                                                                  |
//|  SETUP INSTRUCTIONS:                                             |
//|  1. Open MetaTrader 5 → MetaEditor (F4)                         |
//|  2. File → New → Expert Advisor (paste this code)               |
//|  3. Fill in STRATIX_WEBHOOK_URL, STRATIX_USER_ID, WEBHOOK_SECRET |
//|     (get these from your Stratix dashboard → Trades → Connect)  |
//|  4. Compile (F7)                                                 |
//|  5. In MT5: Tools → Options → Expert Advisors →                 |
//|     ✓ Allow WebRequest for listed URL                            |
//|     Add your Stratix webhook URL                                 |
//|  6. Drag EA onto ANY chart — it monitors all trades              |
//+------------------------------------------------------------------+

#property copyright   "Stratix"
#property version     "1.00"
#property description "Auto-syncs MT5 trades to Stratix Trading Journal"
#property strict

//--- Input parameters (fill these in from your Stratix dashboard)
input string STRATIX_WEBHOOK_URL = "https://YOUR_DOMAIN/api/trade/webhook";
input string STRATIX_USER_ID     = "YOUR_STRATIX_USER_ID";
input string WEBHOOK_SECRET      = "YOUR_WEBHOOK_SECRET";
input int    PING_INTERVAL_MIN   = 5;   // Ping Stratix every N minutes (connection status)
input bool   SYNC_HISTORY        = true; // Sync closed trade history on first attach

//--- Global state
datetime g_lastPingTime = 0;
bool     g_initialized  = false;

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("StratixEA: Initializing...");

   // Send a ping to verify connectivity
   if (!SendPing())
   {
      Print("StratixEA: WARNING — Could not reach Stratix webhook. Check URL and internet.");
   }
   else
   {
      Print("StratixEA: Connected to Stratix successfully!");
   }

   // Sync existing open positions
   SyncOpenPositions();

   // Optionally sync closed history (last 100 deals)
   if (SYNC_HISTORY)
      SyncClosedHistory();

   g_initialized = true;
   g_lastPingTime = TimeCurrent();

   EventSetTimer(60); // Run OnTimer every 60 seconds
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("StratixEA: Detached.");
}

//+------------------------------------------------------------------+
//| Timer — periodic ping + check open positions                     |
//+------------------------------------------------------------------+
void OnTimer()
{
   // Ping every PING_INTERVAL_MIN minutes
   if (TimeCurrent() - g_lastPingTime >= PING_INTERVAL_MIN * 60)
   {
      SendPing();
      g_lastPingTime = TimeCurrent();
   }
}

//+------------------------------------------------------------------+
//| Trade transaction event — fires on every trade state change      |
//+------------------------------------------------------------------+
void OnTradeTransaction(const MqlTradeTransaction& trans,
                        const MqlTradeRequest&     request,
                        const MqlTradeResult&      result)
{
   // We care about deal additions (fills) — either open or close
   if (trans.type != TRADE_TRANSACTION_DEAL_ADD) return;

   ulong dealTicket = trans.deal;
   if (dealTicket == 0) return;

   // Select the deal in history
   if (!HistoryDealSelect(dealTicket)) return;

   ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
   long dealType  = HistoryDealGetInteger(dealTicket, DEAL_TYPE);
   string symbol  = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
   double volume  = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
   double price   = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
   double profit  = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
   double swap    = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
   double comm    = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
   long   posId   = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
   datetime dealTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);

   string typeStr = (dealType == DEAL_TYPE_BUY) ? "buy" : "sell";
   string timeStr = TimeToString(dealTime, TIME_DATE | TIME_SECONDS);
   // Convert "YYYY.MM.DD HH:MM:SS" → ISO 8601
   StringReplace(timeStr, ".", "-");
   timeStr = StringSubstr(timeStr, 0, 10) + "T" + StringSubstr(timeStr, 11) + "Z";

   if (dealEntry == DEAL_ENTRY_IN)
   {
      // Trade opened
      // Find SL/TP from the open position
      double sl = 0, tp = 0;
      if (PositionSelectByTicket(posId))
      {
         sl = PositionGetDouble(POSITION_SL);
         tp = PositionGetDouble(POSITION_TP);
      }

      string payload = BuildPayload("trade_open",
         posId, symbol, typeStr, volume, price, 0,
         timeStr, "", 0, sl, tp, swap, comm);

      SendWebhook(payload, "trade_open");
   }
   else if (dealEntry == DEAL_ENTRY_OUT || dealEntry == DEAL_ENTRY_OUT_BY)
   {
      // Trade closed — find the open price from history
      double openPrice = GetOpenPrice(posId, symbol);
      string openTimeStr = GetOpenTime(posId);

      string payload = BuildPayload("trade_close",
         posId, symbol, typeStr, volume, openPrice, price,
         openTimeStr, timeStr, profit, 0, 0, swap, comm);

      SendWebhook(payload, "trade_close");
   }
}

//+------------------------------------------------------------------+
//| Build JSON payload string                                        |
//+------------------------------------------------------------------+
string BuildPayload(string action,
                    long ticket, string symbol, string type,
                    double lots, double openPrice, double closePrice,
                    string openTime, string closeTime, double profit,
                    double sl, double tp, double swap, double comm)
{
   string p = "{";
   p += "\"userId\":\"" + STRATIX_USER_ID + "\",";
   p += "\"secret\":\"" + WEBHOOK_SECRET + "\",";
   p += "\"action\":\"" + action + "\",";
   p += "\"ticket\":" + IntegerToString(ticket) + ",";
   p += "\"symbol\":\"" + symbol + "\",";
   p += "\"type\":\"" + type + "\",";
   p += "\"lots\":" + DoubleToString(lots, 2) + ",";
   p += "\"openPrice\":" + DoubleToString(openPrice, 5) + ",";

   if (closePrice > 0)
      p += "\"closePrice\":" + DoubleToString(closePrice, 5) + ",";

   p += "\"openTime\":\"" + openTime + "\",";

   if (closeTime != "")
      p += "\"closeTime\":\"" + closeTime + "\",";

   p += "\"profit\":" + DoubleToString(profit, 2) + ",";
   p += "\"stopLoss\":" + DoubleToString(sl, 5) + ",";
   p += "\"takeProfit\":" + DoubleToString(tp, 5) + ",";
   p += "\"swap\":" + DoubleToString(swap, 2) + ",";
   p += "\"commission\":" + DoubleToString(comm, 2);
   p += "}";
   return p;
}

//+------------------------------------------------------------------+
//| Send HTTP POST to webhook                                        |
//+------------------------------------------------------------------+
bool SendWebhook(string payload, string actionLabel)
{
   char   postData[];
   char   resultData[];
   string resultHeaders;

   StringToCharArray(payload, postData, 0, StringLen(payload));
   ArrayResize(postData, ArraySize(postData) - 1); // remove null terminator

   string headers = "Content-Type: application/json\r\n";
   int res = WebRequest("POST", STRATIX_WEBHOOK_URL, headers, 5000, postData, resultData, resultHeaders);

   if (res == -1)
   {
      Print("StratixEA: WebRequest failed for action=", actionLabel, " Error=", GetLastError());
      Print("StratixEA: IMPORTANT — Add ", STRATIX_WEBHOOK_URL, " to MT5 allowed WebRequest URLs!");
      Print("StratixEA: Go to: Tools → Options → Expert Advisors → Allow WebRequest");
      return false;
   }

   string resultStr = CharArrayToString(resultData);
   Print("StratixEA: [", actionLabel, "] Response: ", resultStr);
   return true;
}

//+------------------------------------------------------------------+
//| Send a ping to Stratix                                           |
//+------------------------------------------------------------------+
bool SendPing()
{
   string payload = "{\"userId\":\"" + STRATIX_USER_ID + "\",\"secret\":\"" + WEBHOOK_SECRET + "\",\"action\":\"ping\"}";
   return SendWebhook(payload, "ping");
}

//+------------------------------------------------------------------+
//| Sync all currently open positions                                |
//+------------------------------------------------------------------+
void SyncOpenPositions()
{
   int total = PositionsTotal();
   for (int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if (!PositionSelectByTicket(ticket)) continue;

      string symbol = PositionGetString(POSITION_SYMBOL);
      long   type   = PositionGetInteger(POSITION_TYPE);
      double vol    = PositionGetDouble(POSITION_VOLUME);
      double open   = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl     = PositionGetDouble(POSITION_SL);
      double tp     = PositionGetDouble(POSITION_TP);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);

      string typeStr = (type == POSITION_TYPE_BUY) ? "buy" : "sell";
      string openTimeStr = FormatTime(openTime);

      string payload = BuildPayload("trade_open",
         (long)ticket, symbol, typeStr, vol, open, 0,
         openTimeStr, "", 0, sl, tp, 0, 0);

      SendWebhook(payload, "sync_open");
   }
}

//+------------------------------------------------------------------+
//| Sync last N closed deals from history                            |
//+------------------------------------------------------------------+
void SyncClosedHistory()
{
   datetime from = TimeCurrent() - 90 * 24 * 3600; // last 90 days
   HistorySelect(from, TimeCurrent());

   int dealsTotal = HistoryDealsTotal();
   int count = 0;

   for (int i = dealsTotal - 1; i >= 0 && count < 100; i--)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if (ticket == 0) continue;

      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if (entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;

      long   type    = HistoryDealGetInteger(ticket, DEAL_TYPE);
      string symbol  = HistoryDealGetString(ticket, DEAL_SYMBOL);
      double volume  = HistoryDealGetDouble(ticket, DEAL_VOLUME);
      double price   = HistoryDealGetDouble(ticket, DEAL_PRICE);
      double profit  = HistoryDealGetDouble(ticket, DEAL_PROFIT);
      double swap    = HistoryDealGetDouble(ticket, DEAL_SWAP);
      double comm    = HistoryDealGetDouble(ticket, DEAL_COMMISSION);
      long   posId   = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      datetime dealTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);

      string typeStr    = (type == DEAL_TYPE_BUY) ? "buy" : "sell";
      string closeTimeStr = FormatTime(dealTime);
      double openPrice  = GetOpenPrice(posId, symbol);
      string openTimeStr = GetOpenTime(posId);

      string payload = BuildPayload("trade_close",
         posId, symbol, typeStr, volume, openPrice, price,
         openTimeStr, closeTimeStr, profit, 0, 0, swap, comm);

      SendWebhook(payload, "sync_history");
      count++;
   }
   Print("StratixEA: Synced ", count, " historical trades.");
}

//+------------------------------------------------------------------+
//| Get open price of a position from history                        |
//+------------------------------------------------------------------+
double GetOpenPrice(long posId, string symbol)
{
   int total = HistoryDealsTotal();
   for (int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if (ticket == 0) continue;
      if (HistoryDealGetInteger(ticket, DEAL_POSITION_ID) != posId) continue;
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if (entry == DEAL_ENTRY_IN)
         return HistoryDealGetDouble(ticket, DEAL_PRICE);
   }
   return 0;
}

//+------------------------------------------------------------------+
//| Get open time of a position from history                         |
//+------------------------------------------------------------------+
string GetOpenTime(long posId)
{
   int total = HistoryDealsTotal();
   for (int i = 0; i < total; i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if (ticket == 0) continue;
      if (HistoryDealGetInteger(ticket, DEAL_POSITION_ID) != posId) continue;
      ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
      if (entry == DEAL_ENTRY_IN)
      {
         datetime t = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
         return FormatTime(t);
      }
   }
   return FormatTime(TimeCurrent());
}

//+------------------------------------------------------------------+
//| Format datetime to ISO 8601                                      |
//+------------------------------------------------------------------+
string FormatTime(datetime t)
{
   string s = TimeToString(t, TIME_DATE | TIME_SECONDS);
   StringReplace(s, ".", "-");
   return StringSubstr(s, 0, 10) + "T" + StringSubstr(s, 11) + "Z";
}
//+------------------------------------------------------------------+
