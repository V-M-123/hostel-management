import { animate } from 'motion';

/**
 * Hallmark Lumen motion timing & curves
 * --ease-out: cubic-bezier(0.16, 1, 0.3, 1)
 */
export const SPRING_EASE = [0.16, 1, 0.3, 1];
export const SNAPPY_SPRING = { type: 'spring', stiffness: 320, damping: 26 };

/**
 * Animate full view/tab entrance when changing routes
 * Decelerates smoothly with opacity crossfade & subtle translateY
 */
export function animatePageIn(element) {
  if (!element) return;
  return animate(
    element,
    {
      opacity: [0, 1],
      transform: ['translateY(8px)', 'translateY(0px)']
    },
    {
      duration: 0.24,
      easing: SPRING_EASE
    }
  );
}

/**
 * Animate view exit during tab transition
 */
export async function animatePageOut(element) {
  if (!element) return;
  try {
    await animate(
      element,
      {
        opacity: [1, 0],
        transform: ['translateY(0px)', 'translateY(-4px)']
      },
      {
        duration: 0.1,
        easing: 'ease-in'
      }
    ).finished;
  } catch (e) {}
}

/**
 * Stagger entrance for card grids (stats cards, shortcut grids, etc.)
 */
export function animateStaggerCards(container, cardSelector = '.stat-card, .quick-action-card, .action-card, .room-card') {
  if (!container) return;
  const cards = container.querySelectorAll(cardSelector);
  if (!cards || cards.length === 0) return;

  cards.forEach((card, i) => {
    animate(
      card,
      {
        opacity: [0, 1],
        transform: ['translateY(12px) scale(0.98)', 'translateY(0px) scale(1)']
      },
      {
        duration: 0.28,
        delay: Math.min(i * 0.04, 0.24),
        easing: SPRING_EASE
      }
    );
  });
}

/**
 * Animate modal overlay & dialog appearance
 */
export function animateModalIn(overlay, content) {
  if (overlay) {
    animate(overlay, { opacity: [0, 1] }, { duration: 0.2, easing: 'ease-out' });
  }
  if (content) {
    animate(
      content,
      {
        opacity: [0, 1],
        transform: ['scale(0.96) translateY(10px)', 'scale(1) translateY(0px)']
      },
      {
        duration: 0.28,
        easing: SPRING_EASE
      }
    );
  }
}

/**
 * Animate modal exit before removing from DOM
 */
export async function animateModalOut(overlay, content) {
  const promises = [];
  if (content) {
    const p1 = animate(
      content,
      {
        opacity: [1, 0],
        transform: ['scale(1) translateY(0px)', 'scale(0.96) translateY(6px)']
      },
      { duration: 0.15, easing: 'ease-in' }
    ).finished;
    promises.push(p1);
  }
  if (overlay) {
    const p2 = animate(
      overlay,
      { opacity: [1, 0] },
      { duration: 0.15, easing: 'ease-in' }
    ).finished;
    promises.push(p2);
  }
  await Promise.all(promises);
}

/**
 * Animate toast notification slide-in
 */
export function animateToastIn(toastEl) {
  if (!toastEl) return;
  return animate(
    toastEl,
    {
      opacity: [0, 1],
      transform: ['translateX(40px) scale(0.94)', 'translateX(0px) scale(1)']
    },
    {
      duration: 0.28,
      easing: SPRING_EASE
    }
  );
}

/**
 * Animate toast notification exit
 */
export async function animateToastOut(toastEl) {
  if (!toastEl) return;
  try {
    await animate(
      toastEl,
      {
        opacity: [1, 0],
        transform: ['translateX(0px) scale(1)', 'translateX(30px) scale(0.92)']
      },
      {
        duration: 0.18,
        easing: 'ease-in'
      }
    ).finished;
  } catch (e) {}
}

/**
 * Interactive Cursor Tracking & Lumen Spotlight
 * 1. Tracks cursor coordinates on the canvas blueprint grid (--cursor-x, --cursor-y).
 * 2. Illuminates hairline card surfaces (--mouse-x, --mouse-y).
 * 3. Applies subtle magnetic hover on primary CTA buttons without breaking OS cursor behavior.
 */
let isCursorTrackingInitialized = false;

export function initCursorTracking() {
  if (isCursorTrackingInitialized || typeof window === 'undefined') return;
  isCursorTrackingInitialized = true;

  // Respect prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  let rafId = null;
  let lastX = 0;
  let lastY = 0;

  // Global canvas cursor spotlight
  window.addEventListener('pointermove', (e) => {
    lastX = e.clientX;
    lastY = e.clientY;

    if (!rafId) {
      rafId = requestAnimationFrame(() => {
        const mainWrapper = document.querySelector('.main-wrapper');
        if (mainWrapper) {
          mainWrapper.style.setProperty('--cursor-x', `${lastX}px`);
          mainWrapper.style.setProperty('--cursor-y', `${lastY}px`);
        }
        rafId = null;
      });
    }
  }, { passive: true });

  // Event delegation for card spotlight & magnetic primary actions
  document.addEventListener('pointermove', (e) => {
    const target = e.target.closest('.glass-panel, .stat-card, .action-card, .room-card, .table-container, .btn-primary');
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    target.style.setProperty('--mouse-x', `${x}px`);
    target.style.setProperty('--mouse-y', `${y}px`);

    // Subtle magnetic micro-shift on primary buttons
    if (target.classList.contains('btn-primary')) {
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const deltaX = (x - centerX) * 0.06;
      const deltaY = (y - centerY) * 0.06;
      target.style.transform = `translate3d(${deltaX.toFixed(1)}px, ${(deltaY - 1).toFixed(1)}px, 0)`;
    }
  }, { passive: true });

  document.addEventListener('pointerout', (e) => {
    const target = e.target.closest('.btn-primary');
    if (target) {
      target.style.transform = '';
    }
  }, { passive: true });
}

