/*
 * @Author: Hot Stock Observer
 * @Date: 2025-12-20
 * @Description: 历史概念热搜页面
 */

import React, { useEffect, useState } from 'react';
import { Layout, Loading, ErrorMessage, } from '../components';
import HistoryConcept from '../components/stock/HistoryConceptTable';
import { marketApi } from '../services/api';
import type { ThsConceptHotRankResult, ThsConceptHotItem } from '../types';

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
        setError(response.message || '获取数据失败');
        setData(null);
        setConcepts([]);
      }
    } catch (err) {
      setError((err as Error).message);
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

  if (loading) {
    return (
      <Layout>
        <Loading text="正在加载日期列表..." />
      </Layout>
    );
  }

  if (error && !data) {
    return (
      <Layout>
        <ErrorMessage message={ error } onRetry={ fetchAvailableDates } />
      </Layout>
    );
  }

  return (
    <Layout>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">📅 历史热搜</h2>
      <HistoryConcept />
    </Layout>
  );
};

export default HistoryConceptPage;