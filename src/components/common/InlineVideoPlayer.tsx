import React, { useEffect, useRef, useState } from 'react';
import { VolumeX, RotateCcw } from 'lucide-react';

interface InlineVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
}

export const InlineVideoPlayer: React.FC<InlineVideoPlayerProps> = ({
  src,
  poster,
  className = '',
  autoPlay = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [hasFatalError, setHasFatalError] = useState(false);

  // Inicialização e reinício ao trocar de mídia
  useEffect(() => {
    setHasFatalError(false);
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    setIsMuted(true);

    if (autoPlay) {
      // Inicia autoplay mudo (permitido por 100% dos navegadores mobile)
      video.play().catch(() => {
        // Se o navegador móvel suspender autoplay, os controles nativos continuam ativos para dar play direto
      });
    }
  }, [src, autoPlay]);

  // Desbloqueio de áudio em 1 toque (Padrão BigTech)
  const handleToggleSound = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;

    if (video.muted) {
      video.muted = false;
      setIsMuted(false);
      video.play().catch(() => {});
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  return (
    <div
      className={`relative flex items-center justify-center bg-black overflow-hidden select-none rounded-2xl sm:rounded-3xl shadow-2xl ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 
        Elemento nativo com src direto (SEM tag <source> para não quebrar a máquina de estados do WebKit móvel).
        Controles nativos ativados para compatibilidade de hardware total em iOS Safari e Android Chrome.
      */}
      <video
        ref={videoRef}
        key={src}
        src={src}
        poster={poster}
        controls
        playsInline
        {...({
          'webkit-playsinline': 'true',
          'x5-playsinline': 'true',
          'x5-video-player-type': 'h5-page'
        } as any)}
        autoPlay={autoPlay}
        muted={isMuted}
        preload="auto"
        className="max-w-full max-h-[75vh] sm:max-h-[82vh] w-auto h-auto object-contain bg-black block pointer-events-auto"
        onVolumeChange={() => {
          if (videoRef.current) {
            setIsMuted(videoRef.current.muted);
          }
        }}
        onError={(e) => {
          const video = e.currentTarget;
          const err = video.error;
          console.warn('[InlineVideoPlayer] Evento de erro:', err?.code, err?.message);
          // Apenas exibe aviso caso haja erro irrecuperável comprovado de codec/rede
          if (err && (err.code === 3 || err.code === 4)) {
            setHasFatalError(true);
          }
        }}
      >
        Seu navegador não suporta a reprodução deste vídeo inline.
      </video>

      {/* Pílula Flutuante BigTech para ativar som (se o vídeo estiver mudo para permitir autoplay imediato) */}
      {isMuted && !hasFatalError && (
        <button
          onClick={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3.5 py-1.5 bg-black/80 hover:bg-black/95 active:scale-95 border border-white/20 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all animate-pulse pointer-events-auto cursor-pointer"
        >
          <VolumeX size={15} className="text-amber-400" />
          <span>Toque para ativar o som</span>
        </button>
      )}

      {/* Aviso discreto em caso de falha de codec/rede sem cobrir o elemento */}
      {hasFatalError && (
        <div className="absolute bottom-16 inset-x-4 z-30 flex items-center justify-between p-3 bg-red-950/90 border border-red-500/50 rounded-xl text-white text-xs backdrop-blur-md shadow-2xl">
          <span>Formato não suportado pelo navegador móvel.</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setHasFatalError(false);
              if (videoRef.current) {
                videoRef.current.load();
                videoRef.current.play().catch(() => {});
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg font-bold"
          >
            <RotateCcw size={12} />
            Recarregar
          </button>
        </div>
      )}
    </div>
  );
};
