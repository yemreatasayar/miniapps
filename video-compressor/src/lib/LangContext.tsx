import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { type Lang, type Strings, readStoredLang, saveStoredLang, strings } from "./i18n";

type LangContextValue = {
  lang: Lang;
  t: Strings;
  toggleLang: () => void;
};

const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(readStoredLang);

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next: Lang = prev === "tr" ? "en" : "tr";
      saveStoredLang(next);
      return next;
    });
  }, []);

  return (
    <LangContext.Provider value={{ lang, t: strings[lang], toggleLang }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LangProvider");
  return ctx;
}
