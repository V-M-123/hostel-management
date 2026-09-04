import { animatePageIn } from './utils/motionTransitions.js';
import { renderNotFound } from './components/notFound.js';

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
      const user = await getCurrentUserFn();

      if (!user) {
        return;
      }

      const role = user.role;

      // Empty hash defaults to role dashboard
      if (path === '' || path === '#/' || path === '#') {
        navigateTo(`#/${role}/dashboard`);
        return;
      }

      const loader = routeMap[path];

      if (loader && path.startsWith(`#/${role}/`)) {
        try {
          const module = await loader();
          await module.render(container);
          
          // Trigger motion.dev smooth view transition
          animatePageIn(container);
        } catch (err) {
          console.error('[Router] Failed to load route module:', err);
          renderNotFound(container, role, path);
        }
      } else {
        // Render custom 404 page for unmatched or unauthorized routes
        renderNotFound(container, role, path);
      }
    } finally {
      isRouting = false;
    }
  }

  window.onhashchange = handleRoute;
  handleRoute();
}
