import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage/LoginPage";
import ProjectsPage from "./pages/ProjectPage/ProjectsPage";
import EditorPage from "./pages/EditorPage/EditorPage";
import ProtectedRoute from "./components/ProtectedRoute";

function App() {
  return (
    <Routes>
      {/* Public route - login page */}
      <Route path="/login" element={<LoginPage />} />
      
      {/* Protected routes - require authentication */}
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <ProjectsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/editor/:companyId/:docType"
        element={
          <ProtectedRoute>
            <EditorPage />
          </ProtectedRoute>
        }
      />
      
      {/* Default redirect to login */}
      <Route path="*" element={<Navigate to="/login" />} />
    </Routes>
  );
}

export default App;
