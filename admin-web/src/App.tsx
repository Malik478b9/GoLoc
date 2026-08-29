import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import DashboardPage from "./pages/Dashboard";
import CaptainsPage from "./pages/Captains";
import BookingsPage from "./pages/Bookings";
import IncidentsPage from "./pages/Incidents";
import DisputesPage from "./pages/Disputes";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="captains" element={<CaptainsPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="incidents" element={<IncidentsPage />} />
          <Route path="disputes" element={<DisputesPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
