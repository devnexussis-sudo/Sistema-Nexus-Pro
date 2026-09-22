import React, { useState, useEffect, useRef } from 'react';
import {
  View, TextInput, TextInputProps, Pressable, StyleSheet, Animated,
  Platform, Alert, Text, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/services/i18n';

// Importação condicional para não quebrar o Expo Go (que não possui módulos nativos customizados compilados)
let ExpoSpeechRecognitionModule: any = null;
let useSpeechRecognitionEvent: any = (event: string, callback: any) => {};

try {
  const Speech = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = Speech.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = Speech.useSpeechRecognitionEvent || useSpeechRecognitionEvent;
} catch (e) {
  console.warn("ExpoSpeechRecognition native module not found. Voice typing disabled in this environment.");
}

interface VoiceTextInputProps extends Omit<TextInputProps, 'onChangeText'> {
  onChangeText: (text: string) => void;
  value: string;
}

export const VoiceTextInput: React.FC<VoiceTextInputProps> = ({ onChangeText, value, style, ...props }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { locale } = useI18n();

  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeTextRef = useRef(onChangeText);
  onChangeTextRef.current = onChangeText;

  // ── Animação de pulso durante gravação ──
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      pulseAnim.stopAnimation();
    }
  }, [isRecording, pulseAnim]);

  // ── Eventos do expo-speech-recognition ──
  useSpeechRecognitionEvent('start', () => {
    setIsRecording(true);
    setIsProcessing(false);
  });

  useSpeechRecognitionEvent('end', () => {
    setIsRecording(false);
    setIsProcessing(false);
  });

  useSpeechRecognitionEvent('error', (event) => {
    setIsRecording(false);
    setIsProcessing(false);
    
    const errMsg = event.error || '';
    const isIgnored = errMsg.includes('no-speech') || errMsg.includes('aborted') || errMsg.includes('network');
    
    if (!isIgnored) {
       console.warn('Voice Error:', event);
       Alert.alert('Aviso', `Não foi possível entender o áudio. Por favor, tente novamente.\n(Detalhe: ${errMsg})`);
    }
  });

  useSpeechRecognitionEvent('result', (event) => {
    if (event.results && event.results.length > 0) {
      // Pega o resultado mais confiável do primeiro item (transcrição final)
      const transcript = event.results[0]?.transcript || '';
      
      if (transcript && event.isFinal) {
        const currentText = valueRef.current || '';
        const prefix = currentText.length > 0 && !currentText.endsWith(' ') ? ' ' : '';
        onChangeTextRef.current(currentText + prefix + transcript);
      }
    }
  });

  // ── Toggle gravação ──
  const toggleRecording = async () => {
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('Funcionalidade Indisponível', 'A digitação por voz requer que o aplicativo seja compilado (não funciona no Expo Go).');
      return;
    }

    if (isRecording) {
      ExpoSpeechRecognitionModule.stop();
      setIsRecording(false);
      setIsProcessing(false);
      return;
    }

    try {
      // 1. Solicita permissão
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert('Permissão Negada', 'A permissão de acesso ao microfone é necessária para usar a transcrição de voz.');
        return;
      }

      // 2. Define idioma
      let voiceLang = 'pt-BR';
      const currentLocale = typeof locale === 'string' ? locale.toLowerCase() : '';
      if (currentLocale.startsWith('en')) voiceLang = 'en-US';
      else if (currentLocale.startsWith('es')) voiceLang = 'es-ES';

      // 3. Inicia reconhecimento de voz
      ExpoSpeechRecognitionModule.start({ lang: voiceLang });
    } catch (e: any) {
      console.warn('Voice start error:', e);
      setIsRecording(false);
      setIsProcessing(false);
      Alert.alert(
        'Erro ao Iniciar Voz',
        `Não foi possível iniciar o reconhecimento de voz.\n\n(${e.message || 'Erro interno'})`
      );
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={[
          styles.input,
          props.multiline && styles.inputMultiline,
          style
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#94a3b8"
        returnKeyType={props.multiline ? "default" : "done"}
        {...props}
      />

      <View style={styles.micContainer}>
        {isRecording ? (
          <Pressable onPress={toggleRecording} style={styles.micButtonActive}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <Ionicons name="stop-circle" size={24} color="#ef4444" />
            </Animated.View>
            <Text style={styles.recordingText}>Ouvindo...</Text>
          </Pressable>
        ) : (
          <Pressable onPress={toggleRecording} style={styles.micButton}>
            {isProcessing ? (
               <ActivityIndicator size="small" color="#64748b" />
            ) : (
               <Ionicons name="mic" size={22} color="#64748b" />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    width: '100%',
  },
  input: {
    width: '100%',
    padding: 14,
    paddingRight: 50,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    color: '#0f172a',
    fontSize: 15,
  },
  inputMultiline: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingBottom: 40,
  },
  micContainer: {
    position: 'absolute',
    right: 8,
    bottom: 8,
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  micButtonActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 4,
  },
  recordingText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
  }
});
