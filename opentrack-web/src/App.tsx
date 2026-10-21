import { Link, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ContainerPage from './pages/ContainerPage';
import DashboardPage from './pages/DashboardPage';
import MasterBillPage from './pages/MasterBillPage';
import WebhooksPage from './pages/WebhooksPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="containers/:id" element={<ContainerPage />} />
        <Route path="master-bills/:number" element={<MasterBillPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="*" element={<p>That page doesn’t exist. <Link className="text-harbor underline" to="/">Go to containers</Link></p>} />
      </Route>
    </Routes>
  );
}
