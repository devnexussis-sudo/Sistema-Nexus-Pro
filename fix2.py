import sys, re

def process(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Replace simple template literals: `text ${var} text` -> "text " + var + " text"
    # To be safe, let's just do standard string replacements for the known ones.
    
    replacements = [
        (r'`Erro ao cancelar no Asaas: \${delData.errors\[0\].description}`', r'"Erro ao cancelar no Asaas: " + delData.errors[0].description'),
        (r'`Item não encontrado: \${itemId}`', r'"Item não encontrado: " + itemId'),
        (r'`Erro ao criar cliente no Asaas: \${createCustData.errors\[0\].description}`', r'"Erro ao criar cliente no Asaas: " + createCustData.errors[0].description'),
        (r'`Pagamento de \${itemType} #\${displayId || itemId}`', r'"Pagamento de " + itemType + " #" + (displayId || itemId)'),
        (r'`Erro ao gerar pagamento: \${paymentData.errors\[0\].description}`', r'"Erro ao gerar pagamento: " + paymentData.errors[0].description')
    ]
    
    for old, new in replacements:
        content = re.sub(old, new, content)
        
    with open(file_path, 'w') as f:
        f.write(content)

process("/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/supabase/functions/asaas-create-charge/index.ts")
process("/Users/alexcruz/.gemini/antigravity-ide/brain/dd02b240-e556-4e72-a7ca-640cb9b5bd51/edge_functions_code.md")
