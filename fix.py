import sys

def process(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Substituir template literals do fetch por concatenação
    content = content.replace('`${ASAAS_API_URL}/payments/${paymentId}`', 'ASAAS_API_URL + "/payments/" + paymentId')
    content = content.replace('`${ASAAS_API_URL}/customers?cpfCnpj=${cleanDoc}`', 'ASAAS_API_URL + "/customers?cpfCnpj=" + cleanDoc')
    content = content.replace('`${ASAAS_API_URL}/customers`', 'ASAAS_API_URL + "/customers"')
    content = content.replace('`${ASAAS_API_URL}/payments`', 'ASAAS_API_URL + "/payments"')
    content = content.replace('`${ASAAS_API_URL}/payments/${paymentData.id}/pixQrCode`', 'ASAAS_API_URL + "/payments/" + paymentData.id + "/pixQrCode"')
    content = content.replace('`${ASAAS_API_URL}/payments?installment=${paymentData.installment}&limit=100`', 'ASAAS_API_URL + "/payments?installment=" + paymentData.installment + "&limit=100"')
    
    with open(file_path, 'w') as f:
        f.write(content)

process("/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/supabase/functions/asaas-create-charge/index.ts")
process("/Users/alexcruz/.gemini/antigravity-ide/brain/dd02b240-e556-4e72-a7ca-640cb9b5bd51/edge_functions_code.md")
