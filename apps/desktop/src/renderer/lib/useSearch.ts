import { useState, useMemo, useRef } from "react";

export function useSearch<T>(items: T[], extractSearchText: (item: T) => string) {
  const [query, setQuery] = useState("");
  const extractRef = useRef(extractSearchText);
  extractRef.current = extractSearchText;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => extractRef.current(item).toLowerCase().includes(q));
  }, [items, query]);

  return { query, setQuery, filtered };
}
