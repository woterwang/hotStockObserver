import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HomePage, StatsPage, StockDetailPage } from './pages';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/stock/:code" element={<StockDetailPage />} />
      </Routes>
    </Router>
  );
}

export default App;
