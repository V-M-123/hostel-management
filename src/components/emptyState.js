import { createIcon } from '../utils/icons.js';

export function renderEmptyState(container, message, iconName = 'inbox') {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.justifyContent = 'center';
  wrapper.style.padding = '48px 24px';
  wrapper.style.textAlign = 'center';
  wrapper.style.color = 'var(--text-muted)';
  
  const iconEl = document.createElement('div');
  iconEl.className = 'empty-state-icon';
  iconEl.style.marginBottom = '12px';
  iconEl.style.color = 'var(--text-muted)';
  iconEl.style.opacity = '0.6';
  
  const svg = createIcon(iconName, { size: 36, strokeWidth: 1.5 });
  iconEl.appendChild(svg);
  
  const textEl = document.createElement('div');
  textEl.className = 'empty-state-text';
  textEl.style.fontSize = '14px';
  textEl.style.fontWeight = '500';
  textEl.textContent = message;
  
  wrapper.appendChild(iconEl);
  wrapper.appendChild(textEl);
  
  container.appendChild(wrapper);
}
