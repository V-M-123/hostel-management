let isRouting = false;

export function navigateTo(path) {
  if (window.location.hash === path) return;
  window.location.hash = path;
}

export function getCurrentPath() {
  return window.location.hash || '';
}

export function initRouter(routeMap, container, getCurrentUserFn) {
  async function handleRoute() {
    if (isRouting) return;
    isRouting = true;

    try {
      const path = getCurrentPath();
      console.log('[Router] handleRoute called. Path:', path);
      const user = await getCurrentUserFn();

      if (!user) {
        console.log('[Router] No user found, skipping.');
        return;
      }

      const role = user.role;
      console.log('[Router] User role:', role);

      if (!path.startsWith(`#/${role}/`) && path !== '') {
        console.log('[Router] Path is invalid for role, redirecting to dashboard...');
        navigateTo(`#/${role}/dashboard`);
        return;
      }

      const matchedRoute = path === '' ? `#/${role}/dashboard` : path;
      console.log('[Router] Matched route:', matchedRoute);
      const loader = routeMap[matchedRoute];

      if (loader) {
        try {
          console.log('[Router] Loading module for:', matchedRoute);
          const module = await loader();
          await module.render(container);
        } catch (err) {
          console.error('[Router] Failed to load route', err);
          container.innerHTML = '<h2>Error loading page</h2>';
        }
      } else {
        console.log('[Router] Route not found in map, redirecting to dashboard...');
        navigateTo(`#/${role}/dashboard`);
      }
    } finally {
      isRouting = false;
    }
  }

  window.onhashchange = handleRoute;
  handleRoute();
}
