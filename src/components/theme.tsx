import { useEffect, useState } from "react";
import { IcoDia, IcoLuna } from "@/chasis/iconos";
const KEY = "karelys.theme";

export function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as "light" | "dark") || "light";
    setTheme(saved);
    document.documentElement.classList.toggle("dark", saved === "dark");
  }, []);
  const toggle = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(KEY, next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };
  return { theme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Cambiar tema"
      className="grid size-9 shrink-0 place-items-center rounded-md border border-rail-linea text-rail-texto-2 transition-colors duration-[140ms] hover:bg-rail-2 hover:text-rail-texto"
    >
      {theme === "light" ? <IcoLuna /> : <IcoDia />}
    </button>
  );
}
