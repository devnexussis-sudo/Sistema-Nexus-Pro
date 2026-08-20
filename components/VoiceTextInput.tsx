import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, TextInput, TextInputProps, Pressable, StyleSheet, Animated, Platform, Alert, Text, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Voice, { SpeechResultsEvent, SpeechErrorEvent } from '@react-native-voice/voice';
import { useI18n } from '@/services/i18n';

interface VoiceTextInputProps extends Omit<TextInputProps, 'onChangeText'> {
  onChangeText: (text: string) => void;
  value: string;
}

export const VoiceTextInput: React.FC<VoiceTextInputProps> = ({ onChangeText, value, style, ...props }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const { t, locale } = useI18n();

  // Pulse animation for recording state
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      pulseAnim.stopAnimation();
    }
  }, [isRecording, pulseAnim]);

  // Clean up Voice on unmount just in case
  useEffect(() => {
    return () => {
      if (isRecording) {
        Voice.stop();
        Voice.destroy().then(Voice.removeAllListeners);
      }
    };
  }, [isRecording]);

  const attachListeners = useCallback(() => {
    Voice.onSpeechStart = () => {
      setIsRecording(true);
      setIsProcessing(false);
    };

    Voice.onSpeechRecognized = () => {
      setIsProcessing(true);
    };

    Voice.onSpeechEnd = () => {
      setIsRecording(false);
      setIsProcessing(false);
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setIsRecording(false);
      setIsProcessing(false);
      // '7' is No match, '6' is speech timeout (normal if they don't speak)
      if (e.error?.code !== '7' && e.error?.code !== '6') {
        console.warn('Voice Error:', e.error);
        Alert.alert('Erro no microfone', `Não foi possível capturar a voz. (${e.error?.message})`);
      }
    };

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      if (e.value && e.value.length > 0) {
        const spokenText = e.value[0]; // Melhor palpite
        const currentText = value || '';
        const prefix = currentText.length > 0 && !currentText.endsWith(' ') ? ' ' : '';
        // Concatena a fala ao texto existente
        onChangeText(currentText + prefix + spokenText);
      }
      setIsRecording(false);
      setIsProcessing(false);
    };
    
    // onSpeechPartialResults can be used for live preview, but for forms, waiting for the final result is safer
  }, [value, onChangeText]);

  const detachListeners = useCallback(() => {
    Voice.removeAllListeners();
  }, []);

  const toggleRecording = async () => {
    if (isRecording) {
      try {
        await Voice.stop();
      } catch (e) {
        console.warn('Error stopping voice', e);
      }
    } else {
      try {
        // Pre-flight check for permissions could go here if needed
        detachListeners(); // Clear any global listeners from other inputs
        attachListeners(); // Bind to THIS specific input
        
        // Define o idioma com base na configuração do app
        let voiceLang = 'pt-BR'; // Padrão
        const currentLocale = typeof locale === 'string' ? locale.toLowerCase() : '';
        if (currentLocale.startsWith('en')) voiceLang = 'en-US';
        else if (currentLocale.startsWith('es')) voiceLang = 'es-ES';
        else if (currentLocale.startsWith('pt')) voiceLang = 'pt-BR';

        await Voice.start(voiceLang);
      } catch (e: any) {
        console.warn('Error starting voice', e);
        Alert.alert('Erro', 'Não foi possível iniciar o microfone. Verifique as permissões.');
      }
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={[
          styles.input, 
          props.multiline && styles.inputMultiline,
          style // Apply external style directly to TextInput to preserve exact original spacing/margins
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#94a3b8"
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
    paddingRight: 50, // Space for the mic button
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
    paddingBottom: 40, // More space at the bottom for multiline mic
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
    backgroundColor: '#f1f5f9', // Light Slate for a clean, neutral look
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
