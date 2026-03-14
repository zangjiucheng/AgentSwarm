import { Navigate, Route, Routes } from "react-router"
import { DashboardPage } from "./pages/dashboard-page"

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
