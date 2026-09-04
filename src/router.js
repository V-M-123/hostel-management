import { animatePageIn } from './utils/motionTransitions.js';

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

      if (!path.startsWith(`#/${role}/`) && path !== '') {
        navigateTo(`#/${role}/dashboard`);
        return;
      }

      const matchedRoute = path === '' ? `#/${role}/dashboard` : path;
      const loader = routeMap[matchedRoute];

      if (loader) {
        try {
          const module = await loader();
          await module.render(container);
          
          // Trigger motion.dev smooth view transition
          animatePageIn(container);
        } catch (err) {
          console.error('[Router] Failed to load route', err);
          container.innerHTML = '<h2 style="color: var(--color-cyber-red); padding: 20px;">Error loading page</h2>';
        }
      } else {
        navigateTo(`#/${role}/dashboard`);
      }
    } finally {
      isRouting = false;
    }
  }

  window.onhashchange = handleRoute;
  handleRoute();
}
