import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, icon, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>}
      <div className="relative">
        {icon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            {icon}
          </div>
        )}
        <input
          className={`w-full bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-gray-400 transition-colors ${icon ? 'pl-10' : 'pl-4'} py-2 ${className}`}
          {...props}
        />
      </div>
    </div>
  );
};

export const TextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string, enableVoice?: boolean }> = ({ label, className = '', enableVoice = false, ...props }) => {
  return (
    <div className="w-full space-y-2">
      {label && <label className="block text-sm font-medium text-gray-600 mb-1">{label}</label>}
      <div className="relative group">
        <textarea
          className={`w-full bg-white border border-gray-300 text-gray-900 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent placeholder-gray-400 transition-colors px-4 py-2 pr-10 ${className}`}
          {...props}
        />
      </div>
    </div>
  );
}