/**
 * 主线共振（Concept Resonance）策略 - 类型定义
 * 
 * 该模块定义了板块共振评分相关的所有类型
 */

/**
 * 板块共振评分明细
 */
export interface ConceptScoreDetail {
  /** 热度分 (0-20) - 基于板块在热度榜中的排名 */
  hotScore: number;
  /** 强度分 (0-15) - 基于板块强度值验证 */
  strengthScore: number;
  /** 地位分 (0-25) - 基于个股在板块中的龙头/成分股地位 */
  positionScore: number;
}

/**
 * 板块共振增强结果
 */
export interface ConceptEnhancementResult {
  /** 命中的热点概念列表 */
  hitHotConcepts: string[];
  /** 主概念名称（用于展示，选择规则：龙头所在概念 > 热度排名最高） */
  primaryConcept: string | null;
  /** 是否为龙头（在任意热点板块的 leading 列表中） */
  isConceptLeader: boolean;
  /** 龙头所属概念列表（可能在多个板块中都是龙头） */
  leaderInConcepts: string[];
  /** 板块共振评分 (0-60，设上限防止喧宾夺主) */
  conceptScore: number;
  /** 评分明细 */
  conceptScoreDetail: ConceptScoreDetail;
  /** 主概念涨停家数 */
  conceptLimitUpCount: number;
  /** 主概念涨跌幅 */
  conceptChangeRatio?: number;
  /** 主概念上涨家数比例 */
  conceptRiseRatio?: number;
}

/**
 * 概念候选项（用于主概念选择）
 */
export interface ConceptCandidate {
  /** 概念名称 */
  name: string;
  /** 热度排名 (1-20) */
  hotRank: number;
  /** 强度值 */
  strength: number;
  /** 原始概念数据 */
  concept: any;
  /** 是否为该概念的龙头 */
  isLeader: boolean;
}

/**
 * 主线共振策略配置
 */
export interface ConceptResonanceConfig {
  /** β 调节系数 - 控制板块共振分数在总分中的权重 */
  beta: number;
  /** 热度榜取前 N 个 */
  hotTopN: number;
  /** 强度榜取前 N 个 */
  strengthTopN: number;
  /** 深度扫描的候选股数量上限 */
  deepScanLimit: number;
  /** 并发请求数限制 */
  concurrencyLimit: number;
  /** 单次请求超时时间（毫秒） */
  requestTimeout: number;
}

/**
 * 默认配置
 */
export const DEFAULT_CONCEPT_RESONANCE_CONFIG: ConceptResonanceConfig = {
  beta: 0.5,
  hotTopN: 20,
  strengthTopN: 30,
  deepScanLimit: 50,
  concurrencyLimit: 5,
  requestTimeout: 10000,
};

/**
 * 热度榜缓存数据结构
 */
export interface HotConceptCacheItem {
  rank: number;
  name: string;
  code: string;
  changeRatio: number;
  hotRate: number;
  limitUpTag: string | null;
}

/**
 * 强度榜缓存数据结构
 */
export interface StrengthConceptCacheItem {
  name: string;
  code: string;
  strength: number;
  change: number;
  speed: number;
  turnover: number;
  mainNet: number;
}
