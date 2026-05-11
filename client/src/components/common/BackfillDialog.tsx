import React, { useState } from 'react';
import dayjs from 'dayjs';

interface BackfillDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * 历史数据补录对话框
 */
export const BackfillDialog: React.FC<BackfillDialogProps> = ({
  isOpen,
  onClose,
}) => {
  const [startDate, setStartDate] = useState(() => dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(() => dayjs().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number; currentDate: string } | null>(null);
  const [result, setResult] = useState<{ success: number; failed: number; skipped: number } | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    if (!startDate || !endDate) {
      alert('请选择开始和结束日期');
      return;
    }

    if (dayjs(startDate).isAfter(dayjs(endDate))) {
      alert('开始日期不能晚于结束日期');
      return;
    }

    // 计算日期范围（排除周末）
    const dates: string[] = [];
    let current = dayjs(startDate);
    const end = dayjs(endDate);
    
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      const dayOfWeek = current.day();
      // 排除周六(6)和周日(0)
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        dates.push(current.format('YYYYMMDD'));
      }
      current = current.add(1, 'day');
    }

    if (dates.length === 0) {
      alert('所选日期范围内没有交易日');
      return;
    }

    if (dates.length > 60) {
      const confirm = window.confirm(`将补录 ${dates.length} 个交易日的数据，可能需要较长时间，是否继续？`);
      if (!confirm) return;
    }

    setLoading(true);
    setProgress({ current: 0, total: dates.length, currentDate: '' });
    setResult(null);

    let success = 0;
    let failed = 0;
    let skipped = 0;

    try {
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        setProgress({ current: i + 1, total: dates.length, currentDate: date });
        
        try {
          const response = await fetch('/api/volume-surge/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date }),
          });
          
          const data = await response.json();
          
          if (data.success) {
            if (data.data.count > 0) {
              success++;
            } else {
              skipped++;
            }
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
        
        // 添加延迟避免请求过快
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      setResult({ success, failed, skipped });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const handleClose = () => {
    if (loading) {
      const confirm = window.confirm('正在补录数据，确定要取消吗？');
      if (!confirm) return;
    }
    setResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />
      
      {/* 对话框 */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md transform transition-all">
          {/* 标题 */}
          <div className="px-6 py-4 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">历史数据补录</h3>
              <button
                onClick={handleClose}
                className="p-1 hover:bg-gray-100 rounded-full transition"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              选择日期范围，系统将自动扫描并保存历史数据用于回测
            </p>
          </div>

          {/* 内容 */}
          <div className="px-6 py-4 space-y-4">
            {!loading && !result && (
              <>
                {/* 日期选择 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      开始日期
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      max={endDate}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      结束日期
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      min={startDate}
                      max={dayjs().format('YYYY-MM-DD')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 快捷选择 */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setStartDate(dayjs().subtract(7, 'day').format('YYYY-MM-DD'));
                      setEndDate(dayjs().format('YYYY-MM-DD'));
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition"
                  >
                    近7天
                  </button>
                  <button
                    onClick={() => {
                      setStartDate(dayjs().subtract(30, 'day').format('YYYY-MM-DD'));
                      setEndDate(dayjs().format('YYYY-MM-DD'));
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition"
                  >
                    近30天
                  </button>
                  <button
                    onClick={() => {
                      setStartDate(dayjs().subtract(90, 'day').format('YYYY-MM-DD'));
                      setEndDate(dayjs().format('YYYY-MM-DD'));
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition"
                  >
                    近3个月
                  </button>
                  <button
                    onClick={() => {
                      setStartDate(dayjs().startOf('year').format('YYYY-MM-DD'));
                      setEndDate(dayjs().format('YYYY-MM-DD'));
                    }}
                    className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-full transition"
                  >
                    今年至今
                  </button>
                </div>

                {/* 提示 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div className="text-sm text-yellow-800">
                      <p className="font-medium">注意事项：</p>
                      <ul className="mt-1 list-disc list-inside space-y-1 text-yellow-700">
                        <li>自动跳过周末（非交易日）</li>
                        <li>每个交易日扫描间隔1秒</li>
                        <li>已有数据的日期会被覆盖</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 进度显示 */}
            {loading && progress && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-3">
                    <svg className="w-8 h-8 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-gray-900">正在补录数据...</p>
                  <p className="text-sm text-gray-500 mt-1">
                    正在处理: {dayjs(progress.currentDate, 'YYYYMMDD').format('YYYY-MM-DD')}
                  </p>
                </div>

                {/* 进度条 */}
                <div>
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>进度</span>
                    <span>{progress.current} / {progress.total}</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 结果显示 */}
            {result && (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-gray-900">补录完成！</p>
                </div>

                {/* 统计结果 */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-600">{result.success}</div>
                    <div className="text-xs text-green-700">成功</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-gray-600">{result.skipped}</div>
                    <div className="text-xs text-gray-700">无数据</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                    <div className="text-xs text-red-700">失败</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 底部按钮 */}
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
            {!loading && !result && (
              <>
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  开始补录
                </button>
              </>
            )}
            {result && (
              <button
                onClick={handleClose}
                className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition"
              >
                完成
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackfillDialog;
