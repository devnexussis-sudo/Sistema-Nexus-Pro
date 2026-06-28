import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Keyboard, Modal } from 'react-native';

interface GlobalLoadingContextData {
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  isLoading: boolean;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextData>({} as GlobalLoadingContextData);

export const GlobalLoadingProvider = ({ children }: { children: ReactNode }) => {
  const [loadingCount, setLoadingCount] = useState(0);
  const [message, setMessage] = useState<string | undefined>(undefined);

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

  return (
    <GlobalLoadingContext.Provider value={{ showLoading, hideLoading, isLoading }}>
      {children}
      <Modal transparent={true} visible={isLoading} animationType="fade" statusBarTranslucent={true}>
        <View style={styles.overlay}>
          <View style={styles.box}>
            <ActivityIndicator size="large" color="#4A90D9" />
            <Text style={styles.text}>{message || 'Carregando informações...'}</Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    backgroundColor: '#1c2d4f',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    minWidth: 200,
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
