import React from 'react';
import { Hexagon } from 'lucide-react';

interface NexusBrandingProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    showText?: boolean;
}

export const NexusBranding: React.FC<NexusBrandingProps> = ({
    className = '',
    size = 'md',
    showText = true
}) => {
    const sizes = {
        sm: { icon: 14, text: 'text-[8px]' },
        md: { icon: 20, text: 'text-[10px]' },
        lg: { icon: 28, text: 'text-xl' }
    };

    const current = sizes[size];

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <div className={`${size === 'lg' ? 'p-2 bg-indigo-600 rounded-xl' : 'p-1 bg-slate-900 rounded-lg'} shadow-sm`}>
                <Hexagon size={current.icon} className="text-white fill-white/10" />
            </div>
            {showText && (
                <h1 className={`${current.text} font-black text-slate-900 italic uppercase tracking-tighter leading-none`}>
                    Nexus<span className="text-indigo-600">.Pro</span>
                </h1>
            )}
        </div>
    );
};
