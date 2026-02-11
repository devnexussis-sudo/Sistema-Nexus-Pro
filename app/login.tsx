
import React, { useState } from 'react';
import { StyleSheet, View, TextInput, Pressable, Text, Image, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { authService } from '@/services/auth-service';
import Checkbox from 'expo-checkbox';

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [keepConnected, setKeepConnected] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) {
            alert('Por favor, preencha todos os campos.');
            return;
        }

        setIsLoading(true);

        const success = await authService.loginWithPassword(email, password);

        setIsLoading(false);

        if (success) {
            router.replace('/(tabs)');
        } else {
            alert('Falha no login. Verifique suas credenciais.');
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <StatusBar style="dark" />
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                <View style={styles.logoContainer}>
                    {/* 
              User should place the logo at assets/images/nexus-logo.png 
              For now using a require, user needs to add the file.
              If file doesn't exist, this might error. 
              I'll use a specific error boundary or conditional require if possible, 
              but require is static.
              I will assume the user adds the file or I'll use a text fallback if image fails 
              (but React Native Image doesn't throw easily on require, the bundler does).
              
              Actually, to avoid bundler error if file is missing, I will use the icon.png temporarily
              and tell the user to replace it, naming it specificially.
            */}
                    <Image
                        source={require('@/assets/images/nexus-logo.png')}
                        style={styles.logo}
                        resizeMode="contain"
                    />
                </View>

                <View style={styles.formContainer}>
                    <ThemedText style={styles.welcomeText}>Bem-vindo de volta!</ThemedText>
                    <ThemedText style={styles.subtitleText}>Faça login para continuar</ThemedText>

                    <View style={styles.inputContainer}>
                        <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Email"
                            placeholderTextColor="#999"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                        />
                    </View>

                    <View style={styles.inputContainer}>
                        <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder="Senha"
                            placeholderTextColor="#999"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry={!showPassword}
                        />
                        <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                            <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color="#666" />
                        </Pressable>
                    </View>

                    <View style={styles.optionsRow}>
                        <View style={styles.checkboxContainer}>
                            <Checkbox
                                style={styles.checkbox}
                                value={keepConnected}
                                onValueChange={setKeepConnected}
                                color={keepConnected ? '#1c2d4f' : undefined}
                            />
                            <Pressable onPress={() => setKeepConnected(!keepConnected)}>
                                <Text style={styles.checkboxLabel}>Manter conectado</Text>
                            </Pressable>
                        </View>

                        <Pressable style={styles.forgotButton}>
                            <Text style={styles.forgotText}>Esqueceu a senha?</Text>
                        </Pressable>
                    </View>

                    <Pressable
                        style={({ pressed }) => [
                            styles.loginButton,
                            pressed && styles.loginButtonPressed
                        ]}
                        onPress={handleLogin}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={styles.loginButtonText}>Entrar</Text>
                        )}
                    </Pressable>

                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>Versão 1.0.0</Text>
                </View>

            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 24,
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 0,
        marginTop: 150,
    },
    logo: {
        width: 220,
        height: 220,
        marginBottom: 0,
    },
    appName: {
        fontSize: 28,
        color: '#1c2d4f',
        fontWeight: 'bold',
        textAlign: 'center',
    },
    formContainer: {
        width: '100%',
        alignItems: 'center',
        marginTop: -30,
    },
    welcomeText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 0,
        textAlign: 'center',
    },
    subtitleText: {
        fontSize: 16,
        color: '#666',
        marginBottom: 10,
        textAlign: 'center',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f5f7fa',
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        height: 56,
        paddingHorizontal: 16,
        width: '100%',
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        height: '100%',
        color: '#333',
        fontSize: 16,
    },
    eyeIcon: {
        padding: 4,
    },
    optionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        marginBottom: 24,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        marginRight: 8,
        borderRadius: 4,
    },
    checkboxLabel: {
        color: '#666',
        fontSize: 14,
    },
    forgotButton: {
        // alignSelf removed since it's in a flex-row now
    },
    forgotText: {
        color: '#1c2d4f',
        fontSize: 14,
        fontWeight: '600',
    },
    loginButton: {
        backgroundColor: '#1c2d4f',
        height: 56,
        width: '100%',
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#1c2d4f',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    loginButtonPressed: {
        opacity: 0.9,
        transform: [{ scale: 0.98 }],
    },
    loginButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    footer: {
        marginTop: 40,
        alignItems: 'center',
    },
    footerText: {
        color: '#ccc',
        fontSize: 12,
    },
});
