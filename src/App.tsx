import { Outlet, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { useTheme } from "./hooks/useTheme";
import { useFontSize } from "./hooks/useFontSize";
import "./App.css";

export default function App() {
  useTheme();
  useFontSize();

  if (sessionStorage.getItem("polaris_auth") !== "1") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
