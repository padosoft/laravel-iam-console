import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { ToastProvider } from './components/Toast'
import Dashboard from './pages/Dashboard'
import Users from './pages/Users'
import RolesGrants from './pages/RolesGrants'
import Organizations from './pages/Organizations'
import Groups from './pages/Groups'
import Sessions from './pages/Sessions'
import AuditLog from './pages/AuditLog'
import DecisionPlayground from './pages/DecisionPlayground'
import AccessReviews from './pages/AccessReviews'
import Recommendations from './pages/Recommendations'
import Applications from './pages/Applications'

// The SPA is mounted at /console/ (see vite base + the host catch-all route),
// so the router basename strips that prefix from client-side paths.
export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter basename="/console">
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="users" element={<Users />} />
            <Route path="grants" element={<RolesGrants />} />
            <Route path="organizations" element={<Organizations />} />
            <Route path="groups" element={<Groups />} />
            <Route path="sessions" element={<Sessions />} />
            <Route path="audit" element={<AuditLog />} />
            <Route path="access-reviews" element={<AccessReviews />} />
            <Route path="recommendations" element={<Recommendations />} />
            <Route path="applications" element={<Applications />} />
            <Route path="playground" element={<DecisionPlayground />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
