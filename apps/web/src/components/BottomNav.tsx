import type { ReactNode } from 'react';
import type { AppView } from './AppShell.js';

type BottomNavItem = {
  view: AppView;
  label: string;
  icon: ReactNode;
  hidden?: boolean;
  onClick?: () => void;
};

type BottomNavProps = {
  active: AppView;
  items: BottomNavItem[];
  onNavigate: (view: AppView) => void;
};

export function BottomNav({ active, items, onNavigate }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="하단 내비게이션">
      {items
        .filter((item) => !item.hidden)
        .map((item) => (
          <button
            className={active === item.view ? 'active' : ''}
            type="button"
            key={`${item.label}-${item.view}`}
            onClick={() => {
              item.onClick?.();
              if (!item.onClick) {
                onNavigate(item.view);
              }
            }}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
    </nav>
  );
}
