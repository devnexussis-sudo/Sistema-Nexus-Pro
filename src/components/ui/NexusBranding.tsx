import React from 'react';

interface NexusBrandingProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    showText?: boolean;
    variant?: 'light' | 'dark'; // 'light' para fundos escuros (logo branca), 'dark' para fundos claros (logo azul)
}

export const NexusBranding: React.FC<NexusBrandingProps> = ({
    className = '',
    size = 'md',
    showText = true,
    variant = 'dark'
}) => {
    const [imageLoaded, setImageLoaded] = React.useState(false);

    const sizes = {
        sm: { icon: 'h-4', text: 'text-[10px]' },
        md: { icon: 'h-6', text: 'text-sm' },
        lg: { icon: 'h-24', text: 'text-2xl' }
    };

    const current = sizes[size];

    return (
        <div className={`flex items-center gap-2.5 ${className}`}>
            <div className="flex items-center justify-center shrink-0">
                <img
                    src="/nexus-logo.png"
                    alt="Nexus Line"
                    style={{
                        height: current.icon.replace('h-', '') === '24' ? '106px' :
                            current.icon.replace('h-', '') === '6' ? '26px' : '18px'
                    }}
                    className={`${current.icon} w-auto object-contain max-w-none scale-125`}
                    onLoad={() => setImageLoaded(true)}
                    onError={(e) => {
                        setImageLoaded(false);
                        e.currentTarget.style.display = 'none';
                        const svg = e.currentTarget.nextElementSibling;
                        if (svg) svg.classList.remove('hidden');
                    }}
                />
                <svg
                    viewBox="0 0 24 24"
                    className={`${current.icon} ${variant === 'light' ? 'text-white' : 'text-[#1c2d4f]'} fill-current hidden`}
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-4.5-9h9c.28 0 .5.22.5.5s-.22.5-.5.5h-9c-.28 0-.5-.22-.5-.5s.22-.5.5-.5z" />
                </svg>
            </div>
            {showText && !imageLoaded && (
                <div className="flex flex-col leading-none">
                    <h1 className={`${current.text} font-bold tracking-tight ${variant === 'light' ? 'text-white' : 'text-slate-900'} uppercase`}>
                        Nexus<span className={variant === 'light' ? 'text-white/70' : 'text-slate-400'}>Line</span>
                    </h1>
                </div>
            )}
        </div>
    );
};
