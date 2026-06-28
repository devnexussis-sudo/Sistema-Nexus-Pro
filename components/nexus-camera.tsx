import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import type { CameraType } from 'expo-camera';
import { X, FlipHorizontal, Video, Square } from 'lucide-react-native';

interface NexusCameraProps {
    onClose: () => void;
    onVideoRecorded: (uri: string) => void;
}

export default function NexusCamera({ onClose, onVideoRecorded }: NexusCameraProps) {
    const [camPermission, requestCamPermission] = useCameraPermissions();
    const [micPermission, requestMicPermission] = useMicrophonePermissions();
    
    const [facing, setFacing] = useState<CameraType>('back');
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const cameraRef = useRef<CameraView>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Gestão de permissões
    useEffect(() => {
        if (!camPermission?.granted) requestCamPermission();
        if (!micPermission?.granted) requestMicPermission();
    }, [camPermission, micPermission]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const toggleCameraFacing = () => {
        setFacing(current => (current === 'back' ? 'front' : 'back'));
    };

    const startTimer = () => {
        setRecordingTime(0);
        timerRef.current = setInterval(() => {
            setRecordingTime(prev => prev + 1);
        }, 1000);
    };

    const stopTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };

    const handleRecordVideo = async () => {
        if (!cameraRef.current) return;
        
        if (isRecording) {
            // Para a gravação
            setIsRecording(false);
            stopTimer();
            cameraRef.current.stopRecording();
        } else {
            // Inicia a gravação
            setIsRecording(true);
            startTimer();
            try {
                const video = await cameraRef.current.recordAsync({
                    maxDuration: 180 // Limite de 3 minutos para segurança
                });
                
                if (video && video.uri) {
                    onVideoRecorded(video.uri);
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
    if (!camPermission || !micPermission) {
        return (
            <View style={styles.permissionContainer}>
                <ActivityIndicator size="large" color="#4285F4" />
            </View>
        );
    }

    // Erro de Permissões
    if (!camPermission.granted || !micPermission.granted) {
        return (
            <View style={styles.permissionContainer}>
                <Text style={styles.permissionText}>Precisamos da sua permissão de câmera e microfone para gravar o vídeo.</Text>
                <TouchableOpacity style={styles.permissionButton} onPress={() => { requestCamPermission(); requestMicPermission(); }}>
                    <Text style={styles.permissionButtonText}>Conceder Permissões</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.permissionButton, { backgroundColor: '#333', marginTop: 10 }]} onPress={onClose}>
                    <Text style={styles.permissionButtonText}>Voltar</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <CameraView 
                ref={cameraRef}
                style={styles.camera} 
                facing={facing} 
                mode="video"
                videoQuality="480p" // Mágica do WhatsApp (Qualidade enxuta instantânea)
                mute={false}
            >
                {/* Header Actions */}
                <View style={styles.header}>
                    <TouchableOpacity style={styles.iconButton} onPress={onClose} disabled={isRecording}>
                        <X size={28} color="#FFF" />
                    </TouchableOpacity>
                    {isRecording && (
                        <View style={styles.timerBadge}>
                            <View style={styles.recordingDot} />
                            <Text style={styles.timerText}>{formatTime(recordingTime)}</Text>
                        </View>
                    )}
                    <TouchableOpacity style={styles.iconButton} onPress={toggleCameraFacing} disabled={isRecording}>
                        <FlipHorizontal size={28} color="#FFF" />
                    </TouchableOpacity>
                </View>

                {/* Bottom Actions */}
                <View style={styles.footer}>
                    <TouchableOpacity 
                        style={[styles.recordButton, isRecording && styles.recordingButtonActive]} 
                        onPress={handleRecordVideo}
                    >
                        {isRecording ? <Square size={24} color="#FFF" fill="#FFF" /> : <View style={styles.innerRecordCircle} />}
                    </TouchableOpacity>
                </View>
            </CameraView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    camera: {
        flex: 1,
        justifyContent: 'space-between',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 40,
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
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
    timerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    recordingDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#FF3B30',
        marginRight: 8,
    },
    timerText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
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
    }
});
