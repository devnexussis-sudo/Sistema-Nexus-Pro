/**
 * VideoViewerModal — Visualizador de Vídeo Customizado e Resiliente (v1)
 *
 * Exibe vídeos (locais ou armazenados no Supabase) em um modal nativo 
 * usando o player expo-av com controles nativos de reprodução.
 * Trata erros de formato/conexão sem travar ou fechar o app.
 */

import React, { useEffect, useState } from 'react';
import { 
    Modal, 
    View, 
    StyleSheet, 
    Pressable, 
    Text, 
    ActivityIndicator, 
    Dimensions,
    Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { getSignedUrl } from '@/components/secure-image';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface VideoViewerModalProps {
    visible: boolean;
    videoUri?: string | null;
    onClose: () => void;
}

export function VideoViewerModal({ visible, videoUri, onClose }: VideoViewerModalProps) {
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        let active = true;
        if (!visible || !videoUri) {
            setResolvedUri(null);
            setIsLoading(true);
            setHasError(false);
            return;
        }

        setIsLoading(true);
        setHasError(false);

        let target = videoUri.trim();
        if (target.startsWith('file://') || target.startsWith('data:') || target.startsWith('/')) {
            const finalUri = target.startsWith('/') ? `file://${target}` : target;
            if (active) {
                setResolvedUri(finalUri);
                setIsLoading(false);
            }
        } else {
            getSignedUrl(target)
                .then(signed => {
                    if (active) {
                        setResolvedUri(signed);
                        setIsLoading(false);
                    }
                })
                .catch(() => {
                    if (active) {
                        setResolvedUri(target);
                        setIsLoading(false);
                    }
                });
        }

        return () => { active = false; };
    }, [visible, videoUri]);

    if (!visible || !videoUri) return null;

    return (
        <Modal 
            visible={visible} 
            transparent={true} 
            onRequestClose={onClose} 
            animationType="fade" 
            statusBarTranslucent
        >
            <View style={styles.container}>
                {/* Botão de Fechar */}
                <Pressable style={styles.closeButton} onPress={onClose} hitSlop={20}>
                    <View style={styles.closeButtonBg}>
                        <Ionicons name="close" size={26} color="#ffffff" />
                    </View>
                </Pressable>

                {/* Carregando URL */}
                {isLoading && (
                    <View style={styles.centerContent}>
                        <ActivityIndicator size="large" color="#10b981" />
                        <Text style={styles.statusText}>Preparando vídeo...</Text>
                    </View>
                )}

                {/* Erro de Reprodução */}
                {hasError && !isLoading && (
                    <View style={styles.centerContent}>
                        <Ionicons name="alert-circle-outline" size={54} color="#ef4444" />
                        <Text style={styles.errorText}>Não foi possível reproduzir este vídeo.</Text>
                        <Pressable style={styles.retryButton} onPress={onClose}>
                            <Text style={styles.retryButtonText}>Fechar</Text>
                        </Pressable>
                    </View>
                )}

                {/* Player Nativo Expo-AV */}
                {!isLoading && resolvedUri && !hasError && (
                    <Video
                        source={{ uri: resolvedUri }}
                        style={styles.fullscreenVideo}
                        useNativeControls
                        resizeMode={ResizeMode.CONTAIN}
                        shouldPlay
                        onError={(err) => {
                            console.error('[VideoViewerModal] Erro de reprodução:', err);
                            setHasError(true);
                        }}
                    />
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000',
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerContent: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    statusText: {
        color: '#94a3b8',
        fontSize: 14,
        fontWeight: '600',
        marginTop: 8,
    },
    errorText: {
        color: '#f87171',
        fontSize: 15,
        fontWeight: '700',
        marginTop: 8,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    retryButton: {
        marginTop: 16,
        backgroundColor: '#334155',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    retryButtonText: {
        color: '#ffffff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    fullscreenVideo: {
        width: SCREEN_W,
        height: SCREEN_H * 0.85,
    },
    closeButton: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 999,
    },
    closeButtonBg: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(30, 41, 59, 0.85)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(148, 163, 184, 0.3)',
    },
});
