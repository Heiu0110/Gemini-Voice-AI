import React, { useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info';

interface NotificationProps {
  message: string;
  type?: NotificationType;
  isVisible: boolean;
  onClose: () => void;
}

const Notification: React.FC<NotificationProps> = ({ 
  message, 
  type = 'info', 
  isVisible, 
  onClose 
}) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 5000); // Auto close after 5s
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const styles = {
    success: 'bg-emerald-500/10 border-emerald-500/50 text-emerald-200',
    error: 'bg-red-500/10 border-red-500/50 text-red-200',
    info: 'bg-blue-500/10 border-blue-500/50 text-blue-200'
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
    error: <AlertTriangle className="w-5 h-5 text-red-400" />,
    info: <Info className="w-5 h-5 text-blue-400" />
  };

  return (
    <div className="fixed top-20 right-4 z-50 animate-in fade-in slide-in-from-right-5 duration-300 max-w-sm w-full">
      <div className={`flex items-start gap-3 p-4 rounded-lg border backdrop-blur-md shadow-xl ${styles[type]}`}>
        <div className="flex-shrink-0 mt-0.5">
          {icons[type]}
        </div>
        <div className="flex-1 text-sm font-medium">
          {message}
        </div>
        <button 
          onClick={onClose}
          className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default Notification;