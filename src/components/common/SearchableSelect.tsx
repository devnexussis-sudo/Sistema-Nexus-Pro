import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

interface Option {
  id: string;
  name: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  noOptionsText?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Selecione...",
  searchPlaceholder = "Pesquisar...",
  noOptionsText = "Nenhum resultado"
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.id === value);
  const filteredOptions = options.filter(o => 
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative w-full">
      <div 
        onClick={() => { setIsOpen(!isOpen); setSearch(''); }}
        className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 bg-white cursor-pointer flex justify-between items-center outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all hover:bg-slate-50"
      >
        {selectedOption ? (
          <span className="truncate">{selectedOption.name}</span>
        ) : (
          <span className="text-slate-400 truncate">{placeholder}</span>
        )}
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-[100] w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2 border-b border-slate-100 flex items-center gap-2 bg-slate-50/50">
            <Search size={14} className="text-slate-400 ml-1" />
            <input 
              type="text" 
              autoFocus 
              placeholder={searchPlaceholder}
              value={search} 
              onChange={e => setSearch(e.target.value)}
              className="w-full py-1.5 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="max-h-56 overflow-y-auto custom-scrollbar p-1">
            <div 
              onClick={() => { onChange(''); setIsOpen(false); }}
              className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              Nenhum / Limpar
            </div>
            {filteredOptions.map(o => (
              <div 
                key={o.id} 
                onClick={() => { onChange(o.id); setIsOpen(false); }}
                className={`px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors truncate ${
                  o.id === value 
                    ? 'bg-primary-50 text-primary-700 font-bold' 
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {o.name}
              </div>
            ))}
            {filteredOptions.length === 0 && search.length > 0 && (
              <div className="px-3 py-4 text-center text-sm text-slate-400">
                {noOptionsText}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
