import { BrowserRouter, Routes, Route } from 'react-router-dom';
import DesktopApp from './App';
import MobileApp from './Mobile';
import './index.css';

function Main() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DesktopApp />} />
        <Route path="/mobile" element={<MobileApp />} />
      </Routes>
    </BrowserRouter>
  );
}

export default Main;
