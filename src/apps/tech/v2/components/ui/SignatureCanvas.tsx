
import React, { useRef, useEffect, useState } from 'react';

interface SignatureCanvasProps {
    onEnd: (base64: string) => void;
    onClear?: () => void;
}

export const SignatureCanvas: React.FC<SignatureCanvasProps> = ({ onEnd, onClear }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Ajuste de DPI para telas retina
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = canvas.offsetWidth * ratio;
        canvas.height = canvas.offsetHeight * ratio;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.scale(ratio, ratio);

        // Previne scroll ao desenhar
        const preventScroll = (e: TouchEvent) => {
            if (e.target === canvas) e.preventDefault();
        };
        document.body.addEventListener('touchstart', preventScroll, { passive: false });
        document.body.addEventListener('touchmove', preventScroll, { passive: false });

        return () => {
            document.body.removeEventListener('touchstart', preventScroll);
            document.body.removeEventListener('touchmove', preventScroll);
        };
    }, []);

    const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        // Touch
        if ('touches' in e) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        // Mouse
        return {
            x: (e as React.MouseEvent).clientX - rect.left,
            y: (e as React.MouseEvent).clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const { x, y } = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#FFFFFF'; // Assinatura branca para tema dark
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const { x, y } = getCoords(e);
        ctx.lineTo(x, y);
        ctx.stroke();
        setHasSignature(true);
    };

    const endDrawing = () => {
        setIsDrawing(false);
        if (canvasRef.current && hasSignature) {
            onEnd(canvasRef.current.toDataURL('image/png'));
        }
    };

    const clear = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
        if (onClear) onClear();
    };

    return (
        <div className="relative w-full h-48 bg-white/5 border-2 border-dashed border-white/20 rounded-2xl overflow-hidden touch-none">
            <canvas
                ref={canvasRef}
                className="w-full h-full"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={endDrawing}
                onMouseLeave={endDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={endDrawing}
            />
            {!hasSignature && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-500 text-xs font-bold uppercase tracking-widest opacity-50">
                    Assine aqui
                </div>
            )}
            {hasSignature && (
                <button
                    onClick={clear}
                    className="absolute top-2 right-2 text-xs text-red-400 font-bold uppercase tracking-wider bg-red-500/10 px-2 py-1 rounded"
                >
                    Limpar
                </button>
            )}
        </div>
    );
};
