import { animatePageIn, animatePageOut } from './utils/motionTransitions.js';
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

      const role = user.role || 'student';

      // If hash is empty, or route belongs to a different role, automatically redirect to role dashboard
      if (path === '' || path === '#/' || path === '#' || !path.startsWith(`#/${role}/`)) {
        navigateTo(`#/${role}/dashboard`);
        if (getCurrentPath() === `#/${role}/dashboard`) {
          const dashLoader = routeMap[`#/${role}/dashboard`];
          if (dashLoader) {
            try {
              if (container.firstElementChild) {
                await animatePageOut(container);
              }
              const module = await dashLoader();
              await module.render(container);
              animatePageIn(container);
              return;
            } catch (err) {
              console.error('[Router] Dashboard render error:', err);
            }
          }
        }
        return;
      }

      const loader = routeMap[path];

      if (loader && path.startsWith(`#/${role}/`)) {
        try {
          if (container.firstElementChild) {
            await animatePageOut(container);
          }
          const module = await loader();
          await module.render(container);
          
          // Trigger Hallmark Lumen decelerating entrance
          animatePageIn(container);
        } catch (err) {
          console.error('[Router] Error rendering route module:', err);
          container.innerHTML = `
            <div class="glass-panel" style="padding: 32px; text-align: center; margin: 40px auto; max-width: 500px;">
              <div style="font-size: 32px; margin-bottom: 12px;">⚠️</div>
              <h2 style="font-family: var(--font-display); font-size: 20px; margin-bottom: 8px;">Failed to load view</h2>
              <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">${err?.message || 'An unexpected error occurred while rendering this page.'}</p>
              <button class="btn btn-secondary" onclick="window.location.reload()">Reload View</button>
            </div>
          `;
          animatePageIn(container);
        }
      } else {
        // Render custom 404 page for genuinely unmatched or unauthorized routes
        if (container.firstElementChild) {
          await animatePageOut(container);
        }
        renderNotFound(container, role, path);
        animatePageIn(container);
      }
    } finally {
      isRouting = false;
    }
  }

  window.onhashchange = handleRoute;
  handleRoute();
}
