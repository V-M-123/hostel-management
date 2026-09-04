import {
  createElement,
  LayoutDashboard,
  Building2,
  Shield,
  GraduationCap,
  AlertCircle,
  CreditCard,
  Megaphone,
  DoorOpen,
  Bed,
  Calendar,
  LogOut,
  Moon,
  Sun,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Plus,
  Edit2,
  Trash2,
  Menu,
  User,
  Activity,
  Percent,
  TrendingUp,
  Inbox
} from 'lucide';

const iconMap = {
  dashboard: LayoutDashboard,
  hostel: Building2,
  hostels: Building2,
  warden: Shield,
  wardens: Shield,
  student: GraduationCap,
  students: GraduationCap,
  complaint: AlertCircle,
  complaints: AlertCircle,
  fee: CreditCard,
  fees: CreditCard,
  announcement: Megaphone,
  announcements: Megaphone,
  room: DoorOpen,
  rooms: DoorOpen,
  allocation: Bed,
  allocations: Bed,
  leave: Calendar,
  leaves: Calendar,
  logout: LogOut,
  moon: Moon,
  sun: Sun,
  check: CheckCircle2,
  close: XCircle,
  clock: Clock,
  search: Search,
  plus: Plus,
  edit: Edit2,
  delete: Trash2,
  menu: Menu,
  user: User,
  activity: Activity,
  percent: Percent,
  trending: TrendingUp,
  inbox: Inbox
};

/**
 * Returns a new Lucide SVG element
 */
export function createIcon(name, options = {}) {
  const { size = 18, className = '', strokeWidth = 2, color = 'currentColor' } = options;
  const iconDef = iconMap[name?.toLowerCase()] || iconMap.inbox;

  try {
    const svgEl = createElement(iconDef, {
      width: size,
      height: size,
      'stroke-width': strokeWidth,
      class: `lucide-icon ${className}`.trim(),
      stroke: color
    });
    return svgEl;
  } catch (err) {
    console.warn(`[Icons] Error creating icon "${name}":`, err);
    const fallback = document.createElement('span');
    fallback.className = 'icon-fallback';
    return fallback;
  }
}

/**
 * Convenience helper to render icon directly into a container
 */
export function appendIcon(parent, name, options = {}) {
  if (!parent) return;
  const icon = createIcon(name, options);
  parent.appendChild(icon);
  return icon;
}
