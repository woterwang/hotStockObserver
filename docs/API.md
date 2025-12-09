# API 接口文档

## 基础信息

- **Base URL**: `http://localhost:3000/api`
- **Content-Type**: `application/json`

## 响应格式

所有接口返回统一格式：

```json
{
  "success": true,
  "data": {},
  "message": "可选的消息",
  "total": 100,
  "page": 1,
  "pageSize": 20
}
```

---

## 市场接口

### 获取市场概览

获取包含指数、热搜股票、热门板块、强势股的综合数据。

**请求**

```
GET /api/market/overview
```

**响应**

```json
{
  "success": true,
  "data": {
    "indices": [...],
    "hotStocks": [...],
    "sectors": [...],
    "strongStocks": [...],
    "updateTime": "2024-12-04T10:30:00.000Z"
  }
}
```

---

### 获取大盘指数

**请求**

```
GET /api/market/indices
```

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | 否 | 日期，格式 YYYY-MM-DD |

**响应**

```json
{
  "success": true,
  "data": [
    {
      "indexCode": "000001",
      "indexName": "上证指数",
      "currentPoint": 3050.12,
      "changePercent": 0.85,
      "changePoint": 25.68,
      "volume": 2500,
      "turnover": 3500
    }
  ]
}
```

---

### 获取热门板块

**请求**

```
GET /api/market/sectors
```

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| date | string | 否 | 日期，格式 YYYY-MM-DD |
| limit | number | 否 | 返回数量，默认 10 |

**响应**

```json
{
  "success": true,
  "data": [
    {
      "sectorCode": "BK0001",
      "sectorName": "半导体",
      "changePercent": 3.25,
      "turnover": 50000000000,
      "leadingStocks": ["000001", "000002"]
    }
  ]
}
```

---

## 股票接口

### 获取热搜股票列表

**请求**

```
GET /api/stocks/hot
```

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量，默认 20 |
| date | string | 否 | 日期，格式 YYYY-MM-DD |

**响应**

```json
{
  "success": true,
  "data": [
    {
      "_id": "...",
      "date": "2024-12-04T00:00:00.000Z",
      "stockCode": "000001",
      "stockName": "平安银行",
      "currentPrice": 10.25,
      "changePercent": 2.35,
      "changeAmount": 0.24,
      "volume": 1500000,
      "turnover": 15000000,
      "rank": 1,
      "consecutiveDays": 3,
      "hotScore": 9500,
      "sector": "银行",
      "riseReason": "业绩预增",
      "concept": ["金融科技", "数字货币"]
    }
  ],
  "total": 20
}
```

---

### 获取阶段统计

获取N天内持续热搜的股票统计数据。

**请求**

```
GET /api/stocks/period-stats
```

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 统计天数，默认 7 |

**响应**

```json
{
  "success": true,
  "data": [
    {
      "stockCode": "000001",
      "stockName": "平安银行",
      "consecutiveDays": 5,
      "totalTurnover": 75000000,
      "avgTurnover": 15000000,
      "startPrice": 10.00,
      "endPrice": 10.50,
      "totalChangePercent": 5.00,
      "maxChangePercent": 3.50,
      "minChangePercent": -1.20,
      "avgRank": 5.2,
      "trendData": [
        {
          "date": "2024-12-01",
          "price": 10.00,
          "changePercent": 1.20,
          "turnover": 15000000,
          "rank": 5
        }
      ]
    }
  ],
  "total": 15,
  "days": 7
}
```

---

### 获取股票详情

**请求**

```
GET /api/stocks/:code
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 股票代码 |

**响应**

```json
{
  "success": true,
  "data": {
    "basic": {
      "stockCode": "000001",
      "stockName": "平安银行",
      "currentPrice": 10.25,
      "changePercent": 2.35,
      "rank": 1,
      "consecutiveDays": 3,
      "riseReason": "业绩预增"
    },
    "history": [...],
    "news": [...]
  }
}
```

---

### 获取股票历史记录

**请求**

```
GET /api/stocks/:code/history
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 股票代码 |

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| days | number | 否 | 天数，默认 30 |

---

### 获取强势股

获取成交额排名靠前且涨幅大于指定值的股票。

**请求**

```
GET /api/stocks/strong
```

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| minChange | number | 否 | 最小涨幅，默认 5 |
| limit | number | 否 | 返回数量，默认 10 |

---

### 搜索股票

**请求**

```
GET /api/stocks/search
```

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 是 | 搜索关键词（股票代码或名称） |
| limit | number | 否 | 返回数量，默认 20 |

---

### 获取股票新闻

**请求**

```
GET /api/stocks/:code/news
```

**路径参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 股票代码 |

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量，默认 20 |

---

## 管理接口

### 手动触发数据更新

**请求**

```
POST /api/admin/update
```

**响应**

```json
{
  "success": true,
  "message": "更新成功，共保存 20 条数据"
}
```

---

## 健康检查

**请求**

```
GET /api/health
```

**响应**

```json
{
  "success": true,
  "message": "Server is running",
  "timestamp": "2024-12-04T10:30:00.000Z"
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |
