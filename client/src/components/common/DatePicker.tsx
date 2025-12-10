import React, { useState, useRef, useEffect } from 'react';
import dayjs from 'dayjs';

interface DatePickerProps {
  value: string; // YYYYMMDD 格式
  onChange: (date: string) => void;
  availableDates?: string[]; // YYYY-MM-DD 格式的可用日期
  placeholder?: string;
}

/**
 * 日历日期选择器组件
 */
export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  availableDates = [],
  placeholder = '选择日期',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value) {
      return dayjs(value, 'YYYYMMDD');
    }
    return dayjs();
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 转换可用日期为 Set 便于快速查找
  const availableDateSet = new Set(availableDates.map(d => d.replace(/-/g, '')));

  // 获取当月的日期网格
  const getDaysInMonth = () => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startDay = startOfMonth.day(); // 0-6, 0 是周日
    const daysInMonth = endOfMonth.date();

    const days: (dayjs.Dayjs | null)[] = [];
    
    // 填充月初空白
    for (let i = 0; i < startDay; i++) {
      days.push(null);
    }
    
    // 填充日期
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(currentMonth.date(i));
    }
    
    return days;
  };

  const handleDateClick = (date: dayjs.Dayjs) => {
    const dateStr = date.format('YYYYMMDD');
    onChange(dateStr);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    setCurrentMonth(currentMonth.subtract(1, 'month'));
  };

  const handleNextMonth = () => {
    setCurrentMonth(currentMonth.add(1, 'month'));
  };

  const isDateAvailable = (date: dayjs.Dayjs) => {
    if (availableDates.length === 0) return true;
    return availableDateSet.has(date.format('YYYYMMDD'));
  };

  const isToday = (date: dayjs.Dayjs) => {
    return date.format('YYYYMMDD') === dayjs().format('YYYYMMDD');
  };

  const isSelected = (date: dayjs.Dayjs) => {
    return date.format('YYYYMMDD') === value;
  };

  const displayValue = value
    ? dayjs(value, 'YYYYMMDD').format('YYYY-MM-DD')
    : placeholder;

  const days = getDaysInMonth();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  return (
    <div className="relative" ref={containerRef}>
      {/* 输入框 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
      >
        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>{displayValue}</span>
        <svg className={`w-4 h-4 text-gray-400 transition ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 日历弹出框 */}
      {isOpen && (
        <div className="absolute z-50 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-72">
          {/* 月份导航 */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={handlePrevMonth}
              className="p-1 hover:bg-gray-100 rounded transition"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="font-medium text-gray-900">
              {currentMonth.format('YYYY年MM月')}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1 hover:bg-gray-100 rounded transition"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* 星期标题 */}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                {day}
              </div>
            ))}
          </div>

          {/* 日期网格 */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="h-8" />;
              }

              const available = isDateAvailable(date);
              const today = isToday(date);
              const selected = isSelected(date);

              return (
                <button
                  key={date.format('YYYYMMDD')}
                  onClick={() => available && handleDateClick(date)}
                  disabled={!available}
                  className={`
                    h-8 w-8 rounded-full text-sm font-medium transition
                    flex items-center justify-center
                    ${selected
                      ? 'bg-blue-600 text-white'
                      : today
                      ? 'bg-blue-100 text-blue-600'
                      : available
                      ? 'hover:bg-gray-100 text-gray-900'
                      : 'text-gray-300 cursor-not-allowed'
                    }
                    ${available && availableDates.length > 0 && !selected
                      ? 'ring-1 ring-green-400'
                      : ''
                    }
                  `}
                >
                  {date.date()}
                </button>
              );
            })}
          </div>

          {/* 图例说明 */}
          {availableDates.length > 0 && (
            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full ring-1 ring-green-400"></span>
                有数据
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded-full bg-blue-600"></span>
                已选择
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DatePicker;
