import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderTable } from '../components/table.js';
import { openModal, closeModal } from '../components/modal.js';
import { createIcon } from '../utils/icons.js';
import { createPageLayout } from '../components/layout.js';
import { createStatusBadge } from '../components/ui.js';

export async function render(container) {
  container.innerHTML = '';

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'page-actions-container';

  const assignBtn = document.createElement('button');
  assignBtn.className = 'btn btn-primary';
  const plusIcon = createIcon('plus', { size: 16, strokeWidth: 2, color: '#000000' });
  const btnText = document.createElement('span');
  btnText.textContent = 'Assign Warden to Hostel';
  assignBtn.append(plusIcon, btnText);
  assignBtn.onclick = () => openAssignModal();
  actionsContainer.appendChild(assignBtn);

  createPageLayout(container, {
    title: 'Manage Wardens',
    description:'', //'Warden staff directory and multi-warden hostel assignments (1:M)',
    actions: [actionsContainer]
  });

  const tableContainer = document.createElement('div');
  container.appendChild(tableContainer);

  const loadData = async () => {
    tableContainer.innerHTML = '';

    const { data: wardens, error: wError } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'warden')
      .order('full_name');

    const { data: hostels, error: hError } = await supabase
      .from('hostels')
      .select('id, name, warden_id');

    if (wError) { showToast(wError.message, 'error'); return; }
    if (hError) { showToast(hError.message, 'error'); return; }

    const hostelMap = Object.fromEntries((hostels || []).map(h => [h.id, h]));

    let hwLinks = [];
    try {
      let res = await supabase
        .from('hostel_wardens')
        .select('id, hostel_id, warden_id, hostel:hostel_id(id, name)');

      if (res.error) {
        const fbRes = await supabase.from('hostel_wardens').select('id, hostel_id, warden_id');
        hwLinks = fbRes.data || [];
      } else {
        hwLinks = res.data || [];
      }
    } catch (e) {
      console.warn('hostel_wardens fetch warning:', e);
    }

    const rows = (wardens || []).map(w => {
      const assignedHostelNames = [];
      const assignedHostelIds = [];

      hwLinks?.forEach(link => {
        if (link.warden_id === w.id) {
          const hId = link.hostel?.id || link.hostel_id;
          const hName = link.hostel?.name || hostelMap[hId]?.name;
          if (hId && hName && !assignedHostelIds.includes(hId)) {
            assignedHostelNames.push(hName);
            assignedHostelIds.push(hId);
          }
        }
      });

      hostels?.forEach(h => {
        if (h.warden_id === w.id && !assignedHostelIds.includes(h.id)) {
          assignedHostelNames.push(h.name);
          assignedHostelIds.push(h.id);
        }
      });

      return {
        ...w,
        assignedHostelNames: assignedHostelNames.length > 0 ? assignedHostelNames.join(', ') : 'Unassigned',
        assignedHostelIds,
        assignedCount: assignedHostelNames.length
      };
    });

    renderTable(tableContainer, {
      columns: [
        { key: 'full_name', label: 'Warden Name', render: (val) => val },
        { key: 'phone', label: 'Phone', render: (val) => val || 'N/A' },
        { key: 'assignedHostelNames', label: 'Assigned Hostel(s)', render: (val, row) => {
            if (row.assignedCount === 0) {
              const span = document.createElement('span');
              span.style.color = 'var(--text-muted)';
              span.textContent = 'Unassigned';
              return span;
            }
            return createStatusBadge(val);
        }}
      ],
      rows: rows,
      actions: [
        {
          label: 'Assign/Reassign',
          class: 'btn btn-sm btn-secondary',
          onClick: (row) => openAssignModal(row.id)
        },
        {
          label: 'Unassign All',
          class: 'btn btn-sm btn-outline',
          onClick: async (row) => {
            if (row.assignedCount === 0) {
              showToast('Warden is not assigned to any hostel.', 'info');
              return;
            }
            if (confirm(`Unassign ${row.full_name} from all assigned hostels?`)) {
              await supabase.from('hostel_wardens').delete().eq('warden_id', row.id);
              await supabase.from('hostels').update({ warden_id: null }).eq('warden_id', row.id);

              showToast('Warden unassigned from all hostels', 'success');
              await loadData();
            }
          }
        }
      ],
      emptyMessage: 'No wardens found.'
    });
  };

  const openAssignModal = async (preselectedWardenId = null) => {
    const { data: users, error: uError } = await supabase.from('profiles').select('*').neq('role', 'admin').order('full_name');
    const { data: hostels, error: hError } = await supabase.from('hostels').select('id, name').order('name');

    if (uError || hError) {
      showToast('Error loading data for modal', 'error');
      return;
    }

    let userOptions = users.map(u => {
      const isSelected = u.id === preselectedWardenId ? 'selected' : '';
      return `<option value="${u.id}" ${isSelected}>${u.full_name} (${u.role})</option>`;
    }).join('');

    let hostelOptions = hostels.map(h => `<option value="${h.id}">${h.name}</option>`).join('');

    const bodyHTML = `
      <div class="form-group">
        <label class="form-label">Select Staff Member / Warden</label>
        <select name="user_id" class="form-select" required>
          ${userOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Assign to Hostel Block</label>
        <select name="hostel_id" class="form-select" required>
          ${hostelOptions}
        </select>
      </div>
    `;

    openModal('Assign Warden to Hostel', bodyHTML, async (formData) => {
      const userId = formData.get('user_id');
      const hostelId = formData.get('hostel_id');

      await supabase.from('profiles').update({ role: 'warden' }).eq('id', userId);

      const { error: jError } = await supabase
        .from('hostel_wardens')
        .upsert({ hostel_id: hostelId, warden_id: userId }, { onConflict: 'hostel_id,warden_id' });

      if (jError) {
        showToast(jError.message, 'error');
        return;
      }

      showToast('Warden assigned to hostel successfully!', 'success');
      closeModal();
      await loadData();
    });
  };

  await loadData();
}
