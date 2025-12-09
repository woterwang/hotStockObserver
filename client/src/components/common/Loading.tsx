import React from 'react';

interface LoadingProps {
  text?: string;
}

/**
 * 加载中组件
 */
export const Loading: React.FC<LoadingProps> = ({ text = '加载中...' }) => {
  return (
    <div className="loading">
      <div className="flex flex-col items-center">
        <div className="loading-spinner"></div>
        <span className="mt-2 text-gray-500 text-sm">{text}</span>
      </div>
    </div>
  );
};

interface ErrorMessageProps {
  message: string;
  onRetry?: () => void;
}

/**
 * 错误提示组件
 */
export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, onRetry }) => {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="text-red-500 text-lg mb-2">⚠️ 出错了</div>
      <div className="text-gray-600 text-sm mb-4">{message}</div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          重试
        </button>
      )}
    </div>
  );
};

interface EmptyProps {
  message?: string;
}

/**
 * 空状态组件
 */
export const Empty: React.FC<EmptyProps> = ({ message = '暂无数据' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="text-gray-400 text-4xl mb-2">📭</div>
      <div className="text-gray-500 text-sm">{message}</div>
    </div>
  );
};
