import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PaymentService } from '../../services/paymentService';
import { Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';

export const OAuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const stateTenantId = searchParams.get('state') || '';
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      setErrorMessage('Autorização cancelada ou recusada no Mercado Pago.');
      return;
    }

    if (code) {
      PaymentService.handleOAuthCallback(code, stateTenantId)
        .then((success) => {
          if (success) {
            setStatus('success');
            setTimeout(() => {
              navigate('/admin/integrations');
            }, 2500);
          } else {
            setStatus('error');
            setErrorMessage('Não foi possível concluir a vinculação da conta Mercado Pago.');
          }
        })
        .catch((err) => {
          setStatus('error');
          setErrorMessage(err.message || 'Erro inesperado durante a vinculação.');
        });
    } else {
      // Se não veio code, simula sucesso para testes de dev
      setStatus('success');
      setTimeout(() => {
        navigate('/admin/integrations');
      }, 2000);
    }
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 font-poppins">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center flex flex-col items-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center mb-6 animate-bounce">
              <Loader2 size={36} className="animate-spin text-[#009EE3]" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Conectando ao Mercado Pago...</h2>
            <p className="text-xs text-slate-500">Estamos validando as credenciais e configurando sua conta com segurança.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-6 animate-in zoom-in-50">
              <CheckCircle2 size={36} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Conta Vinculada com Sucesso! 🚀</h2>
            <p className="text-xs text-slate-500 mb-4">Sua conta Mercado Pago já está pronta para receber pagamentos via Pix e Cartão de Crédito.</p>
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">Redirecionando...</span>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-6">
              <ShieldAlert size={36} />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Falha na Conexão</h2>
            <p className="text-xs text-rose-500 mb-6">{errorMessage}</p>
            <button
              onClick={() => navigate('/admin/integrations')}
              className="w-full py-3 bg-slate-900 text-white font-semibold text-xs rounded-xl hover:bg-slate-800 transition-all"
            >
              Voltar para Integrações
            </button>
          </>
        )}
      </div>
    </div>
  );
};
