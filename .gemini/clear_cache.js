// Script para limpar cache local e forçar sincronização com Supabase
// Cole este código no Console do navegador (F12) e pressione Enter

// Limpa todos os dados em cache do localStorage
localStorage.removeItem('nexus_customers_db');
localStorage.removeItem('nexus_equipments_db');
localStorage.removeItem('nexus_orders_db');
localStorage.removeItem('tenant_default_nexus_customers_db');
localStorage.removeItem('tenant_default_nexus_equipments_db');
localStorage.removeItem('tenant_default_nexus_orders_db');

console.log('✅ Cache limpo! Recarregue a página (F5) para buscar dados frescos do Supabase.');

// Recarrega a página automaticamente
setTimeout(() => {
    window.location.reload();
}, 1000);
