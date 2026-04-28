import '../initialize';

import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import BootErrorBoundary from '@/components/BootErrorBoundary';
import { createAppRouter } from '@/utils/router';

import { desktopRoutes } from './router/desktopRouter.config';

const debugProxyBase = '/_dangerous_local_dev_proxy';
const debugProxyHtmlBase = `${debugProxyBase}.html`;

const getBasename = () => {
  const { pathname } = window.location;

  if (pathname.startsWith(debugProxyHtmlBase)) return debugProxyHtmlBase;
  if (pathname.startsWith(debugProxyBase) || window.__DEBUG_PROXY__) return debugProxyBase;
};

const basename = getBasename();

const router = createAppRouter(desktopRoutes, { basename });

createRoot(document.getElementById('root')!).render(
  <BootErrorBoundary>
    <RouterProvider router={router} />
  </BootErrorBoundary>,
);
