import sys, re

def process(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Fix the repeated string issue
    pattern = r'("Pagamento de " \+ itemType \+ " #" \+ \(displayId \|\| itemId\)\s*)+'
    content = re.sub(pattern, r'"Pagamento de " + itemType + " #" + (displayId || itemId)', content)
    
    with open(file_path, 'w') as f:
        f.write(content)

process("/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/supabase/functions/asaas-create-charge/index.ts")
process("/Users/alexcruz/.gemini/antigravity-ide/brain/dd02b240-e556-4e72-a7ca-640cb9b5bd51/edge_functions_code.md")
