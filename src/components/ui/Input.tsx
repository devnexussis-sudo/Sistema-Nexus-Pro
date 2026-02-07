import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, icon, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-300">
            {icon}
          </div>
        )}
        <input
          className={`w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg focus:ring-4 focus:ring-primary-100 focus:border-primary-500 placeholder-slate-300 transition-all font-bold text-xs ${icon ? 'pl-10' : 'pl-4'} py-3 ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string, enableVoice?: boolean }> = ({ label, className = '', enableVoice = false, ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">{label}</label>}
      <div className="relative group">
        <textarea
          className={`w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-lg focus:ring-4 focus:ring-primary-100 focus:border-primary-500 placeholder-slate-300 transition-all font-bold text-xs px-4 py-3 pr-10 ${className}`}
          {...props}
        />
      </div>
    </div>
  );
}