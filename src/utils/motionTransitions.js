import { animate } from 'motion';

/**
 * Higgsfield-style spring & ease curves
 */
export const SPRING_EASE = [0.16, 1, 0.3, 1];
export const SNAPPY_SPRING = { type: 'spring', stiffness: 380, damping: 28 };

/**
 * Animate full page/view entrance when changing routes
 */
export function animatePageIn(element) {
  if (!element) return;
  return animate(
    element,
    {
      opacity: [0, 1],
      transform: ['translateY(14px) scale(0.985)', 'translateY(0px) scale(1)']
    },
    {
      duration: 0.35,
      easing: SPRING_EASE
    }
  );
}

/**
 * Stagger entrance for card grids (stats cards, shortcut grids, etc.)
 */
export function animateStaggerCards(container, cardSelector = '.stat-card, .quick-action-card, .glass-panel') {
  if (!container) return;
  const cards = container.querySelectorAll(cardSelector);
  if (!cards || cards.length === 0) return;

  cards.forEach((card, i) => {
    animate(
      card,
      {
        opacity: [0, 1],
        transform: ['translateY(18px) scale(0.96)', 'translateY(0px) scale(1)']
      },
      {
        duration: 0.38,
        delay: i * 0.05,
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
    animate(overlay, { opacity: [0, 1] }, { duration: 0.22, easing: 'ease-out' });
  }
  if (content) {
    animate(
      content,
      {
        opacity: [0, 1],
        transform: ['scale(0.92) translateY(12px)', 'scale(1) translateY(0px)']
      },
      {
        duration: 0.32,
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
        transform: ['scale(1) translateY(0px)', 'scale(0.94) translateY(8px)']
      },
      { duration: 0.18, easing: 'ease-in' }
    ).finished;
    promises.push(p1);
  }
  if (overlay) {
    const p2 = animate(
      overlay,
      { opacity: [1, 0] },
      { duration: 0.18, easing: 'ease-in' }
    ).finished;
    promises.push(p2);
  }
  await Promise.all(promises);
}

/**
 * Animate toast notification slide-in & bounce
 */
export function animateToastIn(toastEl) {
  if (!toastEl) return;
  return animate(
    toastEl,
    {
      opacity: [0, 1],
      transform: ['translateX(60px) scale(0.92)', 'translateX(0px) scale(1)']
    },
    {
      duration: 0.35,
      easing: SPRING_EASE
    }
  );
}

/**
 * Animate toast notification exit
 */
export async function animateToastOut(toastEl) {
  if (!toastEl) return;
  await animate(
    toastEl,
    {
      opacity: [1, 0],
      transform: ['translateX(0px) scale(1)', 'translateX(40px) scale(0.9)']
    },
    {
      duration: 0.22,
      easing: 'ease-in'
    }
  ).finished;
}
