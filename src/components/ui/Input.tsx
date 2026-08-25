import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  labelClassName?: string;
  icon?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, labelClassName = '', icon, rightElement, className = '', ...props }) => {
  const hasCustomBg = className.includes('bg-');
  const hasCustomText = className.includes('text-');
  const hasCustomBorder = className.includes('border-');
  const bgClass = hasCustomBg ? '' : 'bg-white';
  const textClass = hasCustomText ? '' : 'text-slate-900';
  const borderClass = hasCustomBorder ? '' : 'border border-slate-200';

  return (
    <div className="w-full">
      {label && <label className={`block text-sm text-slate-700 mb-1.5 ml-0.5 ${labelClassName}`}>{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            {icon}
          </div>
        )}
        <input
          className={`w-full h-10 ${bgClass} ${borderClass} ${textClass} rounded-xl focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500/50 placeholder-slate-400 transition-all text-sm ${icon ? 'pl-10' : 'pl-3'} ${rightElement ? 'pr-10' : 'pr-3'} ${className}`}
          {...props}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center z-10 pointer-events-auto">
            {rightElement}
          </div>
        )}
      </div>
    </div>
  );
};

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string, enableVoice?: boolean }> = ({ label, className = '', enableVoice = false, ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm text-slate-700 mb-1.5 ml-0.5">{label}</label>}
      <div className="relative group">
        <textarea
          className={`w-full bg-white border border-slate-200 text-slate-900 rounded-xl focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500/50 placeholder-slate-400 transition-all text-sm px-3 py-2 ${className}`}
          {...props}
        />
      </div>
    </div>
  );
}