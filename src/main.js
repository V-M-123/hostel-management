import { supabase } from './supabaseClient.js';
import { signIn, signUp, signOut, getCurrentUser, onAuthStateChange } from './auth.js';
import { initRouter, navigateTo } from './router.js';
import { renderTopbar } from './components/topbar.js';
import { renderSidebar } from './components/sidebar.js';
import { showToast } from './components/toast.js';
import { initCursorTracking } from './utils/motionTransitions.js';

document.addEventListener('DOMContentLoaded', () => {
  initCursorTracking();
  onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      initApp();
    }
  });
  initApp();
});

let currentInitId = 0;

async function initApp() {
  const initId = ++currentInitId;
  const appContainer = document.getElementById('app');
  
  const user = await getCurrentUser();
  
  // If another initApp() started after this one, discard this run
  if (initId !== currentInitId) return;

  appContainer.innerHTML = '';
  if (!user) {
    renderAuthPage(appContainer);
  } else {
    renderAppShell(appContainer, user);
  }
}

function renderAuthPage(container) {
  container.className = 'auth-container';
  let isLogin = true;

  function renderForm() {
    container.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'glass-panel auth-card';

    const header = document.createElement('div');
    header.className = 'auth-header';
    const title = document.createElement('h1');
    title.textContent = isLogin ? 'Welcome Back' : 'Create Account';
    const subtitle = document.createElement('p');
    subtitle.textContent = isLogin ? 'Sign in to HostelHub' : 'Join HostelHub today';
    header.appendChild(title);
    header.appendChild(subtitle);
    card.appendChild(header);

    const form = document.createElement('form');
    form.className = 'auth-form';

    if (!isLogin) {
      const nameGroup = createFormGroup('Full Name', 'fullName', 'text');
      const phoneGroup = createFormGroup('Phone', 'phone', 'text');
      const roleGroup = createSelectGroup('Register As', 'role', [
        { value: 'student', label: '🎓 Student' },
        { value: 'admin', label: '🛡️ Admin' },
        { value: 'warden', label: '🔑 Warden' }
      ]);
      form.appendChild(nameGroup);
      form.appendChild(phoneGroup);
      form.appendChild(roleGroup);
    }

    const emailGroup = createFormGroup('Email', 'email', 'email');
    const passwordGroup = createFormGroup('Password', 'password', 'password');
    form.appendChild(emailGroup);
    form.appendChild(passwordGroup);

    if (!isLogin) {
      const confirmGroup = createFormGroup('Confirm Password', 'confirmPassword', 'password');
      form.appendChild(confirmGroup);
    }

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = isLogin ? 'Sign In' : 'Sign Up';
    form.appendChild(submitBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const email = fd.get('email');
      const password = fd.get('password');
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Please wait...';

      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          showToast(error.message, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign In';
        } else {
          showToast('Signed in successfully!', 'success');
          const user = await getCurrentUser();
          const targetRole = user?.role || 'student';
          window.location.hash = `#/${targetRole}/dashboard`;
          await initApp();
        }
      } else {
        const fullName = fd.get('fullName');
        const phone = fd.get('phone');
        const role = fd.get('role') || 'student';
        const confirm = fd.get('confirmPassword');
        
        if (password !== confirm) {
          showToast('Passwords do not match', 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign Up';
          return;
        }

        const { error } = await signUp(email, password, fullName, phone, role);
        if (error) {
          showToast(error.message, 'error');
        } else {
          showToast(`Account created as ${role.toUpperCase()}! You can now log in.`, 'success');
          isLogin = true;
          renderForm();
        }
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Up';
      }
    });
    
    card.appendChild(form);

    const footer = document.createElement('div');
    footer.className = 'auth-footer';
    const footerText = document.createElement('span');
    footerText.textContent = isLogin ? "Don't have an account? " : 'Already have an account? ';
    const toggleLink = document.createElement('a');
    toggleLink.textContent = isLogin ? 'Sign Up' : 'Log In';
    toggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      isLogin = !isLogin;
      renderForm();
    });
    footer.appendChild(footerText);
    footer.appendChild(toggleLink);
    card.appendChild(footer);

    container.appendChild(card);
  }
  
  renderForm();
}

function createSelectGroup(labelText, name, options) {
  const group = document.createElement('div');
  group.className = 'form-group';
  const label = document.createElement('label');
  label.className = 'form-label';
  label.textContent = labelText;
  const select = document.createElement('select');
  select.name = name;
  select.className = 'form-select';
  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  });
  group.appendChild(label);
  group.appendChild(select);
  return group;
}

function createFormGroup(labelText, name, type) {
  const group = document.createElement('div');
  group.className = 'form-group';
  const label = document.createElement('label');
  label.className = 'form-label';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = type;
  input.name = name;
  input.className = 'form-input';
  input.required = true;
  group.appendChild(label);
  group.appendChild(input);
  return group;
}

function renderAppShell(container, user) {
  container.innerHTML = '';
  container.className = 'app-layout';
  
  const sidebarEl = document.createElement('div');
  sidebarEl.id = 'sidebar';
  const topbarEl = document.createElement('div');
  topbarEl.id = 'topbar';
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'main-wrapper';
  const contentEl = document.createElement('div');
  contentEl.id = 'content';
  contentEl.className = 'content-area';
  
  contentWrapper.appendChild(topbarEl);
  contentWrapper.appendChild(contentEl);
  
  container.appendChild(sidebarEl);
  container.appendChild(contentWrapper);

  const routeMap = {
    '#/admin/dashboard': () => import('./admin/dashboard.js'),
    '#/admin/hostels': () => import('./admin/hostels.js'),
    '#/admin/wardens': () => import('./admin/wardens.js'),
    '#/admin/students': () => import('./admin/students.js'),
    '#/admin/complaints': () => import('./admin/complaints.js'),
    '#/admin/fees': () => import('./admin/fees.js'),
    '#/admin/announcements': () => import('./admin/announcements.js'),
    '#/warden/dashboard': () => import('./warden/dashboard.js'),
    '#/warden/rooms': () => import('./warden/rooms.js'),
    '#/warden/allocations': () => import('./warden/allocations.js'),
    '#/warden/complaints': () => import('./warden/complaints.js'),
    '#/warden/leave-requests': () => import('./warden/leaveRequests.js'),
    '#/warden/announcements': () => import('./warden/announcements.js'),
    '#/student/dashboard': () => import('./student/dashboard.js'),
    '#/student/room': () => import('./student/room.js'),
    '#/student/complaints': () => import('./student/complaints.js'),
    '#/student/fees': () => import('./student/fees.js'),
    '#/student/leave-requests': () => import('./student/leaveRequests.js'),
    '#/student/announcements': () => import('./student/announcements.js')
  };

  const currentPath = window.location.hash;
  renderSidebar(sidebarEl, user.role, currentPath);
  renderTopbar(topbarEl, user);
  
  window.addEventListener('hashchange', () => {
    renderSidebar(sidebarEl, user.role, window.location.hash);
  });

  initRouter(routeMap, contentEl, () => Promise.resolve(user));
}
