import { useCallback, useEffect, useState } from 'react';
import { Home } from './components/Home.tsx';
import { Reels } from './components/Reels.tsx';
import { readRoute, toUrl, type Route } from './lib/params.ts';

export function App() {
  const [route, setRoute] = useState<Route>(() => readRoute());

  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((next: Route) => {
    history.pushState(null, '', toUrl(next));
    setRoute(next);
  }, []);

  useEffect(() => {
    if (route.kind !== 'lesson') {
      document.title = route.kind === 'generate' ? `${route.topic} · Reelearn` : 'Reelearn';
    }
  }, [route]);

  const goHome = () => navigate({ kind: 'home' });
  return route.kind === 'home' ? (
    <Home
      onStart={(p) => navigate({ kind: 'generate', ...p })}
      onOpen={(id) => navigate({ kind: 'lesson', id })}
    />
  ) : (
    <Reels key={toUrl(route)} route={route} onHome={goHome} />
  );
}
