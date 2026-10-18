import React, { useEffect, useRef, useState, useCallback } from 'react';
import { VolumeX, Volume2, RotateCcw, Play, ExternalLink } from 'lucide-react';

interface InlineVideoPlayerProps {
  src: string;
  poster?: string;
  className?: string;
  autoPlay?: boolean;
}

/**
 * Detecta o tipo MIME com base na extensão/URL do vídeo.
 * Navegadores mobile (iOS Safari, Chrome Android) são exigentes com MIME types.
 */
const detectVideoMime = (url: string): string => {
  const lower = url.toLowerCase().split('?')[0].split('#')[0];
  if (lower.endsWith('.mp4') || lower.includes('/form_videos/') || lower.includes('/videos/')) return 'video/mp4';
  if (lower.endsWith('.webm')) return 'video/webm';
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.3gp')) return 'video/3gpp';
  if (lower.endsWith('.avi')) return 'video/x-msvideo';
  if (lower.endsWith('.mkv')) return 'video/x-matroska';
  // Padrão seguro para maioria dos vídeos de campo (gravados pelo celular = mp4/h264)
  return 'video/mp4';
};

export const InlineVideoPlayer: React.FC<InlineVideoPlayerProps> = ({
  src,
  poster,
  className = '',
  autoPlay = true,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [hasFatalError, setHasFatalError] = useState(false);
  const [needsTapToPlay, setNeedsTapToPlay] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const mimeType = detectVideoMime(src);

  // Inicialização e reinício ao trocar de mídia
  useEffect(() => {
    setHasFatalError(false);
    setNeedsTapToPlay(false);
    setIsPlaying(false);
    setRetryCount(0);

    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    setIsMuted(true);

    // Carrega a nova fonte explicitamente
    video.load();

    if (autoPlay) {
      // Tenta autoplay mudo — permitido pela maioria dos browsers mobile
      const playPromise = video.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            setIsPlaying(true);
            setNeedsTapToPlay(false);
          })
          .catch(() => {
            // Autoplay bloqueado pelo navegador mobile — mostra overlay de tap-to-play
            setNeedsTapToPlay(true);
            setIsPlaying(false);
          });
      }
    } else {
      setNeedsTapToPlay(true);
    }
  }, [src, autoPlay]);

  // Handler para tap-to-play (obrigatório para iOS Safari sem autoplay)
  const handleTapToPlay = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;

    video.muted = true; // Começa mudo para garantir que o play seja permitido
    setIsMuted(true);
    video.load();
    
    const playPromise = video.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise
        .then(() => {
          setIsPlaying(true);
          setNeedsTapToPlay(false);
        })
        .catch(() => {
          // Última tentativa: abrir em nova aba
          setHasFatalError(true);
        });
    }
  }, []);

  // Desbloqueio de áudio em 1 toque
  const handleToggleSound = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
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
  }, []);

  // Retry handler com reload
  const handleRetry = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setHasFatalError(false);
    setNeedsTapToPlay(false);
    setRetryCount(prev => prev + 1);

    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    setIsMuted(true);
    video.load();
    
    setTimeout(() => {
      const p = video.play();
      if (p && typeof p.then === 'function') {
        p.then(() => {
          setIsPlaying(true);
        }).catch(() => {
          setNeedsTapToPlay(true);
        });
      }
    }, 300);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative flex items-center justify-center bg-black overflow-hidden select-none rounded-2xl sm:rounded-3xl shadow-2xl ${className}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 
        <video> com <source> explícito e type MIME para mobile browsers.
        crossOrigin="anonymous" necessário para R2/Cloudflare CDN com CORS.
        Controles nativos ativados para máxima compatibilidade de hardware.
      */}
      <video
        ref={videoRef}
        key={`${src}-${retryCount}`}
        poster={poster}
        controls
        playsInline
        // Atributos essenciais para iOS Safari e WebView Android
        {...({
          'webkit-playsinline': 'true',
          'x-webkit-airplay': 'allow',
          'x5-playsinline': 'true',
          'x5-video-player-type': 'h5-page',
          'x5-video-player-fullscreen': 'true',
        } as any)}
        autoPlay={autoPlay}
        muted={isMuted}
        preload="auto"
        crossOrigin="anonymous"
        className="max-w-full max-h-[75vh] sm:max-h-[82vh] w-auto h-auto object-contain bg-black block pointer-events-auto"
        style={{
          // Força dimensionamento correto no Safari mobile
          WebkitTransform: 'translateZ(0)',
          transform: 'translateZ(0)',
        }}
        onPlay={() => {
          setIsPlaying(true);
          setNeedsTapToPlay(false);
        }}
        onPause={() => setIsPlaying(false)}
        onVolumeChange={() => {
          if (videoRef.current) {
            setIsMuted(videoRef.current.muted);
          }
        }}
        onLoadedData={() => {
          setHasFatalError(false);
          setNeedsTapToPlay(false);
        }}
        onCanPlay={() => {
          // Quando o vídeo está pronto para tocar, tenta play novamente se necessário
          if (autoPlay && !isPlaying) {
            const video = videoRef.current;
            if (video && video.paused) {
              video.play().then(() => {
                setIsPlaying(true);
                setNeedsTapToPlay(false);
              }).catch(() => {
                setNeedsTapToPlay(true);
              });
            }
          }
        }}
        onError={(e) => {
          const video = e.currentTarget;
          const err = video.error;
          console.warn('[InlineVideoPlayer] Evento de erro:', err?.code, err?.message, 'src:', src);
          // Apenas exibe aviso caso haja erro irrecuperável comprovado de codec/rede
          if (err && (err.code === 3 || err.code === 4)) {
            setHasFatalError(true);
          } else if (err && err.code === 2) {
            // Network error — pode ser CORS ou conexão. Tenta de novo 1x.
            if (retryCount < 1) {
              setRetryCount(prev => prev + 1);
              setTimeout(() => {
                video.load();
                video.play().catch(() => setNeedsTapToPlay(true));
              }, 500);
            } else {
              setHasFatalError(true);
            }
          }
        }}
      >
        {/* <source> com type explícito — essencial para mobile browsers detectarem codec */}
        <source src={src} type={mimeType} />
        Seu navegador não suporta a reprodução deste vídeo.
      </video>

      {/* Overlay tap-to-play para navegadores mobile que bloqueiam autoplay */}
      {needsTapToPlay && !hasFatalError && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
          onClick={handleTapToPlay}
          onTouchEnd={handleTapToPlay}
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/20 backdrop-blur-md border-2 border-white/40 flex items-center justify-center shadow-2xl hover:bg-white/30 active:scale-90 transition-all">
            <Play size={32} className="text-white fill-white ml-1" />
          </div>
          <span className="mt-3 text-white text-sm font-semibold tracking-wide bg-black/50 px-4 py-1.5 rounded-full">
            Toque para reproduzir
          </span>
        </div>
      )}

      {/* Pílula de ativar som (se o vídeo estiver mudo e tocando) */}
      {isMuted && isPlaying && !hasFatalError && !needsTapToPlay && (
        <button
          onClick={handleToggleSound}
          onTouchEnd={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3.5 py-1.5 bg-black/80 hover:bg-black/95 active:scale-95 border border-white/20 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all animate-pulse pointer-events-auto cursor-pointer"
        >
          <VolumeX size={15} className="text-amber-400" />
          <span>Toque para ativar o som</span>
        </button>
      )}

      {/* Som ativado - botão para mutar novamente */}
      {!isMuted && isPlaying && !hasFatalError && (
        <button
          onClick={handleToggleSound}
          onTouchEnd={handleToggleSound}
          className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 bg-black/60 hover:bg-black/80 active:scale-95 border border-white/15 rounded-full text-white text-xs font-semibold backdrop-blur-md shadow-lg transition-all pointer-events-auto cursor-pointer"
        >
          <Volume2 size={15} className="text-emerald-400" />
          <span>Som ativado</span>
        </button>
      )}

      {/* Aviso de falha com retry e link direto */}
      {hasFatalError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-6 text-center">
          <div className="bg-red-950/90 border border-red-500/50 rounded-2xl p-5 max-w-sm w-full shadow-2xl">
            <p className="text-white text-sm font-semibold mb-1">Vídeo indisponível no navegador</p>
            <p className="text-red-200/80 text-xs mb-4">Formato não suportado ou erro de rede. Tente as opções abaixo.</p>
            
            <div className="flex flex-col gap-2">
              <button
                onClick={handleRetry}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-white/15 hover:bg-white/25 rounded-xl text-white text-sm font-bold transition-all active:scale-95"
              >
                <RotateCcw size={14} />
                Tentar novamente
              </button>
              
              <a
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600/80 hover:bg-blue-600 rounded-xl text-white text-sm font-bold transition-all active:scale-95 no-underline"
              >
                <ExternalLink size={14} />
                Abrir vídeo em nova aba
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
