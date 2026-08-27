import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { triggerHapticFeedback } from '../lib/haptics';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, options?: { title?: string; duration?: number }) => void;
  showSuccess: (message: string, title?: string) => void;
  showError: (message: string, title?: string) => void;
  showWarning: (message: string, title?: string) => void;
  showInfo: (message: string, title?: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', options?: { title?: string; duration?: number }) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const duration = options?.duration ?? (type === 'error' ? 6000 : 4000);

      // Trigger tactile haptic feedback for user assurance
      if (type === 'success') {
        triggerHapticFeedback('SUCCESS');
      } else if (type === 'error') {
        triggerHapticFeedback('ERROR');
      } else if (type === 'warning') {
        triggerHapticFeedback('WARNING');
      } else {
        triggerHapticFeedback('LIGHT');
      }

      const newToast: ToastItem = {
        id,
        type,
        title: options?.title,
        message,
        duration
      };

      setToasts(prev => [...prev.slice(-4), newToast]); // Limit to max 5 simultaneous toasts

      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast]
  );

  const showSuccess = useCallback((msg: string, title?: string) => showToast(msg, 'success', { title }), [showToast]);
  const showError = useCallback((msg: string, title?: string) => showToast(msg, 'error', { title }), [showToast]);
  const showWarning = useCallback((msg: string, title?: string) => showToast(msg, 'warning', { title }), [showToast]);
  const showInfo = useCallback((msg: string, title?: string) => showToast(msg, 'info', { title }), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccess, showError, showWarning, showInfo, dismissToast }}>
      {children}

      {/* Floating Toast Portal */}
      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-3 sm:px-0"
        aria-live="polite"
      >
        {toasts.map(toast => {
          let bgClass = 'bg-[#141414] border-white/10 text-white';
          let icon = <Info className="w-5 h-5 text-sky-400 shrink-0" />;

          if (toast.type === 'success') {
            bgClass = 'bg-[#121c16] border-emerald-500/40 text-emerald-100 shadow-emerald-950/40';
            icon = <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
          } else if (toast.type === 'error') {
            bgClass = 'bg-[#221314] border-rose-500/40 text-rose-100 shadow-rose-950/40';
            icon = <XCircle className="w-5 h-5 text-rose-400 shrink-0" />;
          } else if (toast.type === 'warning') {
            bgClass = 'bg-[#221c10] border-amber-500/40 text-amber-100 shadow-amber-950/40';
            icon = <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
          }

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-200 animate-fadeIn ${bgClass}`}
            >
              {icon}
              <div className="flex-1 text-xs">
                {toast.title && <h5 className="font-bold text-white mb-0.5">{toast.title}</h5>}
                <p className="leading-relaxed opacity-90">{toast.message}</p>
              </div>
              <button
                onClick={() => dismissToast(toast.id)}
                className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                title="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // Fallback if rendered outside provider
    return {
      showToast: (m) => console.log('Toast:', m),
      showSuccess: (m) => console.log('Success:', m),
      showError: (m) => console.error('Error:', m),
      showWarning: (m) => console.warn('Warning:', m),
      showInfo: (m) => console.info('Info:', m),
      dismissToast: () => {}
    };
  }
  return context;
}
