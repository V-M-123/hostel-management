import { supabase } from '../supabaseClient.js';
import { formatDateForDB } from './date.js';

/**
 * Database utility functions for common complex operations.
 */

/**
 * Vacates a room allocation.
 * Handles potential schema mismatches where 'vacated_date' might not be present.
 * @param {string} allocationId - The ID of the allocation to vacate.
 * @returns {Promise<{error: any}>}
 */
export async function vacateAllocation(allocationId) {
  const today = formatDateForDB();

  // Attempt primary update with vacated_date
  let { error } = await supabase
    .from('room_allocations')
    .update({ status: 'vacated', vacated_date: today })
    .eq('id', allocationId);

  // Fallback: if the update fails due to the vacated_date column missing or other schema error
  if (error && error.message && (error.message.includes('vacated_date') || error.message.includes('column'))) {
    const fallback = await supabase
      .from('room_allocations')
      .update({ status: 'vacated' })
      .eq('id', allocationId);
    error = fallback.error;
  }

  return { error };
}
