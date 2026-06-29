import { useState, useEffect } from "react";

export type TicketRecord = {
  id: string;
  projectId: string;
  code: string;
  title: string;
  status: string;
  description?: string;
  externalUrl?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function useTickets(projectId: string) {
  const [tickets, setTickets] = useState<TicketRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setTickets([]);
      return;
    }
    setLoading(true);
    window.testerbuddy?.getTickets(projectId).then((raw) => {
      setTickets((raw ?? []) as TicketRecord[]);
      setLoading(false);
    });
  }, [projectId]);

  return { tickets, loading };
}
