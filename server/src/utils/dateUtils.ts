/**
 * 日期工具函数
 * 
 * ============= 重要规范 =============
 * 1. 数据库存储统一使用字符串格式 "YYYYMMDD"（如 "20251208"）
 * 2. 所有日期转换都通过本工具类的函数进行
 * 3. 避免时区问题，所有操作基于本地时间
 * 
 * 主要函数：
 * - toDateStr(value): 任意日期格式 → "YYYYMMDD"
 * - parseDate(str): "YYYYMMDD" 或 "YYYY-MM-DD" → Date
 * - formatDate(date, format): Date → 指定格式字符串
 * - createDateQuery/createDateRangeQuery: 创建兼容性 MongoDB 查询
 * - normalizeDbDate(value): 规范化数据库日期为字符串
 * =====================================
 */

/**
 * 将任意日期格式转换为数据库标准格式 "YYYYMMDD"
 * 这是最核心的函数，所有日期在存入数据库前都应通过此函数转换
 * 
 * @param value 输入日期，支持 Date对象、字符串(各种格式)、数字时间戳、null、undefined
 * @returns 标准格式字符串 "YYYYMMDD"，如果输入无效则返回空字符串
 * 
 * @example
 * toDateStr(new Date())           // "20251209"
 * toDateStr("2025-12-09")         // "20251209"
 * toDateStr("20251209")           // "20251209"
 * toDateStr(1733702400000)        // "20251209"
 * toDateStr(null)                 // ""
 */
export function toDateStr(value: Date | string | number | null | undefined): string {
  if (!value && value !== 0) return '';
  
  let d: Date;
  
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'number') {
    d = new Date(value);
  } else if (typeof value === 'string') {
    // 已经是 YYYYMMDD 格式
    if (/^\d{8}$/.test(value)) {
      return value;
    }
    // YYYY-MM-DD 格式
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value.replace(/-/g, '');
    }
    // YYYY/MM/DD 格式
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(value)) {
      return value.replace(/\//g, '');
    }
    // ISO 格式或其他，尝试解析
    d = new Date(value);
  } else {
    return '';
  }
  
  if (isNaN(d.getTime())) {
    return '';
  }
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  return `${year}${month}${day}`;
}

/**
 * 规范化从数据库读取的日期字段为字符串格式
 * 用于在读取数据后统一处理，解决数据库中 Date 和 String 混存的问题
 * 
 * @param value 数据库中的日期值（可能是 Date 或 string）
 * @returns 标准化的字符串 "YYYYMMDD"
 */
export function normalizeDbDate(value: any): string {
  return toDateStr(value);
}

/**
 * 格式化日期
 * @param date 日期对象
 * @param format 格式，支持 'YYYY-MM-DD' 或 'YYYYMMDD'
 */
export function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  if (format === 'YYYYMMDD') {
    return `${year}${month}${day}`;
  }
  return `${year}-${month}-${day}`;
}

/**
 * 获取今天的日期（零点）
 */
export function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * 获取N天前的日期
 */
export function getDaysAgo(days: number): Date {
  const date = getToday();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * 判断是否是交易日（简单判断：周一到周五）
 * 实际应用中应该使用交易日历
 */
export function isTradingDay(date: Date = new Date()): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

/**
 * 判断是否在交易时间内（9:30-11:30, 13:00-15:00）
 */
export function isTradingTime(date: Date = new Date()): boolean {
  if (!isTradingDay(date)) return false;
  
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const time = hours * 60 + minutes;
  
  // 9:30-11:30 或 13:00-15:00
  return (time >= 9 * 60 + 30 && time <= 11 * 60 + 30) ||
         (time >= 13 * 60 && time <= 15 * 60);
}

/**
 * 解析日期字符串（支持 YYYY-MM-DD 或 YYYYMMDD 格式）
 */
export function parseDate(dateStr: string): Date {
  let year: number, month: number, day: number;
  
  if (dateStr.includes('-')) {
    [year, month, day] = dateStr.split('-').map(Number);
  } else if (dateStr.length === 8) {
    year = parseInt(dateStr.substring(0, 4));
    month = parseInt(dateStr.substring(4, 6));
    day = parseInt(dateStr.substring(6, 8));
  } else {
    throw new Error(`Invalid date format: ${dateStr}`);
  }
  
  return new Date(year, month - 1, day);
}

/**
 * 获取日期范围内的所有日期
 */
export function getDateRange(startDate: Date, endDate: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * 获取下一个交易日
 * @param dateStr 当前日期，格式 YYYYMMDD
 * @returns 下一个交易日，格式 YYYYMMDD
 */
export function getNextTradingDay(dateStr: string): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() + 1);
  
  // 跳过周末
  while (!isTradingDay(date)) {
    date.setDate(date.getDate() + 1);
  }
  
  return formatDate(date, 'YYYYMMDD');
}

/**
 * 获取前一个交易日
 * @param dateStr 当前日期，格式 YYYYMMDD
 * @returns 前一个交易日，格式 YYYYMMDD
 */
export function getPrevTradingDay(dateStr: string): string {
  const date = parseDate(dateStr);
  date.setDate(date.getDate() - 1);
  
  // 跳过周末
  while (!isTradingDay(date)) {
    date.setDate(date.getDate() - 1);
  }
  
  return formatDate(date, 'YYYYMMDD');
}

/**
 * 获取今天的日期字符串（YYYYMMDD 格式）
 * @returns "YYYYMMDD"
 */
export function getTodayStr(): string {
  return toDateStr(new Date());
}

/**
 * 将 YYYYMMDD 格式转换为显示格式 YYYY-MM-DD
 * @param dateStr 标准格式字符串 "YYYYMMDD"
 * @returns 显示格式 "YYYY-MM-DD"
 */
export function toDisplayDate(dateStr: string | null | undefined): string {
  const normalized = toDateStr(dateStr);
  if (!normalized || normalized.length !== 8) return '';
  
  return `${normalized.substring(0, 4)}-${normalized.substring(4, 6)}-${normalized.substring(6, 8)}`;
}

/**
 * 获取指定日期之前/之后的日期字符串
 * @param dateStr 基准日期 "YYYYMMDD"
 * @param days 偏移天数，正数向后，负数向前
 * @returns "YYYYMMDD"
 */
export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/**
 * 比较两个日期字符串
 * @returns -1: a < b, 0: a == b, 1: a > b
 */
export function compareDateStr(a: string | null | undefined, b: string | null | undefined): number {
  const aStr = toDateStr(a) || '';
  const bStr = toDateStr(b) || '';
  
  if (aStr < bStr) return -1;
  if (aStr > bStr) return 1;
  return 0;
}

/**
 * 检查日期字符串是否在指定范围内（包含边界）
 * @param dateStr 待检查的日期
 * @param startStr 范围开始日期
 * @param endStr 范围结束日期
 * @returns boolean
 */
export function isDateInRange(dateStr: string, startStr: string, endStr: string): boolean {
  const d = toDateStr(dateStr);
  const start = toDateStr(startStr);
  const end = toDateStr(endStr);
  
  if (!d || !start || !end) return false;
  
  return d >= start && d <= end;
}

/**
 * 生成日期范围内的所有日期字符串数组
 * @param startStr 开始日期 "YYYYMMDD"
 * @param endStr 结束日期 "YYYYMMDD"
 * @returns 日期字符串数组
 */
export function getDateStrRange(startStr: string, endStr: string): string[] {
  const result: string[] = [];
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  
  if (start > end) return result;
  
  const current = new Date(start);
  while (current <= end) {
    result.push(toDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  
  return result;
}

// ============= MongoDB 日期查询兼容函数 =============
// 这些函数用于解决数据库中 Date 和 String 格式混存的问题
// 在数据迁移完成后，这些函数可以简化

/**
 * 为 MongoDB 查询创建兼容两种日期格式的查询条件
 * 
 * @param fieldName 日期字段名
 * @param dateStr 目标日期 "YYYYMMDD"
 * @returns MongoDB 查询条件
 * 
 * @example
 * const query = createDateQuery('date', '20251209');
 * // 返回: { $or: [{ date: "20251209" }, { date: { $gte: Date, $lte: Date } }] }
 */
export function createDateQuery(fieldName: string, dateStr: string): any {
  const normalized = toDateStr(dateStr);
  if (!normalized) return {};
  
  const dateObj = parseDate(normalized);
  
  // 为了兼容存储为 Date 类型的数据，创建当天的开始和结束时间
  const startOfDay = new Date(dateObj);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(dateObj);
  endOfDay.setHours(23, 59, 59, 999);
  
  return {
    $or: [
      { [fieldName]: normalized },  // 字符串格式
      { [fieldName]: { $gte: startOfDay, $lte: endOfDay } }  // Date 格式
    ]
  };
}

/**
 * 为 MongoDB 查询创建兼容两种日期格式的范围查询条件
 * 
 * @param fieldName 日期字段名
 * @param startStr 开始日期 "YYYYMMDD"（包含）
 * @param endStr 结束日期 "YYYYMMDD"（包含）
 * @returns MongoDB 查询条件
 * 
 * @example
 * const query = createDateRangeQuery('date', '20251201', '20251209');
 */
export function createDateRangeQuery(fieldName: string, startStr: string, endStr: string): any {
  const start = toDateStr(startStr);
  const end = toDateStr(endStr);
  
  if (!start || !end) return {};
  
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  
  // 结束日期的 23:59:59
  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  return {
    $or: [
      { [fieldName]: { $gte: start, $lte: end } },  // 字符串格式比较
      { [fieldName]: { $gte: startDate, $lte: endOfDay } }  // Date 格式比较
    ]
  };
}

/**
 * 为 MongoDB 查询创建兼容两种日期格式的多日期查询条件
 * 
 * @param fieldName 日期字段名
 * @param dateStrList 日期字符串数组 ["YYYYMMDD", ...]
 * @returns MongoDB 查询条件
 */
export function createMultiDateQuery(fieldName: string, dateStrList: string[]): any {
  if (!dateStrList || dateStrList.length === 0) return {};
  
  const stringDates = dateStrList.map(d => toDateStr(d)).filter(Boolean);
  
  // 生成所有日期的 Date 范围条件
  const dateRangeConditions = stringDates.map(dateStr => {
    const dateObj = parseDate(dateStr);
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(dateObj);
    endOfDay.setHours(23, 59, 59, 999);
    return { [fieldName]: { $gte: startOfDay, $lte: endOfDay } };
  });
  
  return {
    $or: [
      { [fieldName]: { $in: stringDates } },  // 字符串格式
      ...dateRangeConditions  // Date 格式
    ]
  };
}
