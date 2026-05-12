import { createContext, useContext, useState, useEffect } from 'react';

const AppContext = createContext(null);

// Storage keys
const API_KEY_STORAGE = 'oncf.openrouter.apiKey';

export function AppProvider({ children }) {
  // API key — seeds from env variable, then localStorage, then empty
  const [apiKey, setApiKeyState] = useState(() => {
    // Priority: localStorage (user-saved) > env var (dev default) > empty
    try {
      const stored = localStorage.getItem(API_KEY_STORAGE);
      if (stored) return stored;
    } catch (e) {
      // localStorage might be disabled (private mode); fall through
    }
    return import.meta.env.VITE_OPENROUTER_KEY || '';
  });

  // User info set at login
  const [user, setUser] = useState(null); // { username, initials, displayName }

  // Persist API key across reloads
  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem(API_KEY_STORAGE, apiKey);
      else localStorage.removeItem(API_KEY_STORAGE);
    } catch (e) {
      /* localStorage unavailable */
    }
  }, [apiKey]);

  const setApiKey = (key) => setApiKeyState(key);

  const login = (username) => {
    const clean = username.trim() || 'mdaittouda';
    setUser({
      username: clean,
      initials: clean.substring(0, 2).toUpperCase(),
      displayName: clean.charAt(0).toUpperCase() + clean.slice(1),
    });
  };

  const logout = () => setUser(null);

  return (
    <AppContext.Provider value={{ apiKey, setApiKey, user, login, logout }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}
