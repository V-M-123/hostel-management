import { supabase } from '../supabaseClient.js';

/**
 * Robustly retrieves all hostels assigned to a warden across both
 * 1:M junction table (hostel_wardens) and direct reference (hostels.warden_id).
 */
export async function getAssignedHostelsForWarden(wardenId) {
  try {
    const [{ data: directHostels }, { data: junctionHostels }] = await Promise.all([
      supabase.from('hostels').select('id, name, address').eq('warden_id', wardenId),
      supabase.from('hostel_wardens').select('hostel_id, hostel:hostel_id(id, name, address)').eq('warden_id', wardenId)
    ]);

    const assignedHostelMap = new Map();
    (directHostels || []).forEach(h => assignedHostelMap.set(h.id, h));

    const missingHostelIds = [];
    (junctionHostels || []).forEach(jh => {
      if (jh.hostel) {
        assignedHostelMap.set(jh.hostel.id, jh.hostel);
      } else if (jh.hostel_id && !assignedHostelMap.has(jh.hostel_id)) {
        missingHostelIds.push(jh.hostel_id);
      }
    });

    if (missingHostelIds.length > 0) {
      const { data: missingHostels } = await supabase.from('hostels').select('id, name, address').in('id', missingHostelIds);
      (missingHostels || []).forEach(h => assignedHostelMap.set(h.id, h));
    }

    return Array.from(assignedHostelMap.values());
  } catch (err) {
    console.warn('[wardenHelpers] Error fetching assigned hostels:', err);
    return [];
  }
}
