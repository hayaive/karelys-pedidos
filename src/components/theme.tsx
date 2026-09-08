import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

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
      className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
