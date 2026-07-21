import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { getSettings, listItemBundles } from './db';
import type { AppSettings, ItemSummary } from './types';
import { DEFAULT_SETTINGS } from './types';
import { Layout, type RouteName } from './components/Layout';
import { Toast } from './components/ui';
import { HomePage } from './pages/HomePage';
import { EditorPage } from './pages/EditorPage';
import { DetailPage } from './pages/DetailPage';
import { BackupPage } from './pages/BackupPage';
import { SettingsPage } from './pages/SettingsPage';

interface Route {
  name: RouteName;
  id?: string;
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [storageUsage, setStorageUsage] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState('');
  const showIosInstallTip = useMemo(() => isAppleMobileDevice() && !isStandaloneWebApp(), []);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisterError: () =>
      setToast('オフライン機能の準備に失敗しました。ページを再読み込みしてください。')
  });

  const reload = useCallback(async () => {
    const [bundles, nextSettings, estimate] = await Promise.all([
      listItemBundles(),
      getSettings(),
      navigator.storage?.estimate?.() ?? Promise.resolve({ usage: 0 })
    ]);
    setItems(
      bundles.map(({ item, images, ingredients, logs }) => ({
        ...item,
        cover: images.find((image) => image.imageType === 'source'),
        ingredients,
        logs,
        latestRating: logs[0]?.rating ?? null,
        wouldRepeat: logs[0]?.wouldRepeat ?? null
      }))
    );
    setSettings(nextSettings);
    setStorageUsage(estimate.usage ?? 0);
  }, []);

  useEffect(() => {
    void reload().catch(() =>
      setToast('保存データを読み込めませんでした。ブラウザの保存設定を確認してください。')
    );
  }, [reload]);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if (!location.hash) history.replaceState(null, '', '#/home');
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const navigate = useCallback((target: string) => {
    location.hash = `#/${target}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const title = useMemo(() => {
    if (route.name === 'new') return '新しい記録';
    if (route.name === 'edit') return '記録を編集';
    if (route.name === 'item') return '記録の詳細';
    if (route.name === 'search') return '検索';
    if (route.name === 'backup') return 'バックアップ';
    if (route.name === 'settings') return '設定';
    return undefined;
  }, [route.name]);

  return (
    <Layout
      route={route.name}
      navigate={navigate}
      title={title}
      showBack={['item', 'edit'].includes(route.name)}
    >
      {!online && (
        <div className="offline-banner">
          オフラインです。保存済みデータの閲覧・編集は引き続き利用できます。
        </div>
      )}
      {needRefresh && (
        <div className="update-banner">
          <span>新しいバージョンを利用できます。</span>
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            更新する
          </button>
          <button type="button" onClick={() => setNeedRefresh(false)}>
            あとで
          </button>
        </div>
      )}
      {(route.name === 'home' || route.name === 'search') && (
        <HomePage
          items={items}
          settings={settings}
          storageUsage={storageUsage}
          navigate={navigate}
          searchMode={route.name === 'search'}
          showIosInstallTip={showIosInstallTip}
        />
      )}
      {route.name === 'new' && (
        <EditorPage
          settings={settings}
          onCancel={() => navigate('home')}
          onSaved={async (id) => {
            await reload();
            setToast('記録を保存しました。');
            navigate(`item/${id}`);
          }}
        />
      )}
      {route.name === 'edit' && route.id && (
        <EditorPage
          itemId={route.id}
          settings={settings}
          onCancel={() => navigate(`item/${route.id}`)}
          onSaved={async (id) => {
            await reload();
            setToast('変更を保存しました。');
            navigate(`item/${id}`);
          }}
        />
      )}
      {route.name === 'item' && route.id && (
        <DetailPage itemId={route.id} settings={settings} navigate={navigate} onChanged={reload} />
      )}
      {route.name === 'backup' && <BackupPage onChanged={reload} />}
      {route.name === 'settings' && <SettingsPage settings={settings} onChanged={reload} />}
      {toast && (
        <Toast
          message={toast}
          kind={toast.includes('失敗') || toast.includes('できません') ? 'error' : 'success'}
          onClose={() => setToast('')}
        />
      )}
    </Layout>
  );
}

function readRoute(): Route {
  const [name = 'home', id] = location.hash.replace(/^#\/?/, '').split('/');
  const valid: RouteName[] = ['home', 'search', 'new', 'backup', 'settings', 'item', 'edit'];
  return valid.includes(name as RouteName) ? { name: name as RouteName, id } : { name: 'home' };
}

function isAppleMobileDevice(): boolean {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneWebApp(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}
