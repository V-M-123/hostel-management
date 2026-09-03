/**
 * Utility to filter complaints according to business rules:
 * 1. Default view hides resolved issues.
 * 2. Resolved issues older than 10 days (based on resolved_at) are permanently removed/hidden.
 * 3. Changing an issue status from 'resolved' back to 'open' or 'in_progress' resets the timer (resolved_at = null).
 */

export const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000;

export function filterComplaints(complaints, selectedStatus = 'active', selectedCategory = 'all') {
  if (!Array.isArray(complaints)) return [];
  const now = Date.now();

  return complaints.filter(c => {
    // Rule: Exclude resolved issues that are older than 10 days
    if (c.status === 'resolved' && c.resolved_at) {
      const resolvedTimestamp = new Date(c.resolved_at).getTime();
      if (now - resolvedTimestamp > TEN_DAYS_MS) {
        return false; // Removed 10 days after updating to resolved
      }
    }

    // Rule: Don't show resolved issues when filtering by 'active' (default)
    if (selectedStatus === 'active') {
      if (c.status === 'resolved') return false;
    } else if (selectedStatus !== 'all') {
      if (c.status !== selectedStatus) return false;
    }

    // Category filter
    if (selectedCategory && selectedCategory !== 'all') {
      if (c.category !== selectedCategory) return false;
    }

    return true;
  });
}
