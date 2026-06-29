import { useState, useEffect } from "react";

export type ProjectRecord = {
  id: string;
  name: string;
  key: string;
  url?: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function useProjects() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    window.testerbuddy?.getProjects().then((raw) => {
      setProjects((raw ?? []) as ProjectRecord[]);
      setLoading(false);
    });
  };

  useEffect(() => {
    refresh();
  }, []);

  return { projects, loading, refresh };
}
