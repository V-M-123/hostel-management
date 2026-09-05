/**
 * Shared UI components for consistent visual elements across the application.
 */

/**
 * Creates a status badge element with the appropriate styling.
 * @param {string} status - The status to display (e.g., 'active', 'pending', 'vacated').
 * @returns {HTMLElement}
 */
export function createStatusBadge(status) {
  const span = document.createElement('span');
  span.className = 'status-badge';

  const normalizedStatus = status?.toLowerCase() || 'unknown';

  switch (normalizedStatus) {
    case 'active':
    case 'allocated':
      span.classList.add('status-active');
      span.textContent = 'ACTIVE';
      break;
    case 'pending':
      span.classList.add('status-pending');
      span.textContent = 'PENDING';
      break;
    case 'vacated':
      span.classList.add('status-vacated');
      span.textContent = 'VACATED';
      break;
    default:
      span.textContent = normalizedStatus.toUpperCase();
  }

  return span;
}
