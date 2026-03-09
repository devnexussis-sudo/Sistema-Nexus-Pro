<!-- Avatar System Documentation -->
# 🎨 Sistema de Avatares Humanizados - Nexus Pro

## Novo Provedor: DiceBear API v7.x

Substituímos o UI-Avatars por DiceBear, que oferece avatares mais humanizados e diversificados.

### Estilos Disponíveis:

1. **avataaars** (Padrão para criação)
   - Estilo cartoon humanizado baseado no Sketch App Avatars
   - Ótimo para diversidade e profissionalismo
   - Exemplo: `https://api.dicebear.com/7.x/avataaars/svg?seed=JohnDoe&backgroundColor=10b981`

2. **lorelei** (Humanizado Feminino)
   - Avatares femininos estilizados
   - Ideal para variação de gênero
   - Exemplo: `https://api.dicebear.com/7.x/lorelei/svg?seed=MariaSilva&backgroundColor=10b981`

3. **personas** (Humanos Realistas)
   - Rostos humanos mais realistas
   - Boa diversidade étnica
   - Exemplo: `https://api.dicebear.com/7.x/personas/svg?seed=CarlosJunior&backgroundColor=10b981`

4. **bottts-neutral** (Robôs Neutros)
   - Robôs simpáticos para variação
   - Menos humanizado mas amigável
   - Exemplo: `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=TechBot&backgroundColor=10b981`

5. **fun-emoji** (Emoji Style)
   - Emojis coloridos e expressivos
   - Muito amigável e reconhecível
   - Exemplo: `https://api.dicebear.com/7.x/fun-emoji/svg?seed=HappyTech&backgroundColor=10b981`

### Cores por Tipo de Usuário:

- **Técnicos**: `backgroundColor=10b981` (Verde Esmeralda)
- **Administradores**: `backgroundColor=4f46e5` (Indigo)

### Funcionalidade de Randomização:

Ao clicar no ícone 🎲 próximo ao avatar:
- O sistema escolhe aleatoriamente um dos 5 estilos
- Gera um seed único baseado no nome + timestamp
- Cria um avatar totalmente novo e único
- Sincroniza automaticamente com:
  - Supabase Auth (user_metadata)
  - Tabela users/technicians
  - App do técnico (via login refresh)

### Sincronização Avatar → App Técnico:

Quando você atualiza o avatar no painel admin:

1. **Backend**:
   - Atualiza `auth.users.user_metadata.avatar`
   - Atualiza `technicians.avatar`
   
2. **Frontend**:
   - Durante o login, o sistema busca o avatar da tabela `technicians`
   - Se não encontrar, usa o do `auth.user_metadata`
   - Se ainda não encontrar, gera um avatar padrão baseado no nome
   
3. **Refresh no App**:
   - O técnico precisa fazer logout/login OU
   - Fechar e abrir o app novamente
   - O avatar será atualizado automaticamente

### Exemplos de Uso:

```typescript
// Avatar padrão ao criar técnico
avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}&backgroundColor=10b981`

// Avatar randomizado
const styles = ['avataaars', 'lorelei', 'personas', 'bottts-neutral', 'fun-emoji'];
const randomStyle = styles[Math.floor(Math.random() * styles.length)];
avatar: `https://api.dicebear.com/7.x/${randomStyle}/svg?seed=${name}-${Date.now()}&backgroundColor=10b981`
```

### Vantagens sobre UI-Avatars:

✅ Avatares mais humanos e profissionais
✅ Maior variedade de estilos
✅ Melhor representação de diversidade
✅ Formato SVG (escala perfeita em qualquer tamanho)
✅ API moderna e bem mantida
✅ Gratuito e sem limites de uso

### Troubleshooting:

**Avatar não atualiza no app do técnico:**
1. Verifique se o técnico fez logout/login
2. Confirme que a tabela `technicians` foi atualizada
3. Verifique o console do navegador por erros de CORS
4. Limpe o cache do navegador (Ctrl+Shift+Delete)
