import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Keyboard, Modal, Pressable } from 'react-native';

interface GlobalLoadingContextData {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  isLoading: boolean;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextData>({} as GlobalLoadingContextData);

export const GlobalLoadingProvider = ({ children }: { children: ReactNode }) => {
  const [loadingCount, setLoadingCount] = useState(0);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [longWaitLevel, setLongWaitLevel] = useState(0);

  const showLoading = useCallback((msg?: string) => {
    Keyboard.dismiss();
    setMessage(msg);
    setLoadingCount((prev) => prev + 1);
  }, []);

  const hideLoading = useCallback(() => {
    setLoadingCount((prev) => {
      const next = prev > 0 ? prev - 1 : 0;
      if (next === 0) {
        setMessage(undefined);
      }
      return next;
    });
  }, []);

  const isLoading = loadingCount > 0;

  useEffect(() => {
    let t1: NodeJS.Timeout;
    let t2: NodeJS.Timeout;

    if (isLoading) {
      t1 = setTimeout(() => {
        setLongWaitLevel(1);
      }, 10000); // 10 segundos
      t2 = setTimeout(() => {
        setLongWaitLevel(2);
      }, 20000); // 20 segundos
    } else {
      setLongWaitLevel(0);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isLoading]);

  return (
    <GlobalLoadingContext.Provider value={{ showLoading, hideLoading, isLoading }}>
      {children}
      <Modal transparent={true} visible={isLoading} animationType="fade" statusBarTranslucent={true}>
        {/* Usamos pointerEvents='auto' e backgroundColor='transparent' para bloquear a tela sem embaçar nada */}
        <View style={styles.overlay}>
          <View style={[styles.box, longWaitLevel > 0 ? { borderRadius: 20 } : {}]}>
            <ActivityIndicator size="large" color="#ffffff" />
            
            {message ? <Text style={styles.text}>{message}</Text> : null}
            
            {longWaitLevel > 0 && (
              <Text style={styles.warningText}>
                Isso está demorando mais que o esperado...{longWaitLevel === 1 ? ' Aguarde um momento.' : ''}
              </Text>
            )}

            {longWaitLevel === 2 && (
              <Pressable 
                style={styles.closeBtn} 
                onPress={() => {
                  setLoadingCount(0);
                  setMessage(undefined);
                }}
              >
                <Text style={styles.closeBtnText}>Fechar (Tentar Novamente)</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </GlobalLoadingContext.Provider>
  );
};

export const useGlobalLoading = () => useContext(GlobalLoadingContext);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    backgroundColor: 'rgba(28, 45, 79, 0.9)',
    borderRadius: 100, // Formato pílula/redondo
    paddingHorizontal: 32,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
    minWidth: 120,
  },
  text: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  warningText: {
    color: '#fcd34d',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 200,
  },
  closeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
