import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Shell from "./components/Shell";
import Dashboard from "./pages/Dashboard";
import FloorPlan from "./pages/FloorPlan";
import Reports from "./pages/Reports";
import Repairs from "./pages/Repairs";
import Panels from "./pages/Panels";
import Maintenance from "./pages/Maintenance";
import Suppliers from "./pages/Suppliers";
import Manage from "./pages/Manage";
import Login from "./pages/Login";
import { getUser } from "./lib/api";

function Guard({ children }: { children: React.ReactNode }) {
  if (!getUser()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Guard><Dashboard /></Guard>} />
          <Route path="/plan" element={<Guard><FloorPlan /></Guard>} />
          <Route path="/reports" element={<Guard><Reports /></Guard>} />
          <Route path="/repairs" element={<Guard><Repairs /></Guard>} />
          <Route path="/panels" element={<Guard><Panels /></Guard>} />
          <Route path="/maintenance" element={<Guard><Maintenance /></Guard>} />
          <Route path="/suppliers" element={<Guard><Suppliers /></Guard>} />
          <Route path="/manage" element={<Guard><Manage /></Guard>} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
