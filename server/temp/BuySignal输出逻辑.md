/api/buy-signal/generate 调用 逻辑：

好的，让我帮你完整梳理这个流程。先从路由和控制器开始追踪：

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/routes/index.ts)

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/routes/buySignalRoutes.ts)

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/controllers/buySignalController.ts#1-1)，行 1 到 100

现在我看到了完整的路由。让我继续看 `buySignalService` 的核心逻辑，特别是 `generateBuySignals` 和 `getTodaySignals`：

搜索文本 `getTodaySignals` (`**/buySignalService.ts`)，1 个结果

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/services/buySignalService.ts#1000-1000)，行 1000 到 1040

现在让我查看数据模型，了解 `BuySignal` 存储了什么：

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/models/BuySignal.ts#1-1)，行 1 到 100

现在让我看看 VolumeSurge 和 PriceBreakthrough 的数据是怎么来的：

搜索正则表达式 `VolumeSurge\.create|VolumeSurge\.insertMany|VolumeSurge\.bulkWrite` (`**/*.ts`)，无结果

搜索正则表达式 `volumeSurge.*save|\.save\(\)|bulkOps` (`**/*.ts`)，6 个结果

搜索文本 `scanAndSave` (`**/volumeSurgeService.ts`)，1 个结果

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/services/volumeSurgeService.ts#180-180)，行 180 到 300

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/services/volumeSurgeService.ts#300-300)，行 300 到 400

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/services/volumeSurgeService.ts#400-400)，行 400 到 500

现在让我检查 PriceBreakthrough 的数据来源：

搜索正则表达式 `PriceBreakthrough\.findOneAndUpdate|priceBreakthrough.*save` (`**/*.ts`)，3 个结果

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/services/priceBreakthroughService.ts#350-350)，行 350 到 450

现在让我看看 `scanPriceBreakthrough` 的逻辑：

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/services/priceBreakthroughService.ts#100-100)，行 100 到 200

读取 [](file:///d%3A/code/hot-stock-observer-source/server/src/services/priceBreakthroughService.ts#1-1)，行 1 到 100

现在我有足够信息了。让我为你整理完整的流程图：

---

## 完整流程梳理

### 🔴 问题所在

你的直觉是对的，**确实有混乱的地方**！让我把整个数据流画出来：

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        数据采集层 (T日 收盘后)                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────┐            ┌─────────────────────┐            │
│  │  volumeSurgeService │            │ priceBreakthroughService │       │
│  │     .scanAndSave()  │            │        .scanAndSave()     │       │
│  └──────────┬──────────┘            └───────────┬───────────┘          │
│             │                                    │                      │
│             ▼                                    ▼                      │
│  ┌────────────────────┐            ┌─────────────────────────┐         │
│  │     问财查询:       │            │        问财查询:         │         │
│  │  "T日涨幅>7%,       │            │  "day1涨幅>8%创188新高   │         │
│  │   成交额前200,      │            │   day2确认-3%~3%         │         │
│  │   上影线<5%..."     │            │   day3开盘>day2均价"     │         │
│  └──────────┬──────────┘            └───────────┬───────────┘          │
│             │                                    │                      │
│             ▼                                    ▼                      │
│  ┌────────────────────┐            ┌─────────────────────────┐         │
│  │   VolumeSurge 表    │            │   PriceBreakthrough 表   │         │
│  │   date: T日         │            │   date: T日 (day3)       │         │
│  │   strategyScore     │            │   turnoverRatio          │         │
│  └─────────────────────┘            └─────────────────────────┘         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 次日 (T+1)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     买入信号生成层 (T+1日 开盘前)                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  POST /api/buy-signal/generate  {"date": "T+1日"}                       │
│                         │                                               │
│                         ▼                                               │
│              buySignalService.generateBuySignals("T+1日")               │
│                         │                                               │
│                         ▼                                               │
│              selectionDate = getPrevTradingDay("T+1日") = T日           │
│                         │                                               │
│                         ▼                                               │
│              getAllCandidates(T日, ["volume_surge", "breakthrough"])    │
│                    ┌────┴────┐                                          │
│                    │         │                                          │
│                    ▼         ▼                                          │
│  ┌─────────────────────┐  ┌─────────────────────────┐                  │
│  │ getVolumeSurgeCand  │  │ getBreakthroughCand     │                  │
│  │ ates(T日)           │  │ idates(T日)             │                  │
│  │                     │  │                         │                  │
│  │ 条件:               │  │ 条件:                   │                  │
│  │ strategyScore >= 40 │  │ turnoverRatio >= 1.5    │                  │
│  └──────────┬──────────┘  └───────────┬─────────────┘                  │
│             │                          │                                │
│             └──────────┬───────────────┘                                │
│                        ▼                                                │
│              合并去重 (保留高分) → 14个候选                              │
│                        │                                                │
│                        ▼                                                │
│         对每个候选调用 generateSignalForStock()                          │
│                        │                                                │
│                        ▼                                                │
│              保存到 BuySignal 表                                         │
│              date: T+1日                                            
```

明白，目前的流程来看，与我的设计不符，设计的初衷是，这两个交易策略相互没有任务关系。我们先梳理“volume_surge`<br/>`放量突破”的流程：

1. 在 T 日收盘后，`volumeSurgeService.scanAndSave(T日)` 会运行，查询符合“放量上涨”条件的股票，并将结果保存到 `VolumeSurge` 表中，日期为 T 日。
2. 在 T+1 日开盘前，`buySignalService.generateBuySignals(T+1日)` 会运行，调用 `getVolumeSurgeCandidates(T日)` 来获取 T 日的放量上涨候选股票。
3. 对于每个候选股票，调用 `generateSignalForStock(stockCode, T+1日, 'volume_surge')` 来生成买入信号，并保存到 `BuySignal` 表中，日期为 T+1 日。

类似地，“price_breakthrough`<br/>`价格突破”的流程是：

1. 在 T 日收盘后，`priceBreakthroughService.scanAndSave(T日)` 会运行，查询符合“价格突破”条件的股票，并将结果保存到 `PriceBreakthrough` 表中，日期为 T 日。
2. 在 T+1 日开盘前，`buySignalService.generateBuySignals(T+1日)` 会运行，调用 `getPriceBreakthroughCandidates(T日)` 来获取 T 日的价格突破候选股票。
3. 对于每个候选股票，调用 `generateSignalForStock(stockCode, T+1日, 'breakthrough')` 来生成买入信号，并保存到 `BuySignal` 表中，日期为 T+1 日。
