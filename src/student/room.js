import { supabase } from '../supabaseClient.js';
import { showToast } from '../components/toast.js';
import { renderEmptyState } from '../components/emptyState.js';

export async function render(container) {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'page-header';
  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'My Room';
  header.appendChild(title);
  container.appendChild(header);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) { showToast('Authentication error', 'error'); return; }

  let allocation = null;
  try {
    const res = await supabase
      .from('room_allocations')
      .select('*, room_id, room:room_id(room_number, floor, capacity, occupied_count, hostel:hostel_id(name))')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    allocation = res.data;
  } catch (e) {
    console.warn('Room allocation query error:', e);
  }

  if (!allocation || !allocation.room) {
    renderEmptyState(container, 'You are not allocated to any room yet.', '🛌');
    return;
  }

  const room = allocation.room;
  
  const roomPanel = document.createElement('div');
  roomPanel.className = 'glass-panel';
  roomPanel.style.padding = '20px';
  roomPanel.style.marginBottom = '20px';

  const roomTitle = document.createElement('h2');
  roomTitle.textContent = `Room ${room.room_number}`;
  roomTitle.style.marginBottom = '10px';
  roomTitle.style.marginTop = '0';
  
  const detailsList = document.createElement('ul');
  detailsList.style.listStyle = 'none';
  detailsList.style.padding = '0';
  detailsList.style.color = 'var(--text-secondary)';
  detailsList.style.lineHeight = '1.8';

  const blockLi = document.createElement('li');
  blockLi.innerHTML = `<strong>Block:</strong> `;
  const blockSpan = document.createElement('span');
  blockSpan.textContent = room.hostel?.name || 'N/A';
  blockLi.appendChild(blockSpan);

  const floorLi = document.createElement('li');
  floorLi.innerHTML = `<strong>Floor:</strong> `;
  const floorSpan = document.createElement('span');
  floorSpan.textContent = room.floor;
  floorLi.appendChild(floorSpan);

  const capLi = document.createElement('li');
  capLi.innerHTML = `<strong>Capacity:</strong> `;
  const capSpan = document.createElement('span');
  capSpan.textContent = room.capacity;
  capLi.appendChild(capSpan);

  const occLi = document.createElement('li');
  occLi.innerHTML = `<strong>Currently Occupied:</strong> `;
  const occSpan = document.createElement('span');
  occSpan.textContent = room.occupied_count;
  occLi.appendChild(occSpan);

  detailsList.append(blockLi, floorLi, capLi, occLi);
  roomPanel.append(roomTitle, detailsList);
  container.appendChild(roomPanel);

  // Roommates section
  const roommatesTitle = document.createElement('h3');
  roommatesTitle.textContent = 'Roommates';
  container.appendChild(roommatesTitle);

  let roommates = [];
  try {
    const { data: rmData } = await supabase.rpc('get_my_roommates');
    roommates = rmData || [];
  } catch (e) {
    console.warn('Roommates query error:', e);
  }

  const rmPanel = document.createElement('div');
  rmPanel.className = 'glass-panel';
  rmPanel.style.padding = '20px';

  if (!roommates || roommates.length === 0) {
    const p = document.createElement('p');
    p.textContent = 'No other students in this room';
    p.style.margin = '0';
    p.style.color = 'var(--text-secondary)';
    rmPanel.appendChild(p);
  } else {
    const list = document.createElement('ul');
    list.style.margin = '0';
    list.style.paddingLeft = '20px';
    list.style.color = 'var(--text-primary)';
    
    roommates.forEach(rm => {
      const li = document.createElement('li');
      li.textContent = rm.full_name || 'Unknown';
      li.style.marginBottom = '5px';
      list.appendChild(li);
    });
    rmPanel.appendChild(list);
  }

  container.appendChild(rmPanel);
}
