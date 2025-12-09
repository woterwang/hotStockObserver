/**
 * 日期工具函数
 */

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
