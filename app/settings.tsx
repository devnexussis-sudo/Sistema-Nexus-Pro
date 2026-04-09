
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LOCATION_TASK_NAME, startBackgroundLocation, stopBackgroundLocation } from '@/services/location-service';
import { logger } from '@/services/logger';
import { syncService } from '@/services/sync-service';
import { useI18n, Lang } from '@/services/i18n';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

const LANG_LABELS: Record<Lang, string> = { pt: 'Português', en: 'English', es: 'Español' };

export default function SettingsScreen() {
    const [isGpsEnabled, setIsGpsEnabled] = useState(false);
    const [isLangOpen, setIsLangOpen] = useState(false);
    const { t, lang, setLang } = useI18n();

    useEffect(() => {
        checkGpsStatus();
    }, []);

    const checkGpsStatus = async () => {
        try {
            const isStart = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
            setIsGpsEnabled(isStart);
        } catch (e) {
            console.error(e);
            logger.log(`Erro ao verificar status do GPS: ${e}`, 'error');
        }
    };

    const toggleGps = async () => {
        try {
            if (isGpsEnabled) {
                await stopBackgroundLocation();
                setIsGpsEnabled(false);
            } else {
                const success = await startBackgroundLocation();
                if (success) {
                    setIsGpsEnabled(true);
                } else {
                    // Revert UI if permission was denied or error
                    setIsGpsEnabled(false);
                }
            }
        } catch (error) {
            setIsGpsEnabled(false);
        }
    };


    return (
        <ThemedView style={styles.container}>

            {/* Settings Section */}
            <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionHeader}>{t('settingsGeneral')}</ThemedText>

                <View style={[styles.settingRow, { marginBottom: 20 }]}>
                    <View style={[styles.settingInfo, { overflow: 'visible' }]}>
                        <Text style={styles.settingLabel}>{t('settingsLanguage')}</Text>
                        
                        <Pressable 
                            style={styles.langDropdownBtn}
                            onPress={() => setIsLangOpen(!isLangOpen)}
                        >
                            <Text style={styles.langDropdownBtnText}>{LANG_LABELS[lang]}</Text>
                            <Ionicons name={isLangOpen ? "chevron-up" : "chevron-down"} size={20} color="#64748b" />
                        </Pressable>

                        {isLangOpen && (
                            <View style={styles.langContainer}>
                                {(['pt', 'en', 'es'] as Lang[]).map((l) => (
                                    <Pressable 
                                        key={l} 
                                        style={[styles.langOptionContainer, lang === l && styles.langOptionContainerActive]}
                                        onPress={() => {
                                            setLang(l);
                                            setIsLangOpen(false);
                                        }}
                                    >
                                        <Text style={[styles.langOptionText, lang === l && styles.langOptionTextActive]}>
                                            {LANG_LABELS[l]}
                                        </Text>
                                        {lang === l && <Ionicons name="checkmark" size={18} color="#1c2d4f" />}
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    </View>
                </View>

                <View style={styles.settingRow}>
                    <View style={styles.settingInfo}>
                        <Text style={styles.settingLabel}>{t('settingsGps')}</Text>
                        <Text style={styles.settingDescription}>
                            {t('settingsGpsDesc')}
                        </Text>
                    </View>
                    <Switch
                        trackColor={{ false: '#767577', true: '#1c2d4f' }}
                        thumbColor={isGpsEnabled ? '#fff' : '#f4f3f4'}
                        onValueChange={toggleGps}
                        value={isGpsEnabled}
                    />
                </View>

            </View>

            <View style={styles.section}>
                <ThemedText type="subtitle" style={styles.sectionHeader}>{t('settingsDiag')}</ThemedText>

                <Pressable style={styles.logButton} onPress={() => logger.shareLogs()}>
                    <Ionicons name="bug-outline" size={20} color="#fff" />
                    <Text style={styles.logButtonText}>{t('settingsLogBtn')}</Text>
                </Pressable>
                <Text style={styles.logDescription}>
                    {t('settingsLogDesc')}
                </Text>
            </View>

        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#f5f7fa',
    },
    section: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    sectionHeader: {
        marginBottom: 16,
        color: '#1c2d4f',
    },
    settingRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    settingInfo: {
        flex: 1,
        paddingRight: 10,
    },
    settingLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    settingDescription: {
        fontSize: 12,
        color: '#666',
        marginTop: 4,
    },
    logButton: {
        backgroundColor: '#1c2d4f',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 14,
        borderRadius: 10,
        marginTop: 5,
        gap: 8
    },
    logButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold'
    },
    logDescription: {
        color: '#64748b',
        fontSize: 12,
        marginTop: 8,
        textAlign: 'center'
    },
    langDropdownBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#f8fafc',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginTop: 10,
    },
    langDropdownBtnText: {
        fontSize: 15,
        color: '#1c2d4f',
        fontWeight: '600',
    },
    langContainer: {
        marginTop: 8,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        overflow: 'hidden',
    },
    langOptionContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    langOptionContainerActive: {
        backgroundColor: '#f8fafc',
    },
    langOptionText: {
        fontSize: 15,
        color: '#64748b',
        fontWeight: '500',
    },
    langOptionTextActive: {
        color: '#1c2d4f',
        fontWeight: '700',
    }
});
