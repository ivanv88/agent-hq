import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ListTodo, Kanban, Library, Settings } from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const TOP_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
  { to: '/tasks',     label: 'Tasks',     icon: <ListTodo size={18} /> },
  { to: '/kanban',    label: 'Kanban',    icon: <Kanban size={18} /> },
  { to: '/library',   label: 'Library',   icon: <Library size={18} /> },
];

const BOTTOM_ITEMS: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: <Settings size={18} /> },
];

function RailItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      title={item.label}
      className={({ isActive }) =>
        [
          'relative flex items-center justify-center w-12 h-12 transition-colors duration-100',
          isActive
            ? 'text-text-bright bg-surface-overlay'
            : 'text-text-muted hover:text-text-body hover:bg-surface-hover',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-accent-primary rounded-r-[2px]" />
          )}
          {item.icon}
        </>
      )}
    </NavLink>
  );
}

export function NavRail() {
  return (
    <nav
      className="flex flex-col justify-between bg-surface-base border-r border-border-default flex-shrink-0"
      style={{ width: 48 }}
    >
      <div className="flex flex-col">
        {TOP_ITEMS.map(item => (
          <RailItem key={item.to} item={item} />
        ))}
      </div>
      <div className="flex flex-col">
        {BOTTOM_ITEMS.map(item => (
          <RailItem key={item.to} item={item} />
        ))}
      </div>
    </nav>
  );
}
