
import React, { useState } from 'react';
import { FormField, FormFieldType } from '../../../../types';
import { Camera, Check, X } from 'lucide-react-native';
import { DataService } from '../../../../services/dataService';

interface ChecklistRendererProps {
    fields: FormField[];
    answers: Record<string, any>;
    onAnswerChange: (fieldId: string, value: any) => void;
    readOnly?: boolean;
}

export const ChecklistRenderer: React.FC<ChecklistRendererProps> = ({ fields, answers, onAnswerChange, readOnly = false }) => {
    const [uploading, setUploading] = useState<Record<string, boolean>>({});

    const handlePhotoUpload = async (fieldId: string, file: File) => {
        setUploading(prev => ({ ...prev, [fieldId]: true }));
        try {
            // Compressão e Upload usando o Motor V5 do DataService
            const blob = await DataService.processAndCompress(file);
            const url = await DataService.uploadBlob(blob, `checklist_photos/${Date.now()}_${fieldId}`);
            onAnswerChange(fieldId, url);
        } catch (e) {
            console.error("Erro upload foto checklist:", e);
            alert("Erro ao enviar foto. Tente novamente.");
        } finally {
            setUploading(prev => ({ ...prev, [fieldId]: false }));
        }
    };

    return (
        <div className="space-y-6">
            {fields.map(field => {
                // 🧠 Lógica de Gatilho Inteligente — Visibilidade Condicional
                if (field.condition && field.condition.fieldId) {
                    const dependentValue = answers[field.condition.fieldId];
                    const expectedValue = field.condition.value;
                    const operator = (field.condition.operator || 'equals') as string;

                    // Normaliza para comparação segura (trim + lowercase)
                    const normalizedDependent = (dependentValue ?? '').toString().trim().toLowerCase();
                    const normalizedExpected = (expectedValue ?? '').toString().trim().toLowerCase();

                    console.log(`[Checklist Mobile] Avaliando campo "${field.label}" | resposta pai: "${normalizedDependent}" | esperado: "${normalizedExpected}"`);

                    if (operator === 'equals' || operator === 'equal') {
                        if (normalizedDependent !== normalizedExpected) return null;
                    } else if (operator === 'not_equals') {
                        if (normalizedDependent === normalizedExpected) return null;
                    }
                }

                return (
                    <div key={field.id} className="bg-slate-50 border border-slate-100 p-5 rounded-lg space-y-3 animate-in">
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none ml-1">
                            {field.label} {field.required && <span className="text-rose-500">*</span>}
                        </label>

                        {/* TEXTO / DESCRITIVO */}
                        {(field.type === FormFieldType.TEXT || field.type === FormFieldType.LONG_TEXT) && (
                            <textarea
                                rows={field.type === FormFieldType.LONG_TEXT ? 2 : 3}
                                className={`w-full bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-900 font-bold outline-none transition-all placeholder:text-slate-300 ${readOnly ? 'opacity-70 cursor-not-allowed bg-slate-50' : 'focus:ring-4 focus:ring-primary-100 focus:border-primary-500'}`}
                                value={answers[field.id] || ''}
                                onChange={e => !readOnly && onAnswerChange(field.id, e.target.value)}
                                placeholder="Descreva aqui..."
                                disabled={readOnly}
                            />
                        )}

                        {/* SELECT / OPÇÕES */}
                        {field.type === FormFieldType.SELECT && (
                            <div className="grid grid-cols-2 gap-2">
                                {field.options?.map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => !readOnly && onAnswerChange(field.id, opt)}
                                        disabled={readOnly}
                                        className={`py-3 px-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${answers[field.id] === opt
                                            ? 'bg-primary-500 border-primary-500 text-white shadow-none'
                                            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}
                                            ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}
                                            `}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* FOTO - Integrado diretamente no checklist (Suporte a MÚLTIPLAS FOTOS - 7 Max) */}
                        {field.type === FormFieldType.PHOTO && (
                            <div className="space-y-3">
                                {(() => {
                                    const rawVal = answers[field.id];
                                    const photos = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
                                    
                                    return (
                                        <>
                                            {photos.length > 0 && (
                                                <div className="grid grid-cols-2 gap-2">
                                                    {photos.map((url, idx) => (
                                                        <div key={idx} className="relative aspect-video rounded-lg overflow-hidden border border-slate-200 shadow-sm group bg-white">
                                                            <img src={url} alt={`Evidência ${idx + 1}`} className="w-full h-full object-cover" />
                                                            {!readOnly && (
                                                                <button
                                                                    onClick={() => {
                                                                        const newPhotos = photos.filter((_, i) => i !== idx);
                                                                        onAnswerChange(field.id, newPhotos);
                                                                    }}
                                                                    className="absolute top-1.5 right-1.5 bg-rose-500/90 p-1.5 rounded-full text-white shadow-lg active:scale-90 transition-all"
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            
                                            {!readOnly && photos.length < 7 && (
                                                <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-primary-100 bg-primary-50/30 active:bg-primary-50 transition-all cursor-pointer">
                                                    {uploading[field.id] ? (
                                                        <div className="animate-spin w-6 h-6 border-4 border-primary-500 border-t-transparent rounded-full" />
                                                    ) : (
                                                        <>
                                                            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-primary-500 mb-1.5 border border-primary-100 shadow-sm">
                                                                <Camera size={20} />
                                                            </div>
                                                            <span className="text-[10px] font-black uppercase text-primary-600 tracking-widest">
                                                                {photos.length === 0 ? "Anexar Foto" : `Adicionar Mais (${photos.length}/7)`}
                                                            </span>
                                                        </>
                                                    )}
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        capture="environment"
                                                        className="hidden"
                                                        disabled={readOnly}
                                                        onChange={async (e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            
                                                            setUploading(prev => ({ ...prev, [field.id]: true }));
                                                            try {
                                                                const blob = await DataService.processAndCompress(file);
                                                                const url = await DataService.uploadBlob(blob, `checklist_photos/${Date.now()}_${field.id}`);
                                                                const newPhotos = [...photos, url];
                                                                onAnswerChange(field.id, newPhotos);
                                                            } catch (err) {
                                                                alert("Erro no upload.");
                                                            } finally {
                                                                setUploading(prev => ({ ...prev, [field.id]: false }));
                                                            }
                                                        }}
                                                    />
                                                </label>
                                            )}
                                            
                                            {readOnly && photos.length === 0 && (
                                                <div className="flex items-center justify-center h-20 rounded-lg border border-slate-100 bg-slate-50">
                                                    <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Sem fotos anexadas</span>
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
