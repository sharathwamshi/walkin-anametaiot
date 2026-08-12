import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { EventProvider } from "./context/EventContext.jsx";
import Layout from "./components/Layout.jsx";

import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Events from "./pages/Events.jsx";
import Candidates from "./pages/Candidates.jsx";
import FrontDesk from "./pages/FrontDesk.jsx";
import Tests from "./pages/TestLevels.jsx";
import LiveMonitor from "./pages/LiveMonitor.jsx";
import ManageQuestions from "./pages/ManageQuestions.jsx";
import Results from "./pages/Results.jsx";
import Settings from "./pages/Settings.jsx";
import WalkinRegister from "./pages/public/WalkinRegister.jsx";
import Assessment from "./pages/public/Assessment.jsx";
import PublicResults from "./pages/public/PublicResults.jsx";

function isAuthed() {
  return !!localStorage.getItem("awd_token");
}

function Private({ children }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  return (
    <EventProvider>
      <Layout>{children}</Layout>
    </EventProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Public, unauthenticated, QR-driven candidate routes */}
      <Route path="/walkin-register/:token" element={<WalkinRegister />} />
      <Route path="/assessment/:levelId" element={<Assessment />} />
      <Route path="/results/:levelId" element={<PublicResults />} />

      {/* Admin console */}
      <Route path="/" element={<Private><Dashboard /></Private>} />
      <Route path="/events" element={<Private><Events /></Private>} />
      <Route path="/candidates" element={<Private><Candidates /></Private>} />
      <Route path="/frontdesk" element={<Private><FrontDesk /></Private>} />
      <Route path="/tests" element={<Private><Tests /></Private>} />
      <Route path="/tests/:levelId/live" element={<Private><LiveMonitor /></Private>} />
      <Route path="/tests/:levelId/questions" element={<Private><ManageQuestions /></Private>} />
      <Route path="/results" element={<Private><Results /></Private>} />
      <Route path="/settings" element={<Private><Settings /></Private>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
