export type Theme = 'light' | 'dark';

const THEME_KEY = 'theme';

// Roda ainda no <head>, antes da hidratação, pra não piscar o tema errado
// na tela por uma fração de segundo.
export const themeInitScript = `
(function () {
  try {
    var stored = window.localStorage.getItem('${THEME_KEY}');
    var theme = stored === 'light' ? 'light' : 'dark';
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {}
})();
`;

export function getTheme(): Theme {
    if (typeof window === 'undefined') {
        return 'dark';
    }

    return document.documentElement.classList.contains('dark')
        ? 'dark'
        : 'light';
}

export function setTheme(theme: Theme) {
    if (typeof window === 'undefined') {
        return;
    }

    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }

    window.localStorage.setItem(THEME_KEY, theme);
}

export function toggleTheme(): Theme {
    const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
    setTheme(next);
    return next;
}
