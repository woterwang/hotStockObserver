import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage, StatsPage, StockDetailPage, BreakthroughPage, BacktestPage, SignalPage, VolumeSurgePage, BuySignalPage, ConceptResonancePage, HundredDayHighPage, HistoryConceptPage, BacktestAnalysisPage } from './pages';

function App() {
  return (
    <Router>
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
    </Router>
  );
}

export default App;