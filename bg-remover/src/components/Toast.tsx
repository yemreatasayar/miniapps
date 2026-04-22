import { useEffect } from "react";

type Props = {
  message: string | null;
  onClose: () => void;
};

export default function Toast({ message, onClose }: Props) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="toast" role="alert">
      {message}
    </div>
  );
}
