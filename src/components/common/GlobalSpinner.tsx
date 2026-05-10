import React, { useEffect } from 'react';

/**
 * 🔄 GlobalSpinnerProvider — Motor de Loading Automático do Nexus OS
 * 
 * Intercepta TODOS os cliques em botões de ação (Salvar, Atualizar, Criar, etc.)
 * em qualquer página do sistema e aplica automaticamente o spinner de carregamento.
 * 
 * Estratégia: 
 *   1. Ativa o spinner IMEDIATAMENTE ao clicar (sem esperar fetch)
 *   2. Reverte quando o fetch termina OU após timeout de segurança
 *   3. Cobre botões <button> e elementos com role="button"
 *   4. Detecta palavras-chave em PT-BR para identificar botões de ação
 */
export const GlobalSpinnerProvider: React.FC = () => {
  useEffect(() => {
    let activeFetches = 0;
    const activeButtons = new Map<HTMLElement, { html: string; disabled: boolean; timer: ReturnType<typeof setTimeout> }>();

    const SPINNER_SVG = `<svg class="animate-spin h-4 w-4 inline text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

    const ACTION_KEYWORDS = [
      'salvar', 'atualizar', 'criar', 'confirmar', 'cadastrar',
      'enviar', 'gerar', 'adicionar', 'aplicar', 'registrar',
      'processar', 'gravar', 'concluir', 'finalizar', 'submeter',
      'save', 'update', 'create', 'submit', 'confirm',
      'salvando', 'processando', 'atualizando',
      // Compostas
      'criar conta', 'salvar alterações', 'confirmar cadastro',
      'novo administrador', 'novo técnico'
    ];

    // Palavras que devem ser EXCLUÍDAS (botões de navegação, filtros, etc.)
    const EXCLUDE_KEYWORDS = [
      'cancelar', 'fechar', 'voltar', 'limpar', 'filtro', 'pesquisar',
      'buscar', 'anterior', 'próximo', 'exportar', 'imprimir',
      'copiar', 'excluir', 'remover', 'deletar', 'logout', 'sair'
    ];

    function revertButton(btn: HTMLElement) {
      const saved = activeButtons.get(btn);
      if (!saved) return;
      clearTimeout(saved.timer);
      // Só reverte se o botão ainda está no DOM
      if (document.body.contains(btn)) {
        btn.innerHTML = saved.html;
        btn.removeAttribute('disabled');
        (btn as HTMLButtonElement).disabled = saved.disabled;
        btn.style.opacity = '';
        btn.style.pointerEvents = '';
      }
      activeButtons.delete(btn);
    }

    function revertAllButtons() {
      activeButtons.forEach((_, btn) => revertButton(btn));
    }

    function activateSpinner(btn: HTMLElement) {
      // Se já está ativo neste botão, ignora
      if (activeButtons.has(btn)) return;
      // Se o botão já tem um spinner manual do React, ignora
      if (btn.innerHTML.includes('animate-spin')) return;

      const originalHtml = btn.innerHTML;
      const originalDisabled = (btn as HTMLButtonElement).disabled || false;

      // Timeout de segurança: se nada reverter em 15s, reverte sozinho
      const safetyTimer = setTimeout(() => {
        revertButton(btn);
      }, 15000);

      activeButtons.set(btn, { html: originalHtml, disabled: originalDisabled, timer: safetyTimer });

      btn.style.opacity = '0.85';
      btn.style.pointerEvents = 'none';
      (btn as HTMLButtonElement).disabled = true;
      btn.innerHTML = `${SPINNER_SVG} <span class="font-bold inline-block ml-2">Processando...</span>`;
    }

    // --- INTERCEPTADOR DE FETCH ---
    const originalFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      activeFetches++;
      try {
        return await originalFetch.apply(this, args);
      } finally {
        activeFetches--;
        if (activeFetches <= 0) {
          activeFetches = 0;
          // Debounce de 300ms para sequências rápidas de fetch (ex: salvar + recarregar lista)
          setTimeout(() => {
            if (activeFetches === 0) {
              revertAllButtons();
            }
          }, 300);
        }
      }
    };

    // --- INTERCEPTADOR DE CLIQUE ---
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Procura o botão mais próximo (suporta ícones dentro de botões)
      const btn = target.closest('button, [role="button"]') as HTMLElement | null;
      if (!btn) return;

      const text = (btn.textContent || '').toLowerCase().trim();

      // Verifica se é um botão de ação
      const isAction = ACTION_KEYWORDS.some(kw => text.includes(kw));
      const isExcluded = EXCLUDE_KEYWORDS.some(kw => text.includes(kw));
      const isSubmit = btn.getAttribute('type') === 'submit';

      if ((isAction || isSubmit) && !isExcluded) {
        // Ativa o spinner IMEDIATAMENTE, sem esperar fetch
        // Usa requestAnimationFrame para garantir que o DOM já processou o click
        requestAnimationFrame(() => {
          activateSpinner(btn);
        });
      }
    };

    // --- INTERCEPTADOR DE SUBMIT DE FORM ---
    const handleSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      if (!form || form.tagName !== 'FORM') return;

      // Encontra o botão de submit dentro do form
      const submitBtn = form.querySelector('button[type="submit"], button:not([type="button"]):not([type="reset"])') as HTMLElement | null;
      if (submitBtn && !activeButtons.has(submitBtn)) {
        requestAnimationFrame(() => {
          activateSpinner(submitBtn);
        });
      }
    };

    // Usa capture phase para pegar o evento ANTES de qualquer handler React
    document.addEventListener('click', handleClick, true);
    document.addEventListener('submit', handleSubmit, true);

    return () => {
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('submit', handleSubmit, true);
      window.fetch = originalFetch;
      // Limpa tudo
      activeButtons.forEach((saved) => clearTimeout(saved.timer));
      activeButtons.clear();
    };
  }, []);

  return null;
};
