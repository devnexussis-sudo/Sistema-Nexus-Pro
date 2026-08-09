import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  useColorScheme,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/services/supabase';
import { searchKnowledgeBase, getAvailableManuals, ManualSummary } from '@/services/duno-ai/dunoQueryService';

// ── Types ──
interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isTyping?: boolean;
}

// ── Detecção de saudações e identificação restrita ──
const detectPersonal = (text: string, fullName: string, firstName: string): string | null => {
  const l = text.toLowerCase().trim();
  
  if (/(meu\s+nome|como\s+me\s+chamo|qual\s+(e|é)\s+meu\s+nome|quem\s+sou\s+eu)/i.test(l)) {
    return `Olá, **${firstName}**! Seu nome completo registrado é **${fullName}**. Estou aqui para ajudar você com dúvidas técnicas. 😊`;
  }
  
  if (/^(obrigad|valeu|thanks|agradeç|tmj|brigad)/i.test(l)) {
    const replies = [
      `De nada, ${firstName}! Fico feliz em ajudar. Se tiver dúvidas técnicas sobre equipamentos, é só mandar! 🛠️`,
      `Sempre às ordens, ${firstName}! Estou aqui para decifrar manuais para você. 👍`,
      `Disponha! Qualquer dúvida técnica sobre os PDFs e manuais de equipamentos, conte comigo. 🚀`,
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  
  if (/^(oi|olá|ola|hey|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[ií]|tudo\s+bem|hello|hi)\b/i.test(l)) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return `${greeting}, ${firstName}! 👋 Como posso ajudar você hoje?\n\nSou sua assistente técnica. Pode me fazer perguntas sobre manuais, códigos de erro e procedimentos dos equipamentos aprendidos!`;
  }
  
  if (/(quem\s+(e|é)\s+voc[eê]|seu\s+nome|o\s+que\s+voc[eê]\s+faz|sobre\s+voc[eê])/i.test(l)) {
    return `Eu sou a **Duno IA**, sua assistente técnica inteligente! 🤖\n\nMinha função no aplicativo é analisar e responder suas dúvidas sobre **manuais técnicos e PDFs de aprendizado** de equipamentos que foram importados no sistema.\n\n_Observação: Não possuo acesso a dados operacionais do sistema, como ordens de serviço ou faturamento. Meu foco é 100% no suporte técnico!_`;
  }
  
  return null;
};

// ── Renderizador Markdown Simplificado com Contraste Dinâmico ──
const renderMarkdown = (text: string, isUser: boolean, isDark: boolean) => {
  // Cores dinâmicas baseadas em quem envia a mensagem e no tema
  const textColor = isUser 
    ? '#ffffff' 
    : (isDark ? '#e2e8f0' : '#334155');
    
  const boldColor = isUser 
    ? '#ffffff' 
    : (isDark ? '#ffffff' : '#0f172a');

  return text.split('\n').map((line, i) => {
    const parts: React.ReactNode[] = [];
    let remaining = line;
    let keyIdx = 0;
    const boldRegex = /\*\*(.+?)\*\*/g;
    let match;
    let lastIndex = 0;

    while ((match = boldRegex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <Text key={`${i}-${keyIdx++}`} style={[markdownStyles.text, { color: textColor }]}>
            {remaining.slice(lastIndex, match.index)}
          </Text>
        );
      }
      parts.push(
        <Text key={`${i}-${keyIdx++}`} style={[markdownStyles.bold, { color: boldColor }]}>
          {match[1]}
        </Text>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < remaining.length) {
      parts.push(
        <Text key={`${i}-${keyIdx++}`} style={[markdownStyles.text, { color: textColor }]}>
          {remaining.slice(lastIndex)}
        </Text>
      );
    }

    if (!line.trim()) return <View key={i} style={{ height: 6 }} />;

    const isBullet = line.trim().startsWith('•') || line.trim().startsWith('—') || line.trim().startsWith('>');
    const isNumbered = /^\s*\d+\./.test(line);

    return (
      <Text
        key={i}
        style={[
          markdownStyles.line,
          isBullet && { paddingLeft: 12 },
          isNumbered && { paddingLeft: 12 },
        ]}
      >
        {parts.length > 0 ? parts : <Text style={[markdownStyles.text, { color: textColor }]}>{line}</Text>}
      </Text>
    );
  });
};

export default function DunoAIScreen() {
  const colorScheme = useColorScheme();
  const isDark = false; // Forced light theme as requested

  const [fullName, setFullName] = useState('Técnico');
  const [firstName, setFirstName] = useState('Técnico');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [manualsModalVisible, setManualsModalVisible] = useState(false);
  const [manuals, setManuals] = useState<ManualSummary[]>([]);
  const [isLoadingManuals, setIsLoadingManuals] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const lastResponseId = useRef<string | null>(null);
  const messageYPositions = useRef<Record<string, number>>({});

  // Carrega o nome do técnico e contagem inicial de manuais
  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) return;
        const { data } = await supabase
          .from('technicians')
          .select('name')
          .eq('id', session.user.id)
          .maybeSingle();
        const name = data?.name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Técnico';
        setFullName(name);
        setFirstName(name.split(' ')[0]);
      } catch (e) {
        console.log('[DunoIA] Error loading user:', e);
      }
    };
    const loadInitialManuals = async () => {
      const data = await getAvailableManuals();
      setManuals(data);
    };
    loadUser();
    loadInitialManuals();
  }, []);

  const handleOpenManuals = async () => {
    setManualsModalVisible(true);
    setIsLoadingManuals(true);
    const data = await getAvailableManuals();
    setManuals(data);
    setIsLoadingManuals(false);
  };

  // Inicializa mensagem de boas-vindas refinada
  useEffect(() => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Olá, **${firstName}**! 👋 Sou a **Duno IA**, sua assistente técnica.\n\nEstou pronta para responder qualquer dúvida técnica com base nos **manuais e PDFs** cadastrados.\n\nComo posso ajudar você hoje?`,
    }]);
  }, [firstName]);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    Keyboard.dismiss();

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const typingId = 'typing-' + Date.now();
    setMessages(p => [...p, userMsg, { id: typingId, role: 'assistant', content: '', isTyping: true }]);
    setInput('');
    setIsLoading(true);
    scrollToEnd();

    let response = '';

    try {
      await new Promise(r => setTimeout(r, 1000));

      // 1️⃣ Resposta para saudações e perguntas sobre si mesma
      const personal = detectPersonal(userMsg.content, fullName, firstName);
      if (personal) {
        response = personal;
      } else {
        // 2️⃣ Busca no RAG de manuais e PDFs carregados com contexto conversacional
        const conversationHistory = messages
          .filter(m => m.id !== 'welcome' && !m.isTyping)
          .map(m => ({ role: m.role, content: m.content }));

        const kbResponse = await searchKnowledgeBase(userMsg.content, conversationHistory);
        if (kbResponse) {
          response = kbResponse;
        } else {
          // Fallback restrito de escopo
          response = `Desculpe, **${firstName}**. Não encontrei informações sobre este procedimento ou erro nos manuais e PDFs de aprendizado salvos no meu sistema. Pode tentar reformular a pergunta ou verificar se o manual correspondente foi importado no painel?`;
        }
      }
    } catch (err) {
      console.error('[Duno IA] Error:', err);
      response = `${firstName}, desculpe, tive um problema de comunicação com a minha base de dados. Pode tentar enviar sua pergunta novamente? 🔄`;
    }

    const newResponseId = Date.now().toString();
    lastResponseId.current = newResponseId;
    setMessages(p => p.map(m => m.id === typingId ? { id: newResponseId, role: 'assistant', content: response } : m));
    setIsLoading(false);
  }, [input, isLoading, firstName, fullName, messages, scrollToEnd]);

  const handleReset = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Olá, **${firstName}**! 👋 Sou a **Duno IA**, sua assistente técnica.\n\nEstou pronta para responder qualquer dúvida técnica com base nos **manuais e PDFs** cadastrados.\n\nComo posso ajudar você hoje?`,
    }]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* ── Header Premium ── */}
      <View style={[styles.header, isDark && styles.headerDark]}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="sparkles" size={18} color="#ffffff" />
          </View>
          <View>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>Duno IA</Text>
              <View style={styles.statusContainer}>
                <View style={styles.statusDot} />
                <Text style={styles.statusText}>ATIVO</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>Suporte Técnico & Manuais</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <Pressable style={styles.manualsButton} onPress={handleOpenManuals}>
            <Ionicons name="book-outline" size={16} color="#ffffff" />
            <Text style={styles.manualsButtonText}>Manuais</Text>
            {manuals.length > 0 && (
              <View style={styles.manualsBadge}>
                <Text style={styles.manualsBadgeText}>{manuals.length}</Text>
              </View>
            )}
          </Pressable>

          <Pressable style={styles.resetButton} onPress={handleReset}>
            <Ionicons name="refresh" size={18} color="#ffffff" />
          </Pressable>
        </View>
      </View>

      {/* ── Chat Area ── */}
      <ScrollView
        ref={scrollRef}
        style={styles.chatArea}
        contentContainerStyle={[styles.chatContent, messages.length <= 1 && { flexGrow: 1, justifyContent: 'center' }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Dashboard de Entrada / Boas-vindas */}
        {messages.length <= 1 && (
          <View style={styles.welcomeHeroContainer}>
            <View style={styles.welcomeIconRing}>
              <View style={styles.welcomeIconInner}>
                <Ionicons name="sparkles" size={22} color="#ffffff" />
              </View>
            </View>
            <Text style={[styles.welcomeTitle, isDark && styles.welcomeTitleDark]}>
              Como posso te ajudar hoje?
            </Text>
            <Text style={[styles.welcomeSubtitle, isDark && styles.welcomeSubtitleDark]}>
              Tire dúvidas sobre códigos de erro, especificações técnicas e procedimentos operacionais baseados nos manuais aprendidos.
            </Text>
          </View>
        )}

        {/* Messages */}
        {messages.length > 0 && messages.map(msg => (
          <View
            key={msg.id}
            onLayout={(e) => {
              const y = e.nativeEvent.layout.y;
              messageYPositions.current[msg.id] = y;
              if (msg.id === lastResponseId.current) {
                setTimeout(() => {
                  scrollRef.current?.scrollTo({ y: Math.max(0, y - 10), animated: true });
                }, 50);
              }
            }}
            style={[
              styles.messageRow,
              msg.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant,
            ]}
          >
            {msg.role === 'assistant' && (
              <View style={styles.assistantAvatar}>
                <Ionicons name="sparkles" size={14} color="#60a5fa" />
              </View>
            )}

            <View
              style={[
                styles.messageBubble,
                msg.role === 'user' ? styles.userBubble : styles.assistantBubble,
                isDark && msg.role === 'assistant' && styles.assistantBubbleDark,
              ]}
            >
              {msg.isTyping ? (
                <View style={styles.typingContainer}>
                  <ActivityIndicator size="small" color="#60a5fa" />
                  <Text style={styles.typingText}>Analisando manuais...</Text>
                </View>
              ) : (
                <View>{renderMarkdown(msg.content, msg.role === 'user', isDark)}</View>
              )}
            </View>

            {msg.role === 'user' && (
              <View style={[styles.userAvatar, isDark && styles.userAvatarDark]}>
                <Ionicons name="person" size={15} color={isDark ? '#cbd5e1' : '#64748b'} />
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {/* ── Input Area ── */}
      <View style={[styles.inputContainer, isDark && styles.inputContainerDark]}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.textInput, isDark && styles.textInputDark]}
            value={input}
            onChangeText={setInput}
            placeholder={`Tire sua dúvida técnica, ${firstName}...`}
            placeholderTextColor={isDark ? '#64748b' : '#94a3b8'}
            multiline
            maxLength={1000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={handleSend}
          />
          <Pressable
            style={[
              styles.sendButton,
              (!input.trim() || isLoading) && (isDark ? styles.sendButtonDisabledDark : styles.sendButtonDisabled),
            ]}
            onPress={handleSend}
            disabled={!input.trim() || isLoading}
          >
            <Ionicons
              name="send"
              size={18}
              color={!input.trim() || isLoading ? '#94a3b8' : '#ffffff'}
            />
          </Pressable>
        </View>
        <Text style={styles.disclaimer}>
          Duno IA • Respostas geradas estritamente a partir de manuais técnicos.
        </Text>
      </View>

      {/* ── Modal de Manuais Disponíveis ── */}
      <Modal
        visible={manualsModalVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setManualsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={styles.modalHeaderIcon}>
                  <Ionicons name="book" size={20} color="#10b981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Manuais na Memória da IA</Text>
                  <Text style={styles.modalSubtitle}>Documentos salvos para consulta instantânea</Text>
                </View>
              </View>
              <Pressable style={styles.modalCloseButton} onPress={() => setManualsModalVisible(false)}>
                <Ionicons name="close" size={22} color="#94a3b8" />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 10, paddingVertical: 12 }}>
              {isLoadingManuals ? (
                <View style={{ padding: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#10b981" />
                  <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 10 }}>Carregando manuais...</Text>
                </View>
              ) : manuals.length === 0 ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Ionicons name="folder-open-outline" size={44} color="#64748b" />
                  <Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '700', marginTop: 12 }}>Nenhum manual cadastrado</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
                    Importe manuais técnicos e PDFs no painel administrativo para que a Duno IA possa responder sobre eles.
                  </Text>
                </View>
              ) : (
                manuals.map((m, idx) => (
                  <Pressable
                    key={idx}
                    style={styles.manualCard}
                    onPress={() => {
                      setManualsModalVisible(false);
                      setInput(`Me passe um resumo geral sobre o manual: ${m.name}`);
                    }}
                  >
                    <View style={styles.manualCardIcon}>
                      <Ionicons name="document-text" size={22} color="#1c2d4f" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.manualCardName} numberOfLines={2}>{m.name}</Text>
                      <Text style={styles.manualCardMeta}>⚡ {m.chunksCount} blocos de conhecimento aprendidos</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
                  </Pressable>
                ))
              )}
            </ScrollView>

            <Pressable style={styles.modalFooterButton} onPress={() => setManualsModalVisible(false)}>
              <Text style={styles.modalFooterButtonText}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ── Markdown Styles ──
const markdownStyles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 21 },
  bold: { fontSize: 14, fontWeight: '700', lineHeight: 21 },
  line: { marginVertical: 2 },
});

// ── Main Styles ──
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  containerDark: {
    backgroundColor: '#0f172a', // Slate 900, lighter than #0b1329
  },

  // Header Premium
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#1c2d4f',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  headerDark: {
    backgroundColor: '#1e293b', // Slate 800
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  statusText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#10b981',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#93c5fd',
    fontWeight: '600',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resetButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },

  // Chat Area
  chatArea: {
    flex: 1,
  },
  chatContent: {
    paddingHorizontal: 10,
    paddingVertical: 18,
    paddingBottom: 12,
  },

  // Boas-vindas Hero
  welcomeHeroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  welcomeIconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(28, 45, 79, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  welcomeIconInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1c2d4f',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1c2d4f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  welcomeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1c2d4f',
    textAlign: 'center',
    marginBottom: 6,
  },
  welcomeTitleDark: {
    color: '#ffffff',
  },
  welcomeSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  welcomeSubtitleDark: {
    color: '#94a3b8',
  },

  // Suggestions
  suggestionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginVertical: 10,
    paddingHorizontal: 10,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  suggestionChipDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  suggestionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  suggestionTextDark: {
    color: '#cbd5e1',
  },

  // Messages List
  messageRow: {
    flexDirection: 'row',
    marginBottom: 18,
    gap: 8,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '88%',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: '#1c2d4f',
    borderBottomRightRadius: 4,
    shadowColor: '#1c2d4f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  assistantBubble: {
    backgroundColor: '#ffffff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  assistantBubbleDark: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
  },
  assistantAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(28, 45, 79, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(28, 45, 79, 0.1)',
  },
  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  userAvatarDark: {
    backgroundColor: '#334155',
    borderColor: '#475569',
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  typingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Input Box
  inputContainer: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 8,
  },
  inputContainerDark: {
    backgroundColor: '#1e293b',
    borderTopColor: '#334155',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  textInputDark: {
    backgroundColor: '#0f172a',
    color: '#f1f5f9',
    borderColor: '#334155',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1c2d4f',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1c2d4f',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#e2e8f0',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonDisabledDark: {
    backgroundColor: '#1e293b',
    shadowOpacity: 0,
    elevation: 0,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Manuals Button Header
  manualsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  manualsButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  manualsBadge: {
    backgroundColor: '#10b981',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  manualsBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ffffff',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalHeaderIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  manualCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  manualCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  manualCardMeta: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  modalFooterButton: {
    marginTop: 14,
    backgroundColor: '#1c2d4f',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalFooterButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
