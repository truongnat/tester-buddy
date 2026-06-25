import { useState, useEffect } from "react";

export function useConnection() {
  const [connectionCount, setConnectionCount] = useState(0);

  useEffect(() => {
    // Get initial connection count
    window.testerbuddy?.getConnectionCount().then((count) => {
      setConnectionCount(count);
    });

    // Subscribe to socket connection change events
    const unsubscribe = window.testerbuddy?.onConnectionChange((count) => {
      setConnectionCount(count);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  return {
    connectionCount,
    isConnected: connectionCount > 0,
  };
}
