import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import PrintNotification from "./PrintNotification";

type NotificationVariant = "success" | "error" | "info";

type Notification = {
  id: string;
  message: string;
  variant: NotificationVariant;
  duration: number;
};

type NotificationContextValue = {
  notify: (
    message: string,
    options?: { variant?: NotificationVariant; duration?: number },
  ) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

function createId() {
  return `notice_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notification[]>([]);

  const notify = useCallback(
    (
      message: string,
      options: { variant?: NotificationVariant; duration?: number } = {},
    ) => {
      const id = createId();
      const next: Notification = {
        id,
        message,
        variant: options.variant ?? "info",
        duration: options.duration ?? 14000,
      };

      setItems((prev) => [next, ...prev]);
    },
    [],
  );

  const handleDismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="notification-stack" role="status" aria-live="polite">
        {items.map((item) => (
          <PrintNotification
            key={item.id}
            message={item.message}
            variant={item.variant}
            duration={item.duration}
            onDismiss={() => handleDismiss(item.id)}
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      "useNotifications must be used within NotificationProvider",
    );
  }
  return ctx;
}
