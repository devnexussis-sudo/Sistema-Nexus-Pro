
import { ThemedText } from '@/components/themed-text';
import { NexusAlert } from '@/components/nexus-alert';
import { authService } from '@/services/auth-service';
import { appLifecycle } from '@/services/app-lifecycle';
import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Dimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useI18n } from '@/services/i18n';

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [keepConnected, setKeepConnected] = useState(false);
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', icon: 'warning-outline' as any, iconColor: '#ff3b30' });
    const { t } = useI18n();

    const showAlert = (title: string, message: string, icon = 'warning-outline' as any, iconColor = '#ff3b30') => {
        setAlertConfig({ visible: true, title, message, icon, iconColor });
    };

    const handleLogin = async () => {
        if (!email || !password) {
            showAlert('Alerta!', t('loginFailFill'));
            return;
        }

        setIsLoading(true);

        const result = await authService.loginWithPassword(email, password, keepConnected);

        setIsLoading(false);

        if (result.success) {
            // Trigger the AppLifecycle to initialize GPS, Notifications, and Queues right after logging in on a fresh install
            await appLifecycle.initialize();
            router.replace('/');
        } else {
            if (result.errorType === 'BLOCKED') {
                showAlert('Alerta!', "Usuário bloqueado pelo admin da empresa.");
            } else {
                showAlert('Alerta!', t('loginFailCredentials'));
            }
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            showAlert('Alerta!', t('loginForgotFillEmail'), 'mail-outline', '#1c2d4f');
            return;
        }

        setIsLoading(true);
        const success = await authService.resetPassword(email);
        setIsLoading(false);

        if (success) {
            showAlert('Sucesso', t('loginForgotSuccess'), 'checkmark-circle-outline', '#34c759');
        } else {
            showAlert('Alerta!', t('loginForgotError'));
        }
    };

const { width: windowWidth, height: windowHeight } = Dimensions.get('window');

const TopBlueBand = () => {
    const { width: windowWidth, height: windowHeight } = Dimensions.get('window');
    return (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            {/* The solid blue top half */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: windowHeight * 0.5, backgroundColor: '#1c2d4f' }} />
            
            {/* The charming wave attached slightly above the bottom edge to avoid 1px gaps */}
            <Svg 
                height="80" 
                width={windowWidth} 
                viewBox={`0 0 ${windowWidth} 80`} 
                style={{ position: 'absolute', top: (windowHeight * 0.5) - 1, left: 0 }}
                preserveAspectRatio="none"
            >
                <Path 
                    fill="#1c2d4f" 
                    d={`M0 0 C ${windowWidth * 0.4} 80, ${windowWidth * 0.6} -10, ${windowWidth} 50 L ${windowWidth} 0 Z`}
                />
            </Svg>
        </View>
    );
};

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <StatusBar style="light" />
            <TopBlueBand />
            <NexusAlert 
                visible={alertConfig.visible}
                title={alertConfig.title}
                message={alertConfig.message}
                icon={alertConfig.icon}
                iconColor={alertConfig.iconColor}
                onDismiss={() => setAlertConfig(prev => ({ ...prev, visible: false }))}
            />
            <ScrollView 
                contentContainerStyle={styles.scrollContent} 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                bounces={false}
            >

                {/* Explicit responsive zone to hold the logo safely above the sine wave peak */}
                <View style={{ height: windowHeight * 0.40 - 80, justifyContent: 'flex-end', alignItems: 'center', zIndex: 10 }}>
                    <View style={styles.logoContainer}>
                        <Image
                            source={require('@/assets/images/nexus-logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                    </View>
                </View>

                {/* The wave occupies a visual space of 80px here, so we push the form explicitly below the wave */}
                <View style={{ height: 90 }} />

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

            </ScrollView>

            {/* Footer moved outside ScrollView so it doesn't bias the vertical centering equation */}
            <View style={styles.footer}>
                <Text style={styles.footerText}>{t('menuVersion')} {Constants.expoConfig?.version || '03.01.26'}</Text>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f7fa', // Off-white for better contrast with the white form
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: 16, // Reduced to allow the form to stretch wider
        paddingTop: Platform.OS === 'ios' ? 40 : 20,
        paddingBottom: Platform.OS === 'ios' ? 40 : 40, 
    },
    logoContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
        backgroundColor: '#ffffff',
        paddingVertical: 15,
        paddingHorizontal: 30,
        borderRadius: 36, // Elegant pill shape
        marginBottom: 0,  // Controlled dynamically by parent view now
        marginTop: 0,     // Controlled dynamically by parent view now
        // The magic that makes it "saltar" (pop/levitate) out of the white background
        shadowColor: '#1c2d4f',
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.12, // Rich but subtle glow
        shadowRadius: 32,
        elevation: 16, // Casts the shadow on Android
    },
    logo: {
        width: 220,
        height: 100, // Reduced from 220 to strictly crop empty vertical space and fit the horizontal logo perfectly
        resizeMode: 'contain',
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
        backgroundColor: '#ffffff',
        paddingVertical: 30, // Tall and elegant
        paddingHorizontal: 16, // Greatly reduced to widen the inner input fields
        borderRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 8,
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
        backgroundColor: '#ffffff', // Ensures input contrasts over the off-white background
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e8eaed',
        height: 56,
        paddingHorizontal: 16,
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.02,
        shadowRadius: 4,
        elevation: 1,
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
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 6,
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
        alignItems: 'center',
        paddingBottom: Platform.OS === 'ios' ? 20 : 16,
        paddingTop: 10,
        backgroundColor: '#1c2d4f', // Matches bottom area natively
    },
    footerText: {
        color: '#8E9CAF', // Ensures visibility over dark blue while staying subdued
        fontSize: 12,
    },
});
