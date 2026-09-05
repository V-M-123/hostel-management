/**
 * Date utilities for consistent formatting across the application.
 */

/**
 * Returns the current date in YYYY-MM-DD format.
 * Used primarily for database insertions and updates.
 * @returns {string}
 */
export function formatDateForDB() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Formats a date string for user interface display.
 * @param {string} dateString - The ISO date string to format.
 * @returns {string} - A localized date string.
 */
export function formatDateForUI(dateString) {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch (e) {
    console.error('[DateUtils] Error formatting date:', e);
    return 'Invalid Date';
  }
}
