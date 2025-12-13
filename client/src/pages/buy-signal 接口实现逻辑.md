┌──────────────────────────────────────────────────────────┐
│              回测流程 (修改后)                            │
├──────────────────────────────────────────────────────────┤
│  1. 从 BuySignal 查询数据                                │
│     - strategyType = 'volume_surge' (固定)               │
│     - buySignal in ['strong_buy', 'buy']                │
│     - totalBuyScore >= minStrategyScore                 │
│                                                          │
│  2. 计算每只股票的仓位                                    │
│     ┌─────────────────┬─────────────────┐               │
│     │ strong_buy      │ basePosition    │ (标准仓)       │
│     │ buy             │ basePosition/2  │ (半仓)         │
│     └─────────────────┴─────────────────┘               │
│                                                          │
│  3. 市场情绪修正                                          │
│     - 情绪 < marketMoodThreshold 时                      │
│       仓位再乘以 lowMoodPositionRatio (默认0.5)          │
│                                                          │
│  4. 执行回测 (止损/止盈/最大持仓天数)                      │
└──────────────────────────────────────────────────────────┘

信号日 (例: 2025-01-06)
    │
    ▼ 次日开盘买入
买入日 (2025-01-07) ─→ 买入价 = 开盘价
    │
    ▼ 持仓期间监控 (T+1 到 maxHoldDays)
    │
    ├─ 市场情绪恶化 (< 20) → 开盘卖出, exitReason='market_panic'
    ├─ 触发止损 (最低价 <= 止损价) → 按止损价卖出, exitReason='stop_loss'
    ├─ 触发止盈 (最高价 >= 止盈价) → 按止盈价卖出, exitReason='take_profit'
    └─ 达到最大持仓天数 → 收盘卖出, exitReason='max_days'