import { navigateTo } from '../router.js';
import { createIcon } from '../utils/icons.js';
import { animatePageIn } from '../utils/motionTransitions.js';

export function renderNotFound(container, userRole, requestedPath) {
  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'not-found-container';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.minHeight = '65vh';
  wrapper.style.padding = '48px 24px';
  wrapper.style.textAlign = 'center';
  wrapper.style.position = 'relative';

  // Eyebrow
  const eyebrow = document.createElement('div');
  eyebrow.className = 'eyebrow';
  eyebrow.style.marginBottom = '12px';
  eyebrow.textContent = '404 · ROUTE NOT FOUND';

  // Large 404 number
  const codeBadge = document.createElement('div');
  codeBadge.style.fontFamily = "var(--font-display)";
  codeBadge.style.fontSize = 'clamp(4.5rem, 8vw, 7.5rem)';
  codeBadge.style.fontWeight = '400';
  codeBadge.style.lineHeight = '1';
  codeBadge.style.color = 'var(--color-ink)';
  codeBadge.style.marginBottom = '8px';
  codeBadge.textContent = '404';

  // Title with verb landmark
  const title = document.createElement('h2');
  title.style.fontFamily = "var(--font-display)";
  title.style.fontSize = 'var(--text-h2)';
  title.style.fontWeight = '400';
  title.style.color = 'var(--color-ink)';
  title.style.marginBottom = '12px';
  title.innerHTML = 'the requested route could not be <em>located</em>.';

  // Description
  const desc = document.createElement('p');
  desc.style.fontSize = 'var(--text-sm)';
  desc.style.color = 'var(--color-muted)';
  desc.style.maxWidth = '420px';
  desc.style.lineHeight = '1.6';
  desc.style.marginBottom = '24px';
  desc.textContent = `the path "${requestedPath || 'unknown'}" does not exist in the ${userRole || 'user'} directory or has been moved.`;

  // Action Button
  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn btn-primary';
  const homeIcon = createIcon('dashboard', { size: 15, strokeWidth: 1.8 });
  const homeText = document.createElement('span');
  homeText.textContent = `return to ${userRole || 'dashboard'}`;
  homeBtn.append(homeIcon, homeText);

  homeBtn.onclick = () => {
    navigateTo(`#/${userRole || 'student'}/dashboard`);
  };

  wrapper.appendChild(eyebrow);
  wrapper.appendChild(codeBadge);
  wrapper.appendChild(title);
  wrapper.appendChild(desc);
  wrapper.appendChild(homeBtn);

  container.appendChild(wrapper);
  animatePageIn(container);
}
