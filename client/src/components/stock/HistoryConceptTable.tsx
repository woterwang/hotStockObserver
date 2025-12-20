/*
 * @Author: Hot Stock Observer
 * @Date: 2025-12-20
 * @Description: 历史概念热搜页面
 */

import React, { useEffect, useState } from 'react';
import { Loading, ErrorMessage, Empty, HotConceptTable, DatePicker } from '..';
import { marketApi } from '../../services/api';
import type { ThsConceptHotRankResult, ThsConceptHotItem } from '../../types';

/**
 * 历史概念热搜页面
 */
const HistoryConceptPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [conceptType, setConceptType] = useState<'concept' | 'industry'>('concept');
  const [data, setData] = useState<ThsConceptHotRankResult | null>(null);
  const [concepts, setConcepts] = useState<ThsConceptHotItem[]>([]);

  // 获取可用日期列表
  const fetchAvailableDates = async () => {
    try {
      setLoading(true);
      const response = await marketApi.getHistoryConceptDates();
      if (response.success) {
        setDates(response.data);
        if (response.data.length > 0) {
          setSelectedDate(response.data[0].toString().split('_')[0]);
        }
      } else {
        setError('获取日期列表失败');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 获取历史概念热度数据
  const fetchHistoryData = async () => {
    if (!selectedDate) return;

    try {
      setSaving(true);
      setError(null);
      const response = await marketApi.getHistoryConceptRank(selectedDate, conceptType);

      if (response.success) {
        setData(response.data);
        // 添加排名字段，并处理可能为null的字段
        const itemsWithRank = response.data.items.map((item, index) => ({
          ...item,
          rank: index + 1,
          hotTag: item.hotTag || '',
          limitUpTag: item.limitUpTag || ''
        }));
        setConcepts(itemsWithRank);
      } else {
        // setError(response.message || '获取数据失败');
        setData(null);
        setConcepts([]);
      }
    } catch (err) {
      // setError((err as Error).message);
      setData(null);
      setConcepts([]);
    } finally {
      setSaving(false);
    }
  };

  // 页面初始化
  useEffect(() => {
    fetchAvailableDates();
  }, []);

  // 日期或类型变化时重新获取数据
  useEffect(() => {
    if (selectedDate) {
      fetchHistoryData();
    }
  }, [selectedDate, conceptType]);

  // 处理日期选择变化
  const handleDateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDate(e.target.value);
  };

  // 处理类型选择变化
  const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setConceptType(e.target.value as 'concept' | 'industry');
  };

  // 重新加载数据
  const handleRefresh = () => {
    fetchHistoryData();
  };

  // 创建符合HotConceptTable要求的数据
  const getHotConcepts = (): any[] => {
    return concepts.map(concept => ({
      ...concept,
      hotTag: concept.hotTag || '',
      limitUpTag: concept.limitUpTag || ''
    }));
  };

  if (loading) {
    return (
      <Loading text="正在加载日期列表..." />
    );
  }

  if (error && !data) {
    return (
      <ErrorMessage message={ error } onRetry={ fetchAvailableDates } />
    );
  }

  return (
    <div className="card">
      {/* 筛选区域 */ }
      <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">日期:</label>
          <div className="w-40">
            <DatePicker
              value={ selectedDate }
              onChange={ (date) => setSelectedDate(date) }
              availableDates={ dates.map(date =>
                `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`
              ) }
              placeholder="选择日期"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">类型:</label>
          <select
            value={ conceptType }
            onChange={ handleTypeChange }
            disabled={ saving }
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="concept">概念板块</option>
            <option value="industry">行业板块</option>
          </select>
        </div>

        <button
          onClick={ handleRefresh }
          disabled={ saving }
          className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          { saving ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              加载中...
            </>
          ) : '刷新' }
        </button>
      </div>

      {/* 错误提示 */ }
      { error && (
        <div className="mb-4">
          <ErrorMessage message={ error } onRetry={ fetchHistoryData } />
        </div>
      ) }

      {/* 数据展示 */ }
      { !saving && concepts.length > 0 ? (
        <div className="overflow-hidden">
          <HotConceptTable concepts={ getHotConcepts() } showRank={ true } />
          <div className="mt-4 text-sm text-gray-500 text-right">
            数据来源: 本地缓存 | 更新时间: { new Date(data!.queryTime).toLocaleString() }
          </div>
        </div>
      ) : !saving && selectedDate ? (
        <Empty message="暂无数据" />
      ) : saving ? (
        <Loading text="正在加载数据..." />
      ) : null }
    </div>
  );
};

export default HistoryConceptPage;