import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    View, 
    Text, 
    StyleSheet, 
    TouchableOpacity, 
    ActivityIndicator, 
    Image, 
    Dimensions, 
    Platform,
    Animated,
    GestureResponderEvent,
    Alert
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import type { CameraType, FocusMode } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { 
    X, 
    FlipHorizontal, 
    Video, 
    Square, 
    Camera, 
    RotateCcw, 
    Check, 
    Zap, 
    ZapOff 
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface NexusCameraProps {
    onClose: () => void;
    mode?: 'photo' | 'video';
    onPhotoCaptured?: (uri: string) => void;
    onVideoRecorded?: (uri: string, hitLimit?: boolean) => void;
    qualityMode?: 'basic' | 'hd';
}

export default function NexusCamera({ 
    onClose, 
    mode = 'photo',
    onPhotoCaptured, 
    onVideoRecorded, 
    qualityMode = 'hd' 
}: NexusCameraProps) {
    const [camPermission, requestCamPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    const insets = useSafeAreaInsets();
    
    const MAX_RECORDING_SECONDS = 77;
    const isLimitReachedRef = useRef(false);

    const [facing, setFacing] = useState<CameraType>('back');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [zoom, setZoom] = useState(0);
    const [torch, setTorch] = useState(false);
    // 'off' no expo-camera ativa o Autofocus Contínuo (reajusta o foco automaticamente sempre que a câmera se move)
    const [focusMode, setFocusMode] = useState<FocusMode>('off');
    const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [cameraKey, setCameraKey] = useState(0);

    // Estado e animações de Toque para Focar (Tap-to-Focus)
    const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
    const focusOpacity = useRef(new Animated.Value(0)).current;
    const focusScale = useRef(new Animated.Value(1.3)).current;

    // Efeito de Flash de Obturador (Shutter Freeze / Flash)
    const shutterFlashAnim = useRef(new Animated.Value(0)).current;

    // Refs para Pinch-to-zoom e Tap gesture
    const pinchStartDistRef = useRef<number | null>(null);
    const pinchStartZoomRef = useRef<number>(0);
    const touchStartTimeRef = useRef<number>(0);
    const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

    const cameraRef = useRef<CameraView>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Gestão de permissões
    useEffect(() => {
        (async () => {
            if (!camPermission?.granted) await requestCamPermission();
            if (mode === 'video' && !micPermission?.granted) await requestMicPermission();
        })();
    }, []);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const onCameraReady = useCallback(() => {
        setIsCameraReady(true);
    }, []);

    const toggleCameraFacing = () => {
        Haptics.selectionAsync().catch(() => {});
        setFacing(current => (current === 'back' ? 'front' : 'back'));
    };

    const toggleTorch = () => {
        Haptics.selectionAsync().catch(() => {});
        setTorch(prev => !prev);
    };

    // ─── Toque para focar com animação de retículo e ciclo de autofoco ───
    const triggerFocus = (x: number, y: number) => {
        setFocusPoint({ x, y });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

        // Re-ativa o ciclo de foco da lente para focar no alvo apontado
        setFocusMode('on');
        setTimeout(() => {
            setFocusMode('off');
        }, 400);

        // Animação de retículo de foco (pulso suave e fade-out estilo iOS/Pixel)
        focusOpacity.setValue(1);
        focusScale.setValue(1.3);

        Animated.parallel([
            Animated.spring(focusScale, {
                toValue: 1,
                friction: 6,
                tension: 80,
                useNativeDriver: true,
            }),
            Animated.sequence([
                Animated.delay(900),
                Animated.timing(focusOpacity, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                })
            ])
        ]).start(() => {
            setFocusPoint(null);
        });
    };

    // ─── Gestos na tela: Pinch-to-Zoom e Tap-to-Focus ───
    const handleTouchStart = (e: GestureResponderEvent) => {
        const touches = e.nativeEvent.touches;
        if (touches.length === 2) {
            // Início da pinça (Pinch-to-zoom)
            const dist = Math.hypot(
                touches[0].pageX - touches[1].pageX,
                touches[0].pageY - touches[1].pageY
            );
            pinchStartDistRef.current = dist;
            pinchStartZoomRef.current = zoom;
        } else if (touches.length === 1) {
            touchStartTimeRef.current = Date.now();
            touchStartPosRef.current = { x: touches[0].locationX, y: touches[0].locationY };
        }
    };

    const handleTouchMove = (e: GestureResponderEvent) => {
        const touches = e.nativeEvent.touches;
        if (touches.length === 2 && pinchStartDistRef.current !== null) {
            const dist = Math.hypot(
                touches[0].pageX - touches[1].pageX,
                touches[0].pageY - touches[1].pageY
            );
            const delta = dist - pinchStartDistRef.current;
            // Sensibilidade calibrada para pinça de tela cheia
            const zoomDelta = delta / (SCREEN_WIDTH * 0.7);
            const nextZoom = Math.min(Math.max(pinchStartZoomRef.current + zoomDelta, 0), 1);
            setZoom(nextZoom);
        }
    };

    const handleTouchEnd = (e: GestureResponderEvent) => {
        const touches = e.nativeEvent.touches;
        if (touches.length < 2) {
            pinchStartDistRef.current = null;
        }

        // Detecção de Tap para Foco (toque rápido e sem arrasto)
        if (e.nativeEvent.changedTouches.length === 1 && touchStartPosRef.current) {
            const touch = e.nativeEvent.changedTouches[0];
            const duration = Date.now() - touchStartTimeRef.current;
            const moveDist = Math.hypot(
                touch.locationX - touchStartPosRef.current.x,
                touch.locationY - touchStartPosRef.current.y
            );

            if (duration < 300 && moveDist < 18) {
                triggerFocus(touch.locationX, touch.locationY);
            }
            touchStartPosRef.current = null;
        }
    };

    const stopRecordingDueToLimit = useCallback(() => {
        if (isLimitReachedRef.current) return;
        isLimitReachedRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setIsRecording(false);
        stopTimer();
        try {
            cameraRef.current?.stopRecording();
        } catch (e) {
            console.warn('[NexusCamera] Erro ao parar gravação no limite:', e);
        }
    }, []);

    const startTimer = () => {
        setRecordingTime(0);
        isLimitReachedRef.current = false;
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setRecordingTime(prev => {
                const next = prev + 1;
                if (next >= MAX_RECORDING_SECONDS) {
                    stopRecordingDueToLimit();
                    return MAX_RECORDING_SECONDS;
                }
                return next;
            });
        }, 1000);
    };

    const stopTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const handleTakePhoto = async () => {
        if (!cameraRef.current || isCapturing || !isCameraReady) return;
        setIsCapturing(true);

        // Feedback de obturador (Flash branco + vibração háptica suave para evitar tremor manual)
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        Animated.sequence([
            Animated.timing(shutterFlashAnim, { toValue: 0.8, duration: 50, useNativeDriver: true }),
            Animated.timing(shutterFlashAnim, { toValue: 0, duration: 140, useNativeDriver: true }),
        ]).start();

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 0.85,
                skipProcessing: false, // OBRIGATÓRIO ser false no Android para o <Image> nativo conseguir ler e renderizar o arquivo corretamente
                shutterSound: false,
            });
            if (photo && photo.uri) {
                setCapturedPhotoUri(photo.uri);
            }
        } catch (error) {
            console.error("[NexusCamera] Erro ao tirar foto:", error);
        } finally {
            setIsCapturing(false);
        }
    };

    const handleRetake = async () => {
        Haptics.selectionAsync().catch(() => {});
        setCapturedPhotoUri(null);
        setIsCapturing(false);

        // Retoma o stream nativo caso tenha sido suspenso pelo driver do SO
        try {
            await cameraRef.current?.resumePreview?.();
        } catch (err) {
            console.warn('[NexusCamera] Retake resumePreview catch:', err);
            // Fallback de contingência caso o hardware nativo tenha travado
            setIsCameraReady(false);
            setCameraKey(prev => prev + 1);
        }
    };

    const handleRecordVideo = async () => {
        if (!cameraRef.current || !isCameraReady) return;
        
        if (isRecording) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
            setIsRecording(false);
            stopTimer();
            cameraRef.current.stopRecording();
        } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            setIsRecording(true);
            isLimitReachedRef.current = false;
            startTimer();
            try {
                const video = await cameraRef.current.recordAsync({
                    maxDuration: MAX_RECORDING_SECONDS
                });
                
                setIsRecording(false);
                stopTimer();

                const limitHit = isLimitReachedRef.current || recordingTime >= MAX_RECORDING_SECONDS;
                if (limitHit && !isLimitReachedRef.current) {
                    isLimitReachedRef.current = true;
                }

                if (video && video.uri) {
                    onVideoRecorded?.(video.uri, limitHit);
                }
            } catch (error) {
                console.error("[NexusCamera] Erro na gravação:", error);
                setIsRecording(false);
                stopTimer();
            }
        }
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60).toString().padStart(2, '0');
        const s = (seconds % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // Loading State
    if (!camPermission || (mode === 'video' && !micPermission)) {
        return (
            <View style={styles.permissionContainer}>
                <ActivityIndicator size="large" color="#4285F4" />
            </View>
        );
    }

    // Erro de Permissões
    if (!camPermission.granted || (mode === 'video' && !micPermission?.granted)) {
        return (
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionText}>
                    {mode === 'video' 
                        ? 'Precisamos da sua permissão de câmera e microfone para gravar o vídeo.'
                        : 'Precisamos da sua permissão de câmera para tirar a foto.'}
                </Text>
                <TouchableOpacity style={styles.permissionButton} onPress={() => { requestCamPermission(); if (mode === 'video') requestMicPermission(); }}>
                    <Text style={styles.permissionButtonText}>Conceder Permissões</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.permissionButton, { backgroundColor: '#333', marginTop: 10 }]} onPress={onClose}>
                    <Text style={styles.permissionButtonText}>Voltar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ═══════════════════════════════════════════════════════════════════
    // Tela Principal da Câmera & Pré-visualização
    // ═══════════════════════════════════════════════════════════════════
    return (
        <View style={styles.container}>
            {/* Camera Preview */}
            <CameraView 
                key={cameraKey}
                ref={cameraRef}
                style={StyleSheet.absoluteFill} 
                facing={facing} 
                mode={mode === 'video' ? 'video' : 'picture'}
                autofocus={focusMode} // Autofocus contínuo automático
                enableTorch={torch} // Lanterna para ambientes escuros
                zoom={zoom}
                videoStabilizationMode="auto" // Estabilização ótica/digital ativa
                onCameraReady={onCameraReady}
                {...(mode === 'video' ? {
                    videoQuality: qualityMode === 'basic' ? '480p' : '720p',
                    videoBitrate: qualityMode === 'basic' ? 400_000 : 700_000,
                    mute: false,
                } : {})}
            />

            {/* ─── CAMADA INTERATIVA DE GESTOS (Pinch to Zoom e Tap to Focus) ─── */}
            {!capturedPhotoUri && (
                <View 
                    style={StyleSheet.absoluteFill}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    pointerEvents="box-none"
                >
                    {/* Retículo de Foco com animação visual estilo iOS/Pixel */}
                    {focusPoint && (
                        <Animated.View
                            pointerEvents="none"
                            style={[
                                styles.focusRing,
                                {
                                    left: focusPoint.x - 36,
                                    top: focusPoint.y - 36,
                                    opacity: focusOpacity,
                                    transform: [{ scale: focusScale }],
                                }
                            ]}
                        >
                            <View style={styles.focusCornerTL} />
                            <View style={styles.focusCornerTR} />
                            <View style={styles.focusCornerBL} />
                            <View style={styles.focusCornerBR} />
                        </Animated.View>
                    )}
                </View>
            )}

            {/* ─── FLASH BRANCO DO OBTURADOR (Feedback de foto tirada) ─── */}
            <Animated.View 
                pointerEvents="none" 
                style={[
                    StyleSheet.absoluteFill, 
                    { 
                        backgroundColor: '#FFF', 
                        opacity: shutterFlashAnim, 
                        zIndex: 999 
                    }
                ]} 
            />

            {/* ─── CAMADA DE CONTROLES DA CÂMERA (Só aparece se NÃO tiver foto tirada) ─── */}
            {!capturedPhotoUri && (
                <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                    {/* ──── HEADER (topo) ──── */}
                    <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
                        {/* Botão Fechar (X) */}
                        <TouchableOpacity 
                            style={styles.iconButton} 
                            onPress={onClose} 
                            disabled={isRecording || isCapturing} 
                            activeOpacity={0.7}
                        >
                            <X size={24} color="#FFF" />
                        </TouchableOpacity>

                        {/* Badge de modo / Timer */}
                        {mode === 'video' ? (
                            isRecording ? (
                                <View style={[styles.timerBadge, recordingTime >= 70 && styles.timerBadgeWarning]}>
                                    <View style={[styles.recordingDot, recordingTime >= 70 && styles.recordingDotWarning]} />
                                    <Text style={[styles.timerText, recordingTime >= 70 && styles.timerTextWarning]}>
                                        {recordingTime >= MAX_RECORDING_SECONDS ? '01:17 (Limite)' : `${formatTime(recordingTime)} / 01:17`}
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.modeBadge}>
                                    <Video size={16} color="#FFF" style={{ marginRight: 6 }} />
                                    <Text style={styles.modeBadgeText}>VÍDEO (MÁX 77s)</Text>
                                </View>
                            )
                        ) : (
                            <View style={styles.modeBadge}>
                                <Camera size={16} color="#FFF" style={{ marginRight: 6 }} />
                                <Text style={styles.modeBadgeText}>TIRAR FOTO</Text>
                            </View>
                        )}

                        {/* Controles da Direita (Flash/Torch + Inverter) */}
                        <View style={styles.topRightControls}>
                            {/* Botão Lanterna / Flash */}
                            <TouchableOpacity 
                                style={[styles.iconButton, torch && styles.iconButtonActive]} 
                                onPress={toggleTorch} 
                                disabled={isRecording || isCapturing} 
                                activeOpacity={0.7}
                            >
                                {torch 
                                    ? <Zap size={22} color="#f59e0b" fill="#f59e0b" /> 
                                    : <ZapOff size={22} color="#FFF" />
                                }
                            </TouchableOpacity>

                            {/* Botão Inverter Câmera (Superior) */}
                            <TouchableOpacity 
                                style={[styles.iconButton, facing === 'front' && styles.iconButtonActive]} 
                                onPress={toggleCameraFacing} 
                                disabled={isRecording || isCapturing} 
                                activeOpacity={0.7}
                            >
                                <Ionicons name="camera-reverse" size={22} color={facing === 'front' ? '#f59e0b' : '#FFF'} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* ──── ZOOM PRESETS (Subido para não misturar com o botão de gravar/foto) ──── */}
                    <View 
                        style={[
                            styles.zoomPillsContainer, 
                            { bottom: Math.max(insets.bottom, 20) + 120 }
                        ]} 
                        pointerEvents="box-none"
                    >
                        <View style={styles.zoomPillsWrapper}>
                            {[
                                { label: '1x', val: 0 },
                                { label: '2x', val: 0.143 },
                                { label: '3x', val: 0.286 },
                            ].map(preset => {
                                const isCurrentActive = Math.abs(zoom - preset.val) < 0.04;
                                return (
                                    <TouchableOpacity
                                        key={preset.label}
                                        style={[styles.zoomPill, isCurrentActive && styles.zoomPillActive]}
                                        onPress={() => {
                                            Haptics.selectionAsync().catch(() => {});
                                            setZoom(preset.val);
                                        }}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={[styles.zoomPillText, isCurrentActive && styles.zoomPillTextActive]}>
                                            {preset.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Indicador se o usuário fez zoom via pinça diferente dos presets */}
                            {zoom > 0.04 && Math.abs(zoom - 0.143) >= 0.04 && Math.abs(zoom - 0.286) >= 0.04 && (
                                <View style={[styles.zoomPill, styles.zoomPillActive]}>
                                    <Text style={[styles.zoomPillText, styles.zoomPillTextActive]}>
                                        {(1 + zoom * 7).toFixed(1)}x
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* ──── FOOTER (fundo) — Disparador central + Flash na esquerda + Virar Câmera na direita ──── */}
                    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}>
                        {/* Slot Esquerda: Lanterna */}
                        <View style={styles.bottomSideSlot}>
                            <TouchableOpacity 
                                style={[styles.bottomSideButton, torch && styles.bottomSideButtonActive]} 
                                onPress={toggleTorch} 
                                disabled={isRecording || isCapturing} 
                                activeOpacity={0.7}
                            >
                                {torch 
                                    ? <Zap size={22} color="#f59e0b" fill="#f59e0b" /> 
                                    : <ZapOff size={22} color="#FFF" />
                                }
                            </TouchableOpacity>
                        </View>

                        {/* Slot Centro: Disparador Foto ou Gravar Vídeo */}
                        <View style={styles.bottomCenterSlot}>
                            {mode === 'video' ? (
                                <TouchableOpacity 
                                    style={[styles.recordButton, isRecording && styles.recordingButtonActive]} 
                                    onPress={handleRecordVideo}
                                    activeOpacity={0.8}
                                >
                                    {isRecording 
                                        ? <Square size={26} color="#FFF" fill="#FFF" /> 
                                        : <View style={styles.innerRecordCircle} />
                                    }
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity 
                                    style={styles.photoCaptureButton} 
                                    onPress={handleTakePhoto}
                                    disabled={isCapturing || !isCameraReady}
                                    activeOpacity={0.8}
                                >
                                    {isCapturing ? (
                                        <ActivityIndicator size="small" color="#1c2d4f" />
                                    ) : (
                                        <View style={styles.innerPhotoCircle} />
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Slot Direita: Botão Virar para Câmera Frontal / Traseira */}
                        <View style={styles.bottomSideSlot}>
                            <TouchableOpacity 
                                style={[styles.bottomSideButton, facing === 'front' && styles.bottomSideButtonActive]} 
                                onPress={toggleCameraFacing} 
                                disabled={isRecording || isCapturing} 
                                activeOpacity={0.7}
                            >
                                <Ionicons name="camera-reverse" size={26} color={facing === 'front' ? '#f59e0b' : '#FFF'} />
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {/* ─── CAMADA DE PRÉ-VISUALIZAÇÃO (Aparece SOBRE a câmera quando tira a foto) ─── */}
            {capturedPhotoUri && (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: 200, elevation: 20 }]}>
                    <Image 
                        source={{ uri: capturedPhotoUri }} 
                        style={StyleSheet.absoluteFill} 
                        resizeMode="cover" 
                    />
                    
                    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                        <View style={[styles.previewHeader, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
                            <View style={styles.modeBadge}>
                                <Text style={styles.modeBadgeText}>PRÉ-VISUALIZAÇÃO</Text>
                            </View>
                        </View>

                        <View style={[styles.previewFooter, { paddingBottom: Math.max(insets.bottom, 20) + 16 }]}>
                            <TouchableOpacity 
                                style={styles.retakeButton} 
                                onPress={handleRetake}
                                activeOpacity={0.8}
                            >
                                <RotateCcw size={20} color="#FFF" style={{ marginRight: 8 }} />
                                <Text style={styles.previewButtonText}>Tirar Outra</Text>
                            </TouchableOpacity>

                            <TouchableOpacity 
                                style={styles.confirmButton} 
                                onPress={() => {
                                    onPhotoCaptured?.(capturedPhotoUri);
                                    onClose();
                                }}
                                activeOpacity={0.8}
                            >
                                <Check size={20} color="#FFF" style={{ marginRight: 8 }} />
                                <Text style={styles.previewButtonText}>Usar Foto</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },

    // ─── TOP BAR ───
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        zIndex: 100,
    },
    topRightControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    // ─── BOTTOM BAR ───
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 36,
        paddingTop: 16,
        zIndex: 100,
    },
    bottomSideSlot: {
        width: 52,
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomCenterSlot: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomSideButton: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.25)',
    },
    bottomSideButtonActive: {
        backgroundColor: 'rgba(245, 158, 11, 0.25)',
        borderColor: '#f59e0b',
        borderWidth: 1.5,
    },

    // ─── PREVIEW HEADER ───
    previewHeader: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
        zIndex: 100,
    },

    // ─── PREVIEW FOOTER ───
    previewFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        zIndex: 100,
    },

    // ─── BUTTONS ───
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconButtonActive: {
        backgroundColor: 'rgba(245, 158, 11, 0.25)',
        borderWidth: 1.5,
        borderColor: '#f59e0b',
    },
    recordButton: {
        width: 76,
        height: 76,
        borderRadius: 38,
        borderWidth: 4,
        borderColor: '#FFF',
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    recordingButtonActive: {
        borderColor: '#FF3B30',
        backgroundColor: '#FF3B30',
    },
    innerRecordCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#FF3B30',
    },
    photoCaptureButton: {
        width: 78,
        height: 78,
        borderRadius: 39,
        borderWidth: 4,
        borderColor: '#FFF',
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    innerPhotoCircle: {
        width: 62,
        height: 62,
        borderRadius: 31,
        backgroundColor: '#FFF',
    },
    retakeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.9)',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
    },
    confirmButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(16, 185, 129, 0.95)',
        paddingHorizontal: 28,
        paddingVertical: 14,
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
        elevation: 6,
    },
    previewButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },

    // ─── BADGES ───
    modeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    modeBadgeText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 13,
        letterSpacing: 0.5,
    },
    timerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    recordingDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#FF3B30',
        marginRight: 8,
    },
    timerText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },

    timerBadgeWarning: {
        backgroundColor: 'rgba(220, 38, 38, 0.88)',
        borderWidth: 1,
        borderColor: '#fca5a5',
    },
    recordingDotWarning: {
        backgroundColor: '#FFF',
    },
    timerTextWarning: {
        color: '#FFF',
        fontWeight: '900',
    },

    // ─── PERMISSIONS ───
    permissionContainer: {
        flex: 1,
        backgroundColor: '#121212',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    permissionText: {
        color: '#FFF',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 20,
    },
    permissionButton: {
        backgroundColor: '#4285F4',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        width: '100%',
        alignItems: 'center',
    },
    permissionButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    
    // ─── ZOOM NATIVO (PILLS ESTILO IPHONE / GALAXY) ───
    zoomPillsContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 90,
    },
    zoomPillsWrapper: {
        flexDirection: 'row',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        borderRadius: 24,
        paddingHorizontal: 6,
        paddingVertical: 4,
        gap: 6,
        alignItems: 'center',
    },
    zoomPill: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'transparent',
        justifyContent: 'center',
        alignItems: 'center',
    },
    zoomPillActive: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1.5,
        borderColor: '#f59e0b', // Destaque dourado/amarelo nativo
    },
    zoomPillText: {
        color: '#FFF',
        fontSize: 13,
        fontWeight: '700',
    },
    zoomPillTextActive: {
        color: '#f59e0b',
        fontWeight: '800',
    },

    // ─── RETÍCULO DE FOCO (TAP-TO-FOCUS ESTILO CÂMERA PROFISSIONAL) ───
    focusRing: {
        position: 'absolute',
        width: 72,
        height: 72,
        borderWidth: 1.5,
        borderColor: '#f59e0b',
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 95,
    },
    focusCornerTL: {
        position: 'absolute',
        top: -2,
        left: -2,
        width: 10,
        height: 2,
        backgroundColor: '#f59e0b',
    },
    focusCornerTR: {
        position: 'absolute',
        top: -2,
        right: -2,
        width: 10,
        height: 2,
        backgroundColor: '#f59e0b',
    },
    focusCornerBL: {
        position: 'absolute',
        bottom: -2,
        left: -2,
        width: 10,
        height: 2,
        backgroundColor: '#f59e0b',
    },
    focusCornerBR: {
        position: 'absolute',
        bottom: -2,
        right: -2,
        width: 10,
        height: 2,
        backgroundColor: '#f59e0b',
    },
});
