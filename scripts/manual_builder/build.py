# -*- coding: utf-8 -*-
"""
Master Builder: Compilação Completa do Manual do Usuário Duno
Gera:
1. docs/Manual_Usuario_Duno.md
2. docs/Manual_Usuario_Duno.html
3. docs/Manual_Usuario_Duno.docx
4. docs/Manual_Usuario_Duno.pdf
"""

import os
import sys
import re
import subprocess

# Import modules
from part_init import CONTENT as content_init
from part_1 import CONTENT as content_p1
from part_2 import CONTENT as content_p2
from part_3a import CONTENT as content_p3a
from part_3b import CONTENT as content_p3b
from part_4 import CONTENT as content_p4
from part_5_6_7 import CONTENT as content_p567

def md_to_html(md_text):
    """Conversor robusto de Markdown para HTML corporativo estilizado"""
    html_lines = []
    lines = md_text.split('\n')
    in_table = False
    table_header = []
    table_rows = []
    in_ul = False
    in_ol = False
    in_code = False
    code_lines = []

    def close_lists():
        nonlocal in_ul, in_ol
        res = []
        if in_ul:
            res.append('</ul>')
            in_ul = False
        if in_ol:
            res.append('</ol>')
            in_ol = False
        return res

    def flush_table():
        nonlocal in_table, table_header, table_rows
        if not in_table:
            return []
        in_table = False
        res = ['<div class="table-container"><table>']
        if table_header:
            res.append('<thead><tr>')
            for th in table_header:
                res.append(f'<th>{th}</th>')
            res.append('</tr></thead>')
        if table_rows:
            res.append('<tbody>')
            for row in table_rows:
                res.append('<tr>')
                for td in row:
                    res.append(f'<td>{td}</td>')
                res.append('</tr>')
            res.append('</tbody>')
        res.append('</table></div>')
        table_header = []
        table_rows = []
        return res

    def inline_format(text):
        # Bold
        text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
        # Italic
        text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
        # Code
        text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
        # Links
        text = re.sub(r'\[(.+?)\]\((.+?)\)', r'<a href="\2">\1</a>', text)
        return text

    for line in lines:
        raw_line = line.strip()

        # Handle Code block
        if raw_line.startswith('```'):
            if in_code:
                in_code = False
                html_lines.append('<pre><code>' + '\n'.join(code_lines) + '</code></pre>')
                code_lines = []
            else:
                html_lines.extend(close_lists())
                html_lines.extend(flush_table())
                in_code = True
            continue

        if in_code:
            code_lines.append(line)
            continue

        if not raw_line:
            html_lines.extend(close_lists())
            html_lines.extend(flush_table())
            continue

        # Tables
        if raw_line.startswith('|'):
            html_lines.extend(close_lists())
            in_table = True
            cols = [c.strip() for c in raw_line.split('|')[1:-1]]
            if any('---' in c for c in cols):
                continue # Skip separator
            if not table_header:
                table_header = [inline_format(c) for c in cols]
            else:
                table_rows.append([inline_format(c) for c in cols])
            continue
        elif in_table:
            html_lines.extend(flush_table())

        # Blockquotes (Alerts)
        if raw_line.startswith('>'):
            html_lines.extend(close_lists())
            alert_content = inline_format(raw_line[1:].strip())
            alert_class = "alert-note"
            if "ATENÇÃO" in alert_content or "CUIDADO" in alert_content:
                alert_class = "alert-warning"
            elif "DICA" in alert_content:
                alert_class = "alert-tip"
            elif "RESTRIÇÃO" in alert_content or "IMPEDIMENTO" in alert_content:
                alert_class = "alert-danger"
            html_lines.append(f'<div class="alert {alert_class}">{alert_content}</div>')
            continue

        # Headings
        if raw_line.startswith('# '):
            html_lines.extend(close_lists())
            title = inline_format(raw_line[2:])
            slug = re.sub(r'[^\w\- ]', '', title.lower()).replace(' ', '-')
            html_lines.append(f'<h1 id="{slug}">{title}</h1>')
            continue
        if raw_line.startswith('## '):
            html_lines.extend(close_lists())
            title = inline_format(raw_line[3:])
            slug = re.sub(r'[^\w\- ]', '', title.lower()).replace(' ', '-')
            html_lines.append(f'<h2 id="{slug}">{title}</h2>')
            continue
        if raw_line.startswith('### '):
            html_lines.extend(close_lists())
            title = inline_format(raw_line[4:])
            slug = re.sub(r'[^\w\- ]', '', title.lower()).replace(' ', '-')
            html_lines.append(f'<h3 id="{slug}">{title}</h3>')
            continue
        if raw_line.startswith('#### '):
            html_lines.extend(close_lists())
            title = inline_format(raw_line[5:])
            html_lines.append(f'<h4>{title}</h4>')
            continue

        # Horizontal Rule
        if raw_line in ('---', '***', '___'):
            html_lines.extend(close_lists())
            html_lines.append('<hr>')
            continue

        # Lists (Unordered)
        if raw_line.startswith('* ') or raw_line.startswith('- '):
            if in_ol:
                html_lines.extend(close_lists())
            if not in_ul:
                html_lines.append('<ul>')
                in_ul = True
            item_text = inline_format(raw_line[2:])
            html_lines.append(f'<li>{item_text}</li>')
            continue

        # Lists (Ordered)
        match_ol = re.match(r'^(\d+)\.\s+(.*)$', raw_line)
        if match_ol:
            if in_ul:
                html_lines.extend(close_lists())
            if not in_ol:
                html_lines.append('<ol>')
                in_ol = True
            item_text = inline_format(match_ol.group(2))
            html_lines.append(f'<li>{item_text}</li>')
            continue

        # Standard Paragraph
        html_lines.extend(close_lists())
        html_lines.append(f'<p>{inline_format(raw_line)}</p>')

    html_lines.extend(close_lists())
    html_lines.extend(flush_table())
    return '\n'.join(html_lines)


def build_full_manual():
    # Resolve to root workspace directory (Project Nexus Full)
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    docs_dir = os.path.join(base_dir, 'docs')
    os.makedirs(docs_dir, exist_ok=True)

    md_output_path = os.path.join(docs_dir, 'Manual_Usuario_Duno.md')
    html_output_path = os.path.join(docs_dir, 'Manual_Usuario_Duno.html')
    docx_output_path = os.path.join(docs_dir, 'Manual_Usuario_Duno.docx')
    pdf_output_path = os.path.join(docs_dir, 'Manual_Usuario_Duno.pdf')

    print("==================================================")
    print("      CONSTRUTOR DO MANUAL DO USUÁRIO DUNO       ")
    print("==================================================")

    # 1. Concatena os módulos Markdown
    print("[1/5] Concatenando seções do manual...")
    full_md = (
        content_init.strip() + "\n\n" +
        content_p1.strip() + "\n\n" +
        content_p2.strip() + "\n\n" +
        content_p3a.strip() + "\n\n" +
        content_p3b.strip() + "\n\n" +
        content_p4.strip() + "\n\n" +
        content_p567.strip() + "\n"
    )

    with open(md_output_path, 'w', encoding='utf-8') as f:
        f.write(full_md)
    print(f" -> Salvo com sucesso: {md_output_path} ({len(full_md.splitlines())} linhas)")

    # 2. Converte para HTML Corporativo
    print("[2/5] Gerando documento HTML com identidade visual corporativa...")
    body_html = md_to_html(full_md)

    full_html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Manual do Usuário — Sistema Duno</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');

  :root {{
    --navy: #1c2d4f;
    --navy-light: #253a66;
    --emerald: #10b981;
    --emerald-dark: #059669;
    --slate-dark: #1e293b;
    --slate-text: #334155;
    --slate-muted: #64748b;
    --bg-light: #f8fafc;
    --border-color: #e2e8f0;
  }}

  * {{
    box-sizing: border-box;
  }}

  body {{
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: var(--slate-text);
    background-color: #ffffff;
    line-height: 1.65;
    margin: 0;
    padding: 0;
    font-size: 15px;
  }}

  .container {{
    max-width: 960px;
    margin: 0 auto;
    padding: 40px 30px 80px 30px;
  }}

  /* Capa Profissional */
  .cover-page {{
    background: linear-gradient(135deg, var(--navy) 0%, #0f172a 100%);
    color: #ffffff;
    border-radius: 16px;
    padding: 60px 50px;
    margin-bottom: 50px;
    box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.15);
    border-bottom: 5px solid var(--emerald);
  }}

  .cover-logo {{
    font-size: 42px;
    font-weight: 900;
    letter-spacing: -0.04em;
    color: #ffffff;
    margin: 0 0 10px 0;
  }}

  .cover-logo span {{
    color: var(--emerald);
  }}

  .cover-subtitle {{
    font-size: 18px;
    color: #94a3b8;
    margin-bottom: 40px;
    font-weight: 400;
  }}

  .cover-title {{
    font-size: 32px;
    font-weight: 800;
    margin: 30px 0 10px 0;
    letter-spacing: -0.02em;
    color: #ffffff;
    border: none;
    padding: 0;
  }}

  .cover-desc {{
    font-size: 16px;
    color: #cbd5e1;
    margin-bottom: 40px;
  }}

  .cover-meta {{
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 20px;
  }}

  .meta-item {{
    font-size: 13px;
  }}

  .meta-label {{
    color: #94a3b8;
    text-transform: uppercase;
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
  }}

  .meta-value {{
    color: #ffffff;
    font-weight: 600;
  }}

  /* Tipografia */
  h1 {{
    color: var(--navy);
    font-size: 26px;
    font-weight: 800;
    margin-top: 50px;
    margin-bottom: 20px;
    padding-bottom: 10px;
    border-bottom: 2px solid var(--border-color);
    letter-spacing: -0.02em;
  }}

  h2 {{
    color: var(--navy);
    font-size: 21px;
    font-weight: 700;
    margin-top: 40px;
    margin-bottom: 16px;
    letter-spacing: -0.01em;
  }}

  h3 {{
    color: var(--slate-dark);
    font-size: 17px;
    font-weight: 600;
    margin-top: 30px;
    margin-bottom: 12px;
  }}

  h4 {{
    color: var(--navy-light);
    font-size: 15px;
    font-weight: 600;
    margin-top: 20px;
    margin-bottom: 8px;
  }}

  p {{
    margin: 0 0 16px 0;
  }}

  a {{
    color: #2563eb;
    text-decoration: none;
  }}

  a:hover {{
    text-decoration: underline;
  }}

  /* Caixas de Alerta (Callouts) */
  .alert {{
    padding: 16px 20px;
    border-radius: 10px;
    margin: 20px 0;
    font-size: 14px;
    border-left: 5px solid;
  }}

  .alert-note {{
    background-color: #eff6ff;
    border-color: #3b82f6;
    color: #1e3a8a;
  }}

  .alert-tip {{
    background-color: #ecfdf5;
    border-color: var(--emerald);
    color: #065f46;
  }}

  .alert-warning {{
    background-color: #fffbeb;
    border-color: #f59e0b;
    color: #92400e;
  }}

  .alert-danger {{
    background-color: #fef2f2;
    border-color: #ef4444;
    color: #991b1b;
  }}

  /* Tabelas */
  .table-container {{
    overflow-x: auto;
    margin: 25px 0;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.05);
  }}

  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
    text-align: left;
  }}

  th {{
    background-color: #f1f5f9;
    color: var(--navy);
    font-weight: 700;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
  }}

  td {{
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color);
    color: var(--slate-text);
  }}

  tr:last-child td {{
    border-bottom: none;
  }}

  tr:nth-child(even) td {{
    background-color: #f8fafc;
  }}

  /* Listas */
  ul, ol {{
    margin: 0 0 20px 0;
    padding-left: 24px;
  }}

  li {{
    margin-bottom: 6px;
  }}

  /* Códigos e Diagramas */
  pre {{
    background-color: #0f172a;
    color: #f8fafc;
    border-radius: 10px;
    padding: 18px 20px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    overflow-x: auto;
    line-height: 1.5;
    margin: 20px 0;
  }}

  code {{
    font-family: 'JetBrains Mono', monospace;
    background-color: #f1f5f9;
    color: var(--navy);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.9em;
  }}

  pre code {{
    background: none;
    color: inherit;
    padding: 0;
  }}

  hr {{
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 40px 0;
  }}

  /* Impressão */
  @media print {{
    body {{
      font-size: 12pt;
    }}
    .container {{
      max-width: 100%;
      padding: 0;
    }}
    h1 {{
      page-break-before: always;
    }}
    .table-container {{
      box-shadow: none;
    }}
  }}
</style>
</head>
<body>
<div class="container">

  <!-- CAPA OFICIAL -->
  <div class="cover-page">
    <div class="cover-logo">DUNO<span>.</span></div>
    <div class="cover-subtitle">Sistema de Gestão de Serviços, Manutenção e Operações de Campo</div>
    <div class="cover-title">MANUAL DO USUÁRIO</div>
    <div class="cover-desc">Guia Operacional Passo a Passo para o Painel Web e Aplicativo Móvel</div>
    <div class="cover-meta">
      <div class="meta-item">
        <div class="meta-label">Versão do Sistema</div>
        <div class="meta-value">2.5 Pro (Edição 2026)</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Data de Atualização</div>
        <div class="meta-value">Outubro de 2026</div>
      </div>
      <div class="meta-item">
        <div class="meta-label">Classificação</div>
        <div class="meta-value">Manual Oficial do Usuário</div>
      </div>
    </div>
  </div>

  <!-- CONTEÚDO PRINCIPAL -->
  {body_html}

</div>
</body>
</html>"""

    with open(html_output_path, 'w', encoding='utf-8') as f:
        f.write(full_html)
    print(f" -> Salvo com sucesso: {html_output_path}")

    # 3. Converte para DOCX via textutil (macOS nativo)
    print("[3/5] Convertendo para arquivo DOCX editável...")
    try:
        subprocess.run(['textutil', '-convert', 'docx', html_output_path, '-output', docx_output_path], check=True)
        print(f" -> Salvo com sucesso: {docx_output_path} ({os.path.getsize(docx_output_path)} bytes)")
    except Exception as e:
        print(f" -> [AVISO] Falha ao converter DOCX via textutil: {e}")

    # 4. Gera PDF Profissional via Node / jsPDF
    print("[4/5] Gerando documento PDF oficial diagramado...")
    pdf_script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generate_pdf.cjs')
    try:
        res = subprocess.run(['node', pdf_script_path], capture_output=True, text=True, check=True)
        print(res.stdout.strip())
        print(f" -> Salvo com sucesso: {pdf_output_path} ({os.path.getsize(pdf_output_path)} bytes)")
    except Exception as e:
        print(f" -> [AVISO] Falha na execução do gerador PDF via Node: {e}")

    print("[5/5] Concluído com sucesso!")
    print("==================================================")
    print("Documentos finais disponíveis na pasta 'docs/':")
    print(f"1. Markdown: {md_output_path}")
    print(f"2. HTML:     {html_output_path}")
    print(f"3. DOCX:     {docx_output_path}")
    print(f"4. PDF:      {pdf_output_path}")
    print("==================================================")

if __name__ == '__main__':
    build_full_manual()
