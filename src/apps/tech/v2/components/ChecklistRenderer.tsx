

import React, { useState } from 'react';
import { FormField, FormFieldType } from '../../../../types';
import { Camera, Check } from 'lucide-react';
import { DataService } from '../../../../services/dataService';

interface ChecklistRendererProps {
    fields: FormField[];
    answers: Record<string, any>;
    onAnswerChange: (fieldId: string, value: any) => void;
}

export const ChecklistRenderer: React.FC<ChecklistRendererProps> = ({ fields, answers, onAnswerChange }) => {
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
                // Lógica de condicional simples (exibir apenas se condição satisfeita)
                if (field.condition) {
                    const dependentValue = answers[field.condition.fieldId];
                    if (field.condition.operator === 'equals' && dependentValue !== field.condition.value) return null;
                    if (field.condition.operator === 'not_equals' && dependentValue === field.condition.value) return null;
                    if (!field.condition.operator && dependentValue !== field.condition.value) return null;
                }

                return (
                    <div key={field.id} className="glass p-5 rounded-2xl space-y-3 animate-in">
                        <label className="block text-xs font-black uppercase text-slate-400 tracking-wider">
                            {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>

                        {/* TEXTO / DESCRITIVO */}
                        {(field.type === FormFieldType.TEXT || field.type === FormFieldType.LONG_TEXT) && (
                            <textarea
                                rows={field.type === FormFieldType.LONG_TEXT ? 2 : 3}
                                className="w-full bg-black/20 border border-white/5 rounded-xl p-3 text-sm text-white focus:border-emerald-500/50 outline-none transition-all"
                                value={answers[field.id] || ''}
                                onChange={e => onAnswerChange(field.id, e.target.value)}
                                placeholder="Digite aqui..."
                            />
                        )}

                        {/* SELECT / OPÇÕES */}
                        {field.type === FormFieldType.SELECT && (
                            <div className="grid grid-cols-2 gap-2">
                                {field.options?.map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => onAnswerChange(field.id, opt)}
                                        className={`py-3 px-2 rounded-xl text-[10px] font-bold uppercase tracking-wide border transition-all ${answers[field.id] === opt
                                            ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                                            }`}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* FOTO - Integrado diretamente no checklist */}
                        {field.type === FormFieldType.PHOTO && (
                            <div>
                                {answers[field.id] ? (
                                    <div className="relative aspect-video rounded-xl overflow-hidden border border-emerald-500/30 group">
                                        <img src={answers[field.id]} alt="Evidência" className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => onAnswerChange(field.id, null)}
                                            className="absolute top-2 right-2 bg-red-500/80 p-2 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            Remover
                                        </button>
                                        <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-[10px] text-emerald-400 font-bold uppercase flex items-center gap-1">
                                            <Check size={10} /> Foto Salva
                                        </div>
                                    </div>
                                ) : (
                                    <label className="flex flex-col items-center justify-center aspect-video rounded-xl border-2 border-dashed border-white/20 bg-white/5 active:bg-white/10 transition-all cursor-pointer">
                                        {uploading[field.id] ? (
                                            <div className="animate-spin w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
                                        ) : (
                                            <>
                                                <Camera size={24} className="text-slate-500 mb-2" />
                                                <span className="text-[10px] font-black uppercase text-slate-500">Tirar Foto</span>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="hidden"
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) handlePhotoUpload(field.id, e.target.files[0]);
                                            }}
                                        />
                                    </label>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
