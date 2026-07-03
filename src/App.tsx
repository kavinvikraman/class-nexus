import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import NotesInput from "./pages/NotesInput";
import SummaryPage from "./pages/SummaryPage";
import QuizPage from "./pages/QuizPage";
import ResultsPage from "./pages/ResultsPage";
import ClassroomPage from "./pages/ClassroomPage";
import ClassroomDashboard from "./pages/ClassroomDashboard";
import ClassroomQuizPage from "./pages/ClassroomQuizPage";
import ClassroomResultsPage from "./pages/ClassroomResultsPage";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import AIAssistant from "./pages/AIAssistant";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          
          {/* Protected app routes - require login */}
          <Route
            path="/notes"
            element={
              <ProtectedRoute>
                <NotesInput />
              </ProtectedRoute>
            }
          />
          <Route
            path="/summary"
            element={
              <ProtectedRoute>
                <SummaryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/quiz"
            element={
              <ProtectedRoute>
                <QuizPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/results"
            element={
              <ProtectedRoute>
                <ResultsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/ai-assistant"
            element={
              <ProtectedRoute>
                <AIAssistant />
              </ProtectedRoute>
            }
          />
          
          {/* Protected classroom routes */}
          <Route
            path="/classroom"
            element={
              <ProtectedRoute>
                <ClassroomPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classroom/dashboard"
            element={
              <ProtectedRoute>
                <ClassroomDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classroom/quiz"
            element={
              <ProtectedRoute>
                <ClassroomQuizPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/classroom/results"
            element={
              <ProtectedRoute>
                <ClassroomResultsPage />
              </ProtectedRoute>
            }
          />
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
