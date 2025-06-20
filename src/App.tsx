import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Home from './pages/Home';
import ExcalidrawDraw from './pages/ExcalidrawDraw';
import Premium from './pages/Premium';
import Leaderboard from './pages/Leaderboard';
import ArtGallery from './pages/ArtGallery';
import ArtDetail from './pages/ArtDetail';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Login from './pages/uiux/Login';
import Signup from './pages/uiux/Signup';
import ForgotPassword from './pages/uiux/ForgotPassword';
import Profile from './pages/Profile';
import UserProfile from './pages/UserProfile';
import BoosterPackDetail from './pages/BoosterPackDetail';
import Roadmap from './pages/Roadmap';
import RoadmapDetail from './pages/RoadmapDetail';
import LobbyScreen from './pages/uiux/LobbyScreen';
import PreRoundBriefingScreen from './pages/uiux/PreRoundBriefingScreen';
import DrawingCanvasScreen from './pages/uiux/DrawingCanvasScreen';
import VotingScreen from './pages/uiux/VotingScreen';
import ResultsScreen from './pages/uiux/ResultsScreen';
import PostGameScreen from './pages/uiux/PostGameScreen';
import AuthCallback from './pages/auth/AuthCallback';
import ResetPassword from './pages/auth/ResetPassword';
import { AuthProvider } from './context/AuthContext';
import { GameProvider } from './context/GameContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Seo from './components/utils/Seo';
import ScrollToTop from './components/utils/ScrollToTop';

function App() {
  return (
    <Router>
      {/* ScrollToTop component to handle scrolling to top on route change */}
      <ScrollToTop />
      
      {/* Default SEO that will be overridden by page-specific SEO */}
      <Seo 
        title="SketchyAF - The Wildly Entertaining Drawing Game"
        description="SketchyAF is a weird, wildly entertaining drawing game perfect for killing time anywhere. Join 60-second rounds of frantic drawing and fun!"
      />
      
      {/* Wrap entire app with AuthProvider */}
      <AuthProvider>
        {/* Wrap entire app with GameProvider */}
        <GameProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/premium" element={<Premium />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/art" element={<ArtGallery />} />
              <Route path="/art/:drawingId" element={<ArtDetail />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />

              {/* Protected Routes - Require Authentication */}
              <Route path="/profile" element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              } />

              {/* Public Routes */}
              <Route path="/user/:username" element={<UserProfile />} />
              <Route path="/booster-packs/:packId" element={<BoosterPackDetail />} />
              <Route path="/roadmap" element={<Roadmap />} />
              <Route path="/roadmap/:itemId" element={<RoadmapDetail />} />

              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />

              {/* UI/UX Concept Screens - Including moved auth pages */}
              <Route path="/uiux/login" element={
                <ProtectedRoute requireAuth={false} redirectTo="/">
                  <Login />
                </ProtectedRoute>
                } />
              <Route path="/uiux/signup" element={
                <ProtectedRoute requireAuth={false} redirectTo="/">
                  <Signup />
                </ProtectedRoute>
              } />
              <Route path="/uiux/forgot-password" element={
                <ProtectedRoute requireAuth={false} redirectTo="/">
                  <ForgotPassword />
                </ProtectedRoute>
              } />
              <Route path="/uiux/lobby" element={
                <ProtectedRoute>
                  <LobbyScreen />
                </ProtectedRoute>
              } />
              <Route path="/uiux/pre-round" element={
                <ProtectedRoute>
                  <PreRoundBriefingScreen />
                </ProtectedRoute>
              } />
              <Route path="/uiux/drawing" element={
                <ProtectedRoute>
                  <DrawingCanvasScreen />
                </ProtectedRoute>
              } />
              <Route path="/draw" element={
                <ProtectedRoute>
                  <ExcalidrawDraw />
                </ProtectedRoute>
              } />
              <Route path="/uiux/voting" element={
                <ProtectedRoute>
                  <VotingScreen />
                </ProtectedRoute>
              } />
              <Route path="/uiux/results" element={
                <ProtectedRoute>
                  <ResultsScreen />
                </ProtectedRoute>
              } />
              <Route path="/uiux/post-game" element={
                <ProtectedRoute>
                  <PostGameScreen />
                </ProtectedRoute>
              } />
            </Routes>
          </Layout>
        </GameProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;