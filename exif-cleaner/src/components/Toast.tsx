import { useEffect } from "react";

type ToastProps = {
  message: string | null;
  onClose: () => void;
};

export default function Toast({ message, onClose }: ToastProps) {
  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(onClose, 2800);
    return () => window.clearTimeout(timeout);
  }, [message, onClose]);

  if (!message) return null;
  return <div className="toast">{message}</div>;
}
