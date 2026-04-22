import { useEffect } from "react";

type ToastProps = {
  message: string | null;
  onClose: () => void;
};

export default function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const timeoutId = window.setTimeout(onClose, 2600);
    return () => window.clearTimeout(timeoutId);
  }, [message, onClose]);

  if (!message) return null;

  return <div className="toast">{message}</div>;
}
