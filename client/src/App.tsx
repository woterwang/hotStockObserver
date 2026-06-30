import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Loading } from './components';
import HomePage from './pages/HomePage';

const StatsPage = lazy(() => import('./pages/StatsPage'));
const StockDetailPage = lazy(() => import('./pages/StockDetailPage'));
const BreakthroughPage = lazy(() => import('./pages/BreakthroughPage'));
const BacktestPage = lazy(() => import('./pages/BacktestPage'));
const SignalPage = lazy(() => import('./pages/SignalPage'));
const VolumeSurgePage = lazy(() => import('./pages/VolumeSurgePage'));
const BuySignalPage = lazy(() => import('./pages/BuySignalPage'));
const ConceptResonancePage = lazy(() => import('./pages/ConceptResonancePage'));
const HundredDayHighPage = lazy(() => import('./pages/HundredDayHighPage'));
const HistoryConceptPage = lazy(() => import('./pages/HistoryConceptPage'));
const BacktestAnalysisPage = lazy(() => import('./pages/BacktestAnalysisPage'));

const RouteLoading = () => (
  <div className="min-h-screen bg-gray-50">
    <Loading text="页面加载中..." />
  </div>
);

function App() {
  return (
    <Router>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/breakthrough" element={<BreakthroughPage />} />
          <Route path="/volume-surge" element={<VolumeSurgePage />} />
          <Route path="/buy-signal" element={<BuySignalPage />} />
          <Route path="/concept-resonance" element={<ConceptResonancePage />} />
          <Route path="/hundred-day-high" element={<HundredDayHighPage />} />
          <Route path="/history-concept" element={<HistoryConceptPage />} />
          <Route path="/backtest" element={<BacktestPage />} />
          <Route path="/backtest-analysis" element={<BacktestAnalysisPage />} />
          <Route path="/signals" element={<SignalPage />} />
          <Route path="/stock/:code" element={<StockDetailPage />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;