# -*- coding: utf-8 -*-
"""
Script para geração da Carta Oficial de Boas-Vindas Duno
Gera:
- docs/Carta_Boas_Vindas_Duno.docx (Documento Word solicitado)
- docs/Carta_Boas_Vindas_Duno.pdf  (Documento PDF oficial)
- docs/Carta_Boas_Vindas_Duno.html (Documento HTML corporativo)
- docs/Carta_Boas_Vindas_Duno.md   (Markdown)
"""

import os
import subprocess

def generate_welcome_letter():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    docs_dir = os.path.join(base_dir, 'docs')
    os.makedirs(docs_dir, exist_ok=True)

    docx_path = os.path.join(docs_dir, 'Carta_Boas_Vindas_Duno.docx')
    pdf_path = os.path.join(docs_dir, 'Carta_Boas_Vindas_Duno.pdf')
    html_path = os.path.join(docs_dir, 'Carta_Boas_Vindas_Duno.html')
    md_path = os.path.join(docs_dir, 'Carta_Boas_Vindas_Duno.md')

    print("==================================================")
    print("   GERADOR DA CARTA OFICIAL DE BOAS-VINDAS DUNO   ")
    print("==================================================")

    # 1. Gerar Markdown
    md_content = """# CARTA OFICIAL DE BOAS-VINDAS AO DUNO
## Sistema de Gestão de Serviços, Manutenção e Operações de Campo
**Data de Ativação:** Outubro de 2026  
**Destinatário:** Novo Cliente e Usuário da Plataforma Duno  
**Documento Oficial de Boas-Vindas e Acesso Inicial**

---

### Prezada Equipe e Gestores,

É com imensa satisfação e entusiasmo que damos as **boas-vindas à sua empresa ao Duno**!

A partir de agora, sua operação dá um passo definitivo rumo à modernização, agilidade e máxima eficiência na gestão de serviços e manutenção. O Duno foi desenvolvido para conectar com precisão o que acontece no escritório e a execução em campo, eliminando o papel, organizando as demandas de WhatsApp, acelerando o faturamento e encantando seus clientes finais com laudos técnicos digitais de altíssimo padrão.

Nossa missão é simples: fazer com que sua equipe ganhe tempo, reduza custos invisíveis e tenha total controle sobre cada ordem de serviço, desde a abertura até o recebimento financeiro.

---

### SEUS DADOS DE ACESSO AO PAINEL ADMINISTRATIVO

Abaixo estão as informações e credenciais iniciais para o primeiro acesso da sua empresa:

| Informação / Campo | Detalhe de Acesso | Observação Operacional |
| :--- | :--- | :--- |
| **Endereço do Painel Web (URL)** | **https://app.duno.com.br** | Acessível pelo computador, notebook ou tablet via navegador. |
| **Código da Empresa (Tenant)** | `[NOME-OU-CODIGO-DA-EMPRESA]` | Identificador único da sua organização. |
| **E-mail do Administrador** | `admin@suaempresa.com.br` | E-mail corporativo cadastrado para acesso master. |
| **Senha Temporária Inicial** | `Duno@2026#Ativa` | **Obrigatório alterar no primeiro login** por segurança. |
| **Código PIN Operacional** | `[PIN: 849201]` | Assinatura rápida de 6 dígitos para conferências internas. |
| **Aplicativo do Técnico (Mobile)** | **Download Android / iOS / PWA** | Disponível para sua equipe de campo na loja e via web. |

> 🔒 **DICA DE SEGURANÇA:** No seu primeiro login, acesse seu perfil no canto superior direito do painel e redefina sua senha na aba "Alterar Senha". Crie uma senha corporativa forte contendo no mínimo 8 caracteres, uma letra maiúscula e um número.

---

### PRIMEIROS PASSOS — CHECKLIST DE IMPLANTAÇÃO RÁPIDA

Para começar a operar com total fluidez, recomendamos seguir este roteiro inicial:

1. **Passo 1 — Configuração da Sua Marca:**  
   Acesse *Configurações > Empresa*. Preencha os dados cadastrais (Razão Social, CNPJ, Telefone de Contato) e envie o logotipo da sua empresa em alta resolução. Ele será estampado automaticamente em todos os laudos técnicos em PDF, orçamentos e mensagens enviadas aos clientes.

2. **Passo 2 — Convidar a Equipe Interna:**  
   Acesse *Cadastros & Ativos > Usuários*. Cadastre seus atendentes, despachantes e analistas financeiros, associando cada um ao seu respectivo grupo de permissões.

3. **Passo 3 — Cadastrar os Técnicos de Campo:**  
   Acesse *Cadastros & Ativos > Técnicos*. Cadastre os profissionais que executam os serviços externos, habilite o acesso com status "Liberado" e oriente-os a baixar o Aplicativo Duno nos smartphones.

4. **Passo 4 — Cadastrar Seus Primeiros Clientes e Ativos:**  
   Acesse *Clientes* e *Equipamentos*. Registre seus clientes e os equipamentos com número de série para que possam ser impressas as etiquetas patrimoniais com QR Code.

5. **Passo 5 — Emitir sua Primeira Ordem de Serviço:**  
   Acesse *Ordens de Serviço* e clique no botão azul **"Nova Ordem de Serviço"**. Experimente o Wizard em 5 etapas e acompanhe o chamado surgir no celular do técnico em tempo real!

---

### ACESSO AO MANUAL COMPLETO DO USUÁRIO

Para que você e sua equipe tenham total autonomia e dominem todas as ferramentas avançadas do sistema (como a Atendente Virtual de WhatsApp Lia, Contratos PMOC, Almoxarifado Digital com QR Code e Faturamento Integrado via Pix/Boleto Asaas), disponibilizamos o **Manual Oficial do Usuário Duno (Versão 2.5 Pro)**:

* 📘 **Manual Completo em Formato PDF (49 Páginas, Pronto para Leitura):**  
  [Clique aqui para abrir o Manual_Usuario_Duno.pdf](file:///Users/mdc/Documents/Duno%20Project%202026%20-%20full/Project%20Nexus%20Full/docs/Manual_Usuario_Duno.pdf)  
  *Caminho local salvo:* `docs/Manual_Usuario_Duno.pdf`

* 📝 **Manual Completo em Formato Word DOCX (Editável):**  
  [Clique aqui para abrir o Manual_Usuario_Duno.docx](file:///Users/mdc/Documents/Duno%20Project%202026%20-%20full/Project%20Nexus%20Full/docs/Manual_Usuario_Duno.docx)  
  *Caminho local salvo:* `docs/Manual_Usuario_Duno.docx`

---

### CANAIS OFICIAIS DE SUPORTE E ATENDIMENTO

Sua empresa nunca estará sozinha. Nossa equipe de especialistas em sucesso do cliente está à disposição para auxiliar em cada etapa:

* **Suporte Online no Painel:** Clique no botão verde *"Suporte (Online Agora)"* no rodapé da barra lateral esquerda do sistema web.
* **WhatsApp de Atendimento ao Cliente:** (11) 98765-4321
* **E-mail de Suporte e Onboarding:** suporte@duno.com.br
* **Horário de Atendimento:** Segunda a Sexta-feira, das 08h00 às 18h00 (Plantão para chamados urgentes).

---

Conte com toda a nossa tecnologia, compromisso e dedicação para transformar a rotina da sua empresa e levar seus serviços ao mais alto nível de excelência.

Sejam muito bem-vindos à família Duno!

Atenciosamente,

**Equipe de Onboarding & Sucesso do Cliente**  
*Duno — Sistema de Gestão de Serviços, Manutenção e Operações de Campo*  
www.duno.com.br
"""

    with open(md_path, 'w', encoding='utf-8') as f:
        f.write(md_content)
    print(f" -> Markdown gerado: {md_path}")

    # 2. Gerar HTML Profissional com CSS Corporativo e Cores Oficiais
    # Paleta Duno: #1c2d4f (Navy Principal), #10b981 (Esmeralda Sucesso), #0f172a (Navy Escuro), #f8fafc (Cinza Claro)
    html_content = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Carta de Boas-Vindas — Duno</title>
<style>
  body {
    font-family: 'Segoe UI', Calibri, Arial, Helvetica, sans-serif;
    color: #1e293b;
    background-color: #ffffff;
    line-height: 1.6;
    margin: 0;
    padding: 0;
    font-size: 14px;
  }
  .page {
    max-width: 800px;
    margin: 20px auto;
    padding: 30px;
    background: #ffffff;
  }
  /* Header Oficial Duno */
  .header-table {
    width: 100%;
    border-collapse: collapse;
    background: #1c2d4f;
    border-radius: 8px;
    margin-bottom: 25px;
    border-bottom: 4px solid #10b981;
  }
  .header-td {
    padding: 24px 30px;
    vertical-align: middle;
  }
  .logo-title {
    font-size: 32px;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: -1px;
    margin: 0;
  }
  .logo-title span {
    color: #10b981;
  }
  .header-sub {
    font-size: 13px;
    color: #cbd5e1;
    margin-top: 4px;
    font-weight: 400;
  }
  .badge-welcome {
    background-color: #10b981;
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    padding: 6px 14px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 1px;
    display: inline-block;
  }
  /* Título Principal */
  h1 {
    color: #1c2d4f;
    font-size: 24px;
    font-weight: 800;
    margin: 0 0 15px 0;
    letter-spacing: -0.5px;
  }
  p {
    margin: 0 0 14px 0;
    color: #334155;
    font-size: 14px;
  }
  .lead-text {
    font-size: 15px;
    font-weight: 500;
    color: #1e293b;
  }
  /* Card de Credenciais */
  .credentials-card {
    background-color: #f8fafc;
    border: 2px solid #1c2d4f;
    border-radius: 8px;
    margin: 20px 0;
    padding: 0;
    overflow: hidden;
  }
  .credentials-header {
    background-color: #1c2d4f;
    color: #ffffff;
    padding: 10px 18px;
    font-weight: 700;
    font-size: 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .cred-table {
    width: 100%;
    border-collapse: collapse;
  }
  .cred-table td {
    padding: 10px 18px;
    border-bottom: 1px solid #e2e8f0;
    font-size: 13.5px;
  }
  .cred-table tr:last-child td {
    border-bottom: none;
  }
  .cred-label {
    font-weight: 700;
    color: #1c2d4f;
    width: 32%;
  }
  .cred-val {
    font-family: 'Consolas', 'Courier New', monospace;
    font-weight: 700;
    color: #0f172a;
    background-color: #ffffff;
    padding: 3px 8px;
    border-radius: 4px;
    border: 1px solid #cbd5e1;
    display: inline-block;
  }
  .cred-val-url {
    font-weight: 700;
    color: #1d4ed8;
    text-decoration: underline;
  }
  .cred-desc {
    color: #64748b;
    font-size: 12px;
  }
  /* Caixas de Destaque */
  .alert-box {
    padding: 12px 16px;
    border-radius: 6px;
    margin: 16px 0;
    font-size: 13px;
  }
  .alert-warning {
    background-color: #fffbeb;
    border-left: 4px solid #f59e0b;
    color: #92400e;
  }
  .alert-manual {
    background-color: #eff6ff;
    border: 2px dashed #3b82f6;
    border-radius: 8px;
    padding: 18px;
    margin: 25px 0;
  }
  .alert-manual h3 {
    margin: 0 0 8px 0;
    color: #1e40af;
    font-size: 16px;
  }
  /* Lista de Primeiros Passos */
  .steps-table {
    width: 100%;
    border-collapse: collapse;
    margin: 15px 0 25px 0;
  }
  .steps-table td {
    padding: 10px 12px;
    vertical-align: top;
    border-bottom: 1px solid #f1f5f9;
  }
  .step-num {
    background-color: #10b981;
    color: #ffffff;
    font-weight: 800;
    font-size: 12px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    text-align: center;
    line-height: 24px;
    display: inline-block;
  }
  .step-title {
    font-weight: 700;
    color: #1c2d4f;
    font-size: 14px;
    margin-bottom: 2px;
  }
  .step-desc {
    color: #475569;
    font-size: 12.5px;
    line-height: 1.45;
  }
  /* Suporte */
  .support-table {
    width: 100%;
    border-collapse: collapse;
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    margin: 15px 0 25px 0;
  }
  .support-table td {
    padding: 10px 15px;
    font-size: 13px;
    border-bottom: 1px solid #e2e8f0;
  }
  .support-table tr:last-child td {
    border-bottom: none;
  }
  /* Assinatura */
  .sign-area {
    margin-top: 35px;
    padding-top: 20px;
    border-top: 2px solid #e2e8f0;
  }
  .sign-name {
    font-weight: 700;
    color: #1c2d4f;
    font-size: 14px;
  }
  .sign-dept {
    color: #64748b;
    font-size: 12px;
  }
  .btn-link {
    background-color: #1c2d4f;
    color: #ffffff;
    text-decoration: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 12.5px;
    display: inline-block;
    margin-top: 8px;
    margin-right: 8px;
  }
  .btn-link:hover {
    background-color: #253a66;
  }
</style>
</head>
<body>
<div class="page">

  <!-- BANNER CABEÇALHO -->
  <table class="header-table">
    <tr>
      <td class="header-td" style="width: 70%;">
        <div class="logo-title">DUNO<span>.</span></div>
        <div class="header-sub">Sistema de Gestão de Serviços, Manutenção e Operações de Campo</div>
      </td>
      <td class="header-td" style="width: 30%; text-align: right;">
        <span class="badge-welcome">Boas-Vindas</span>
        <div style="color: #cbd5e1; font-size: 11px; margin-top: 8px;">Edição Oficial 2026</div>
      </td>
    </tr>
  </table>

  <!-- TÍTULO E ABERTURA -->
  <h1>Seja Muito Bem-Vindo ao Ecossistema Duno!</h1>
  
  <p class="lead-text">
    É uma enorme honra dar as boas-vindas à sua empresa. A partir de hoje, sua gestão de serviços ganha um poderoso aliado para conectar a equipe do escritório aos técnicos em campo, automatizar atendimentos e acelerar seu faturamento.
  </p>

  <p>
    O <strong>Duno</strong> foi desenhado com tecnologia de ponta para que sua operação funcione sem papel, sem perda de informações e com total transparência para seus clientes. Abaixo, preparamos suas informações essenciais para início imediato.
  </p>

  <!-- CARD DE CREDENCIAIS DE ACESSO -->
  <div class="credentials-card">
    <div class="credentials-header">
      <span>DADOS DE ACESSO AO PAINEL ADMINISTRATIVO</span>
      <span style="font-size: 11px; font-weight: 400; color: #a7f3d0;">Ambiente Corporativo Seguro</span>
    </div>
    <table class="cred-table">
      <tr>
        <td class="cred-label">Endereço Web (URL):</td>
        <td>
          <a href="https://app.duno.com.br" class="cred-val-url" target="_blank">https://app.duno.com.br</a>
          <div class="cred-desc">Acesso pelo computador ou tablet em qualquer navegador moderno.</div>
        </td>
      </tr>
      <tr>
        <td class="cred-label">Código da Empresa:</td>
        <td>
          <span class="cred-val">[NOME-DA-SUA-EMPRESA]</span>
          <div class="cred-desc">Identificador exclusivo da sua organização no sistema.</div>
        </td>
      </tr>
      <tr>
        <td class="cred-label">E-mail do Administrador:</td>
        <td>
          <span class="cred-val">admin@suaempresa.com.br</span>
          <div class="cred-desc">Login principal com permissões totais de configuração.</div>
        </td>
      </tr>
      <tr>
        <td class="cred-label">Senha Inicial Temporária:</td>
        <td>
          <span class="cred-val">Duno@2026#Ativa</span>
          <div class="cred-desc">Exige redefinição obrigatória logo no primeiro login.</div>
        </td>
      </tr>
      <tr>
        <td class="cred-label">Código PIN de Segurança:</td>
        <td>
          <span class="cred-val">[PIN: 849201]</span>
          <div class="cred-desc">Assinatura operacional rápida de 6 dígitos para conferências internas.</div>
        </td>
      </tr>
      <tr>
        <td class="cred-label">Aplicativo do Técnico:</td>
        <td>
          <span class="cred-val">App Duno (Android / iOS / PWA)</span>
          <div class="cred-desc">Disponibilizado para os profissionais de campo com suporte offline.</div>
        </td>
      </tr>
    </table>
  </div>

  <div class="alert-box alert-warning">
    <strong>Aviso Importante de Segurança:</strong> Ao efetuar seu primeiro login, clique no seu nome no canto superior direito do painel, acesse a aba <em>"Alterar Senha"</em> e crie uma senha pessoal segura (mínimo de 8 caracteres, com letra maiúscula e número).
  </div>

  <!-- CHECKLIST DE PRIMEIROS PASSOS -->
  <h2 style="color: #1c2d4f; font-size: 18px; margin-top: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
    Checklist de Implantação Rápida (Seus Primeiros Passos)
  </h2>

  <table class="steps-table">
    <tr>
      <td style="width: 35px;"><span class="step-num">1</span></td>
      <td>
        <div class="step-title">Personalize sua Marca e Dados da Empresa</div>
        <div class="step-desc">Acesse <strong>Configurações &gt; Empresa</strong>. Insira sua Razão Social, CNPJ, dados de contato e faça o upload do seu <strong>Logotipo</strong>. Ele aparecerá automaticamente em todos os laudos técnicos em PDF e orçamentos.</div>
      </td>
    </tr>
    <tr>
      <td><span class="step-num">2</span></td>
      <td>
        <div class="step-title">Cadastre sua Equipe e Técnicos de Campo</div>
        <div class="step-desc">Acesse <strong>Cadastros &gt; Usuários</strong> para criar os acessos dos seus atendentes e <strong>Cadastros &gt; Técnicos</strong> para cadastrar a equipe externa. Seus técnicos já poderão autenticar no aplicativo móvel.</div>
      </td>
    </tr>
    <tr>
      <td><span class="step-num">3</span></td>
      <td>
        <div class="step-title">Cadastre Seus Clientes e Equipamentos / Ativos</div>
        <div class="step-desc">Em <strong>Clientes</strong> e <strong>Equipamentos</strong>, cadastre seus clientes e o parque de máquinas com número de série. Você poderá gerar e imprimir etiquetas com <strong>QR Code</strong> para colar nos aparelhos.</div>
      </td>
    </tr>
    <tr>
      <td><span class="step-num">4</span></td>
      <td>
        <div class="step-title">Estruture Peças e Estoque do Almoxarifado</div>
        <div class="step-desc">No menu <strong>Estoque</strong>, cadastre os itens e peças mais utilizados e faça a transferência virtual para o veículo de cada técnico para que eles possam consumir peças em campo.</div>
      </td>
    </tr>
    <tr>
      <td><span class="step-num">5</span></td>
      <td>
        <div class="step-title">Emita sua Primeira Ordem de Serviço (OS)</div>
        <div class="step-desc">No menu <strong>Ordens de Serviço</strong>, clique em <strong>"Nova Ordem de Serviço"</strong>. Preencha o Wizard em 5 etapas e veja a notificação surgir no celular do técnico instantaneamente!</div>
      </td>
    </tr>
  </table>

  <!-- CARD DO MANUAL COMPLETO -->
  <div class="alert-manual">
    <h3>Manual Completo do Usuário Duno (Versão 2.5 Pro)</h3>
    <p style="margin-bottom: 12px; color: #1e3a8a;">
      Para capacitar toda a sua equipe e consultar o passo a passo ilustrado de cada tela, formulários dinâmicos, atendimento por WhatsApp com Inteligência Artificial (Lia), PMOC e faturamento via Pix/Boleto Asaas, consulte o manual oficial salvo na pasta de documentação:
    </p>
    <div>
      <a href="Manual_Usuario_Duno.pdf" class="btn-link" target="_blank">Abrir Manual em PDF (49 Páginas)</a>
      <a href="Manual_Usuario_Duno.docx" class="btn-link" style="background-color: #2563eb;" target="_blank">Abrir Manual em Word (DOCX)</a>
    </div>
    <div style="margin-top: 10px; font-size: 11.5px; color: #64748b;">
      Localização dos arquivos na sua pasta de documentação: <code>docs/Manual_Usuario_Duno.pdf</code> e <code>docs/Manual_Usuario_Duno.docx</code>
    </div>
  </div>

  <!-- CANAIS DE SUPORTE -->
  <h2 style="color: #1c2d4f; font-size: 18px; margin-top: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
    Canais Oficiais de Suporte e Ajuda
  </h2>
  
  <p>Sua empresa tem suporte direto da nossa equipe sempre que precisar:</p>

  <table class="support-table">
    <tr>
      <td style="font-weight: 700; width: 30%; color: #1c2d4f;">Chat Integrado no Painel:</td>
      <td>Botão verde <strong>"Suporte (Online Agora)"</strong> no rodapé da barra lateral do sistema.</td>
    </tr>
    <tr>
      <td style="font-weight: 700; color: #1c2d4f;">WhatsApp de Suporte:</td>
      <td><strong>(11) 98765-4321</strong> (Atendimento técnico e operacional).</td>
    </tr>
    <tr>
      <td style="font-weight: 700; color: #1c2d4f;">E-mail de Onboarding:</td>
      <td><strong>suporte@duno.com.br</strong></td>
    </tr>
    <tr>
      <td style="font-weight: 700; color: #1c2d4f;">Horário de Atendimento:</td>
      <td>Segunda a Sexta-feira, das 08h00 às 18h00 (Com plantão para emergências).</td>
    </tr>
  </table>

  <!-- ASSINATURA -->
  <div class="sign-area">
    <p style="font-style: italic; color: #475569; margin-bottom: 15px;">
      "Desejamos muito sucesso à sua empresa nessa nova etapa de excelência operacional!"
    </p>
    <div class="sign-name">Equipe de Onboarding &amp; Sucesso do Cliente</div>
    <div class="sign-dept">Duno Tecnologia — Sistema de Gestão de Serviços e Manutenção</div>
    <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">www.duno.com.br • contato@duno.com.br</div>
  </div>

</div>
</body>
</html>"""

    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print(f" -> HTML corporativo gerado: {html_path}")

    # 3. Converter para DOCX (Word) via textutil
    print("[1/2] Convertendo para arquivo Word (.docx)...")
    try:
        subprocess.run(['textutil', '-convert', 'docx', html_path, '-output', docx_path], check=True)
        print(f" -> DOCX gerado com sucesso: {docx_path} ({os.path.getsize(docx_path)} bytes)")
    except Exception as e:
        print(f" -> [ERRO] Falha ao converter DOCX via textutil: {e}")

    # 4. Gerar PDF correspondente via node / jsPDF
    print("[2/2] Gerando documento PDF correspondente...")
    pdf_gen_script = os.path.join(base_dir, 'scripts', 'manual_builder', 'generate_welcome_pdf.cjs')
    generate_welcome_pdf_script(pdf_gen_script)

    try:
        subprocess.run(['node', pdf_gen_script], check=True)
        print(f" -> PDF gerado com sucesso: {pdf_path} ({os.path.getsize(pdf_path)} bytes)")
    except Exception as e:
        print(f" -> [AVISO] Falha ao gerar PDF via Node: {e}")

    print("==================================================")
    print("Documentos da Carta de Boas-Vindas finalizados:")
    print(f"1. DOCX (Word): {docx_path}")
    print(f"2. PDF:         {pdf_path}")
    print(f"3. HTML:        {html_path}")
    print(f"4. Markdown:    {md_path}")
    print("==================================================")

def generate_welcome_pdf_script(script_path):
    js_code = """// scripts/manual_builder/generate_welcome_pdf.cjs
const fs = require('fs');
const path = require('path');
const { jsPDF } = require('jspdf');

function makePdf() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight; // 170mm

  // Header Banner (Navy #1c2d4f)
  doc.setFillColor(28, 45, 79);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Emerald Accent Line (#10b981)
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 44, pageWidth, 2.5, 'F');

  // Logo Duno
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(255, 255, 255);
  doc.text('DUNO', marginLeft, 24);
  
  doc.setTextColor(16, 185, 129);
  doc.text('.', marginLeft + 33, 24);

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text('Sistema de Gestão de Serviços, Manutenção e Operações de Campo', marginLeft, 33);

  // Welcome Pill on Right
  doc.setFillColor(16, 185, 129);
  doc.roundedRect(pageWidth - marginRight - 36, 16, 36, 8, 2, 2, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('BOAS-VINDAS', pageWidth - marginRight - 32, 21.5);

  let y = 58;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.setTextColor(28, 45, 79);
  doc.text('Seja Muito Bem-Vindo ao Ecossistema Duno!', marginLeft, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  const lead = doc.splitTextToSize('É com imensa satisfação que damos as boas-vindas à sua empresa. A partir de hoje, sua operação dá um passo definitivo rumo à modernização, agilidade e excelência na gestão de serviços e manutenção, conectando o escritório e a equipe de rua em tempo real.', contentWidth);
  doc.text(lead, marginLeft, y);
  y += lead.length * 4.8 + 5;

  // Credenciais Card
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginLeft, y, contentWidth, 68, 2, 2, 'F');
  doc.setDrawColor(28, 45, 79);
  doc.setLineWidth(0.6);
  doc.roundedRect(marginLeft, y, contentWidth, 68, 2, 2, 'S');

  // Header of Credentials
  doc.setFillColor(28, 45, 79);
  doc.rect(marginLeft, y, contentWidth, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('DADOS DE ACESSO AO PAINEL ADMINISTRATIVO', marginLeft + 4, y + 5.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(167, 243, 208);
  doc.text('Ambiente Corporativo Seguro', pageWidth - marginRight - 42, y + 5.5);
  y += 12;

  const creds = [
    { label: 'Endereço Web (URL):', val: 'https://app.duno.com.br', note: 'Acesso via computador ou tablet em qualquer navegador' },
    { label: 'Código da Empresa:', val: '[NOME-DA-SUA-EMPRESA]', note: 'Identificador único da sua organização' },
    { label: 'E-mail do Administrador:', val: 'admin@suaempresa.com.br', note: 'Login principal com permissões de gestão' },
    { label: 'Senha Temporária Inicial:', val: 'Duno@2026#Ativa', note: 'Exige troca obrigatória no primeiro acesso' },
    { label: 'Código PIN Operacional:', val: '[PIN: 849201]', note: 'Assinatura rápida de 6 dígitos para conferências' },
    { label: 'Aplicativo do Técnico:', val: 'App Duno (Android / iOS / PWA)', note: 'Instalação móvel para equipe de campo com modo offline' }
  ];

  creds.forEach((c) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(28, 45, 79);
    doc.text(c.label, marginLeft + 4, y);

    doc.setFont('courier', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(c.val, marginLeft + 48, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(c.note, marginLeft + 105, y);

    y += 9;
  });

  y += 6;

  // Warning Box
  doc.setFillColor(254, 242, 242);
  doc.roundedRect(marginLeft, y, contentWidth, 12, 1.5, 1.5, 'F');
  doc.setFillColor(239, 68, 68);
  doc.roundedRect(marginLeft, y, 2.5, 12, 1, 1, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(185, 28, 28);
  doc.text('Aviso Importante:', marginLeft + 6, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(153, 27, 27);
  doc.text('No seu primeiro acesso, acesse o menu de Perfil (topo direito) e altere a senha temporária para uma credencial pessoal forte.', marginLeft + 33, y + 5);
  doc.text('Padrão recomendado: no mínimo 8 caracteres contendo ao menos uma letra maiúscula e um número.', marginLeft + 6, y + 9);
  y += 18;

  // Primeiros Passos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(28, 45, 79);
  doc.text('Checklist de Implantação Rápida (Primeiros Passos)', marginLeft, y);
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 6;

  const steps = [
    { num: '1', title: 'Personalize sua Marca:', desc: 'Em Configurações > Empresa, insira seu CNPJ, dados de contato e Logotipo oficial para laudos em PDF.' },
    { num: '2', title: 'Cadastre sua Equipe:', desc: 'Em Cadastros > Usuários e Técnicos, cadastre atendentes e técnicos que utilizarão o aplicativo móvel.' },
    { num: '3', title: 'Cadastre Clientes e Ativos:', desc: 'Registre seus clientes e aparelhos com número de série e imprima etiquetas com QR Code.' },
    { num: '4', title: 'Estruture o Almoxarifado:', desc: 'Cadastre peças e transfira o saldo inicial para o estoque móvel do veículo de cada técnico.' },
    { num: '5', title: 'Emita a Primeira OS:', desc: 'Em Ordens de Serviço > Nova OS, use o Wizard em 5 etapas e acompanhe o chamado no celular do técnico.' }
  ];

  steps.forEach((s) => {
    doc.setFillColor(16, 185, 129);
    doc.circle(marginLeft + 3, y + 1.5, 2.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(s.num, marginLeft + 2, y + 2.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(28, 45, 79);
    doc.text(s.title, marginLeft + 8, y + 2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const dLines = doc.splitTextToSize(s.desc, contentWidth - 45);
    doc.text(dLines, marginLeft + 42, y + 2);

    y += 7.5;
  });

  y += 4;

  // Card do Manual Completo
  doc.setFillColor(239, 246, 255);
  doc.roundedRect(marginLeft, y, contentWidth, 24, 2, 2, 'F');
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginLeft, y, contentWidth, 24, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 64, 175);
  doc.text('Manual Completo do Usuário Duno (Versão 2.5 Pro — 49 Páginas)', marginLeft + 5, y + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 58, 138);
  doc.text('O guia definitivo com 100% dos procedimentos passo a passo, checklists, WhatsApp com IA (Lia) e financeiro.', marginLeft + 5, y + 11);
  doc.text('Disponível na pasta docs/: Manual_Usuario_Duno.pdf (PDF Oficial) e Manual_Usuario_Duno.docx (Word Editável).', marginLeft + 5, y + 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(29, 78, 216);
  doc.text('Consulte os arquivos na pasta docs/ do seu projeto para treinamento completo.', marginLeft + 5, y + 21);

  y += 30;

  // Suporte e Rodapé
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(28, 45, 79);
  doc.text('Canais de Suporte:', marginLeft, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('Chat no Painel (Online) • WhatsApp: (11) 98765-4321 • E-mail: suporte@duno.com.br', marginLeft + 30, y);

  y += 10;
  doc.setDrawColor(226, 232, 240);
  doc.line(marginLeft, y, marginLeft + contentWidth, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(28, 45, 79);
  doc.text('Equipe de Onboarding & Sucesso do Cliente • Duno Tecnologia', marginLeft, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text('www.duno.com.br • Sistema de Gestão de Serviços, Manutenção e Operações de Campo • 2026', marginLeft, y + 4);

  const outputPath = path.resolve(__dirname, '../../docs/Carta_Boas_Vindas_Duno.pdf');
  doc.save(outputPath);
  console.log('[PDF Welcome] PDF gerado com sucesso em: ' + outputPath);
}

makePdf();
"""
    with open(script_path, 'w', encoding='utf-8') as f:
        f.write(js_code)

if __name__ == '__main__':
    generate_welcome_letter()
