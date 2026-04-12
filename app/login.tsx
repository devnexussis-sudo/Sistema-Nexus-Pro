
import { ThemedText } from '@/components/themed-text';
import { authService } from '@/services/auth-service';
import { appLifecycle } from '@/services/app-lifecycle';
import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '@/services/i18n';

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [keepConnected, setKeepConnected] = useState(false);
    const { t } = useI18n();

    const handleLogin = async () => {
        if (!email || !password) {
            alert(t('loginFailFill'));
            return;
        }

        setIsLoading(true);

        const success = await authService.loginWithPassword(email, password);

        setIsLoading(false);

        if (success) {
            // Trigger the AppLifecycle to initialize GPS, Notifications, and Queues right after logging in on a fresh install
            await appLifecycle.initialize();
            router.replace('/');
        } else {
            alert(t('loginFailCredentials'));
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            alert(t('loginForgotFillEmail'));
            return;
        }

        setIsLoading(true);
        const success = await authService.resetPassword(email);
        setIsLoading(false);

        if (success) {
            alert(t('loginForgotSuccess'));
        } else {
            alert(t('loginForgotError'));
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <StatusBar style="dark" />
            <ScrollView 
                contentContainerStyle={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
            >

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
                    <ThemedText style={styles.welcomeText}>{t('loginWelcome')}</ThemedText>
                    <ThemedText style={styles.subtitleText}>{t('loginSubtitle')}</ThemedText>

                    <View style={styles.inputContainer}>
                        <Ionicons name="mail-outline" size={20} color="#666" style={styles.inputIcon} />
                        <TextInput
                            style={styles.input}
                            placeholder={t('loginEmailPlaceholder')}
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
                            placeholder={t('loginPasswordPlaceholder')}
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
                                <Text style={styles.checkboxLabel}>{t('loginKeepConnected')}</Text>
                            </Pressable>
                        </View>

                        <Pressable style={styles.forgotButton} onPress={handleForgotPassword}>
                            <Text style={styles.forgotText}>{t('loginForgotPassword')}</Text>
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
                            <Text style={styles.loginButtonText}>{t('loginButton')}</Text>
                        )}
                    </Pressable>

                </View>

                <View style={styles.footer}>
                    <Text style={styles.footerText}>{t('menuVersion')} {Constants.expoConfig?.version || '03.01.26'}</Text>
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
        paddingTop: Platform.OS === 'ios' ? 100 : 80,
        paddingBottom: 250, // Massive native clearance allowing the Android/iOS flex engine to natively scroll the focused input above the keyboard
    },
    logoContainer: {
        alignItems: 'center',
        marginBottom: 10,
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
