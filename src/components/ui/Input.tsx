import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, icon, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5 ml-0.5">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            {icon}
          </div>
        )}
        <input
          className={`w-full h-10 bg-white border border-slate-200 text-slate-900 rounded-md focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500/50 placeholder-slate-400 transition-all text-sm ${icon ? 'pl-10' : 'pl-3'} ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string, enableVoice?: boolean }> = ({ label, className = '', enableVoice = false, ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5 ml-0.5">{label}</label>}
      <div className="relative group">
        <textarea
          className={`w-full bg-white border border-slate-200 text-slate-900 rounded-md focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500/50 placeholder-slate-400 transition-all text-sm px-3 py-2 ${className}`}
          {...props}
        />
      </div>
    </div>
  );
}