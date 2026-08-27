import { useState, useEffect } from 'react';

/**
 * Reactive hook that detects whether the app is currently in Dark Mode or Light Mode.
 * It observes class changes on document.documentElement (e.g. class="dark" vs class="light")
 * so HTML5 Canvas redraw loops can adapt instantly when the user toggles theme.
 */
export function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof document === 'undefined') return true;
    return document.documentElement.classList.contains('dark') || !document.documentElement.classList.contains('light');
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const checkDark = () => {
      const isHtmlDark = document.documentElement.classList.contains('dark') || !document.documentElement.classList.contains('light');
      setIsDark(isHtmlDark);
    };

    checkDark();

    // Observe class/attribute changes on <html>
    const observer = new MutationObserver(checkDark);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    });

    window.addEventListener('storage', checkDark);

    return () => {
      observer.disconnect();
      window.removeEventListener('storage', checkDark);
    };
  }, []);

  return isDark;
}
