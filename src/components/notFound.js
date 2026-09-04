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
  wrapper.style.padding = '40px 20px';
  wrapper.style.textAlign = 'center';
  wrapper.style.position = 'relative';

  // Glowing 404 badge
  const codeBadge = document.createElement('div');
  codeBadge.style.fontFamily = "'Space Grotesk', sans-serif";
  codeBadge.style.fontSize = '88px';
  codeBadge.style.fontWeight = '900';
  codeBadge.style.letterSpacing = '-0.05em';
  codeBadge.style.lineHeight = '1';
  codeBadge.style.marginBottom = '16px';
  codeBadge.style.background = 'linear-gradient(135deg, var(--color-acid-yellow) 0%, #ffffff 70%)';
  codeBadge.style.webkitBackgroundClip = 'text';
  codeBadge.style.webkitTextFillColor = 'transparent';
  codeBadge.style.filter = 'drop-shadow(0 0 28px rgba(209, 254, 23, 0.25))';
  codeBadge.textContent = '404';

  // Icon container
  const iconBox = document.createElement('div');
  iconBox.style.width = '64px';
  iconBox.style.height = '64px';
  iconBox.style.borderRadius = '14px';
  iconBox.style.background = 'rgba(209, 254, 23, 0.08)';
  iconBox.style.border = '1px solid rgba(209, 254, 23, 0.25)';
  iconBox.style.display = 'flex';
  iconBox.style.alignItems = 'center';
  iconBox.style.justifyContent = 'center';
  iconBox.style.marginBottom = '20px';
  iconBox.style.boxShadow = '0 0 24px rgba(209, 254, 23, 0.15)';
  iconBox.appendChild(createIcon('search', { size: 28, strokeWidth: 1.8, color: 'var(--color-acid-yellow)' }));

  // Title
  const title = document.createElement('h2');
  title.style.fontFamily = "'Space Grotesk', sans-serif";
  title.style.fontSize = '26px';
  title.style.fontWeight = '700';
  title.style.color = 'var(--text-primary)';
  title.style.letterSpacing = '-0.03em';
  title.style.marginBottom = '10px';
  title.textContent = 'Page Lost in the Void';

  // Description
  const desc = document.createElement('p');
  desc.style.fontSize = '14px';
  desc.style.color = 'var(--text-muted)';
  desc.style.maxWidth = '460px';
  desc.style.lineHeight = '1.6';
  desc.style.marginBottom = '20px';
  desc.textContent = 'The route you are trying to access does not exist, has been moved, or is restricted for your account role.';

  // Path info pill
  const pathPill = document.createElement('div');
  pathPill.style.display = 'inline-flex';
  pathPill.style.alignItems = 'center';
  pathPill.style.gap = '8px';
  pathPill.style.padding = '6px 14px';
  pathPill.style.background = 'rgba(255, 255, 255, 0.03)';
  pathPill.style.border = '1px solid var(--border-glass)';
  pathPill.style.borderRadius = '9999px';
  pathPill.style.fontSize = '12px';
  pathPill.style.fontFamily = "'IBM Plex Mono', monospace";
  pathPill.style.color = 'var(--text-secondary)';
  pathPill.style.marginBottom = '32px';
  pathPill.innerHTML = `<span style="color: var(--color-cyber-red);">Unresolved:</span> ${requestedPath || '/'}`;

  // CTA button
  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn btn-primary';
  homeBtn.style.padding = '10px 24px';
  homeBtn.style.fontSize = '14px';
  homeBtn.style.fontWeight = '600';
  homeBtn.style.borderRadius = '8px';
  homeBtn.style.gap = '8px';
  
  const homeIcon = createIcon('dashboard', { size: 16, strokeWidth: 2, color: '#000000' });
  const homeText = document.createElement('span');
  homeText.textContent = 'Return to Dashboard';
  homeBtn.append(homeIcon, homeText);

  homeBtn.onclick = () => {
    navigateTo(`#/${userRole || 'student'}/dashboard`);
  };

  wrapper.append(iconBox, codeBadge, title, desc, pathPill, homeBtn);
  container.appendChild(wrapper);

  animatePageIn(container);
}
