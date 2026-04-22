import { useEffect } from "react";

type ToastProps = {
  message: string | null;
  onClose: () => void;
};

export default function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => {
      onClose();
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return <div className="toast">{message}</div>;
}
