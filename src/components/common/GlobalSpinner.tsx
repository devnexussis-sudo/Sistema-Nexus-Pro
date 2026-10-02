import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * 🚀 RouteProgressBar — Single-Fire Page Switch Progress Indicator
 * 
 * Fires EXCLUSIVELY ONCE when switching pages (location.pathname changes).
 * ZERO fetch tracking, ZERO data update tracking, ZERO duplicate animations.
 */
export const GlobalSpinnerProvider: React.FC = () => {
    const location = useLocation();
    const barRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const prevPathRef = useRef(location.pathname);
    const animationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Executa APENAS quando o caminho da página realmente mudar
        if (prevPathRef.current === location.pathname) return;
        prevPathRef.current = location.pathname;

        const container = containerRef.current;
        const bar = barRef.current;
        if (!container || !bar) return;

        // Limpa temporizadores de animações anteriores
        if (animationTimer.current) {
            clearTimeout(animationTimer.current);
        }

        // 1. Reset instantâneo no início da troca de página
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(0)';
        bar.style.opacity = '1';
        container.style.opacity = '1';

        // 2. Force reflow para garantir a aplicação imediata da posição inicial (0%)
        bar.offsetHeight; // eslint-disable-line

        // 3. Animação única e fluida de 0% a 100% exclusiva da troca de página
        bar.style.transition = 'transform 350ms cubic-bezier(0.1, 0.6, 0.4, 1)';
        bar.style.transform = 'scaleX(1)';

        // 4. Desaparece suavemente assim que atinge 100%
        animationTimer.current = setTimeout(() => {
            container.style.opacity = '0';
        }, 380);

    }, [location.pathname]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 99999,
                pointerEvents: 'none',
                opacity: 0,
                transition: 'opacity 200ms ease',
                height: '3px',
            }}
        >
            <div
                ref={barRef}
                style={{
                    height: '100%',
                    width: '100%',
                    transformOrigin: 'left',
                    transform: 'scaleX(0)',
                    background: 'linear-gradient(90deg, #1c2d4f, #253a66, #3b82f6)',
                    boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
                    borderRadius: '0 2px 2px 0',
                }}
            />
        </div>
    );
};
