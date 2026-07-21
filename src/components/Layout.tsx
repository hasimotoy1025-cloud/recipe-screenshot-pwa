import type { ReactNode } from 'react';
import { NavIcon } from './ui';

export type RouteName = 'home' | 'search' | 'new' | 'backup' | 'settings' | 'item' | 'edit';

export function Layout({
  children,
  route,
  navigate,
  title,
  showBack = false
}: {
  children: ReactNode;
  route: RouteName;
  navigate: (route: string) => void;
  title?: string;
  showBack?: boolean;
}) {
  const navItems: Array<{
    route: RouteName;
    label: string;
    icon: Parameters<typeof NavIcon>[0]['name'];
  }> = [
    { route: 'home', label: 'ホーム', icon: 'home' },
    { route: 'search', label: '検索', icon: 'search' },
    { route: 'new', label: '登録', icon: 'add' },
    { route: 'backup', label: 'バックアップ', icon: 'backup' },
    { route: 'settings', label: '設定', icon: 'settings' }
  ];
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          {showBack ? (
            <button
              type="button"
              className="icon-button"
              onClick={() => history.back()}
              aria-label="戻る"
            >
              ←
            </button>
          ) : (
            <div className="brand-mark">お</div>
          )}
          <div>
            <p className="eyebrow">MY LOCAL ARCHIVE</p>
            <h1>{title ?? 'おいしい記録帳'}</h1>
          </div>
          <span className="local-badge" title="画像とデータは端末内だけに保存されます">
            端末内
          </span>
        </div>
      </header>
      <main>{children}</main>
      <nav className="bottom-nav" aria-label="メインナビゲーション">
        <div className="bottom-nav-inner">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.route}
              className={route === item.route ? 'active' : ''}
              onClick={() => navigate(item.route)}
            >
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
