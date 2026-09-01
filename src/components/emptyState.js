export function renderEmptyState(container, message, icon = '📋') {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';
  
  const iconEl = document.createElement('div');
  iconEl.className = 'empty-state-icon';
  iconEl.textContent = icon;
  
  const textEl = document.createElement('div');
  textEl.className = 'empty-state-text';
  textEl.textContent = message;
  
  wrapper.appendChild(iconEl);
  wrapper.appendChild(textEl);
  
  container.appendChild(wrapper);
}
