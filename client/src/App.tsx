import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage, StatsPage, StockDetailPage, BreakthroughPage, BacktestPage, SignalPage, VolumeSurgePage } from './pages';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/breakthrough" element={<BreakthroughPage />} />
        <Route path="/volume-surge" element={<VolumeSurgePage />} />
        <Route path="/backtest" element={<BacktestPage />} />
        <Route path="/signals" element={<SignalPage />} />
        <Route path="/stock/:code" element={<StockDetailPage />} />
      </Routes>
    </Router>
  );
}

export default App;
