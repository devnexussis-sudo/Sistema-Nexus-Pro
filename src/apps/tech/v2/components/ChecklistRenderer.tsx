
import React, { useState } from 'react';
import { FormField, FormFieldType } from '../../../../types';
import { Camera, Check, X } from 'lucide-react';
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

    const handleVideoUpload = async (fieldId: string, file: File) => {
        setUploading(prev => ({ ...prev, [fieldId]: true }));
        try {
            const url = await DataService.uploadBlob(file, `checklist_videos/${Date.now()}_${fieldId}`);
            onAnswerChange(fieldId, url);
        } catch (e) {
            console.error("Erro upload video checklist:", e);
            alert("Erro ao enviar vídeo. Tente novamente.");
        } finally {
            setUploading(prev => ({ ...prev, [fieldId]: false }));
        }
    };

    return (
        <div className="space-y-6">
            {fields.map((field, index) => {
                const displayIndex = String(index + 1).padStart(3, '0');
                const displayLabel = `#${displayIndex} - ${field.label}`;

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
                            {displayLabel} {field.required && <span className="text-rose-500">*</span>}
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

                        {/* MULTI_SELECT / CHECKLIST */}
                        {field.type === FormFieldType.MULTI_SELECT && (
                            <div className="space-y-2">
                                {field.options?.map(opt => {
                                    const selected: string[] = Array.isArray(answers[field.id]) ? answers[field.id] : [];
                                    const isChecked = selected.includes(opt);
                                    return (
                                        <button
                                            key={opt}
                                            disabled={readOnly}
                                            onClick={() => {
                                                if (readOnly) return;
                                                const newVal = isChecked
                                                    ? selected.filter(v => v !== opt)
                                                    : [...selected, opt];
                                                onAnswerChange(field.id, newVal);
                                            }}
                                            className={`w-full py-3 px-4 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-3 text-left ${isChecked
                                                ? 'bg-primary-500 border-primary-500 text-white shadow-none'
                                                : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}
                                                ${readOnly ? 'opacity-70 cursor-not-allowed' : ''}`}
                                        >
                                            <div className={`w-4 h-4 rounded-[4px] border-2 flex items-center justify-center shrink-0 transition-all ${isChecked ? 'bg-white/20 border-white/50' : 'border-slate-300 bg-white'}`}>
                                                {isChecked && <Check size={10} className="text-white" />}
                                            </div>
                                            {opt}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* FOTO - Integrado diretamente no checklist */}
                        {field.type === FormFieldType.PHOTO && (
                            <div>
                                {answers[field.id] ? (
                                    <div className="relative aspect-video rounded-lg overflow-hidden border border-primary-500/30 group">
                                        <img src={answers[field.id]} alt="Evidência" className="w-full h-full object-cover" />
                                        {!readOnly && (
                                            <button
                                                onClick={() => onAnswerChange(field.id, null)}
                                                className="absolute top-2 right-2 bg-rose-500/90 p-2 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                        <div className="absolute bottom-2 left-2 bg-primary-500/90 px-3 py-1.5 rounded-lg text-[9px] text-white font-black uppercase tracking-widest flex items-center gap-2">
                                            <Check size={12} /> Foto Salva
                                        </div>
                                    </div>
                                ) : !readOnly ? (
                                    <label className="flex flex-col items-center justify-center aspect-video rounded-lg border-2 border-dashed border-slate-200 bg-white active:bg-slate-100 transition-all cursor-pointer">
                                        {uploading[field.id] ? (
                                            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                                        ) : (
                                            <>
                                                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-2 border border-slate-100">
                                                    <Camera size={24} />
                                                </div>
                                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Tirar ou Anexar Foto</span>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            className="hidden"
                                            disabled={readOnly}
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) handlePhotoUpload(field.id, e.target.files[0]);
                                            }}
                                        />
                                    </label>
                                ) : (
                                    <div className="flex flex-col items-center justify-center aspect-video rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
                                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sem foto anexada</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* VÍDEO - Integrado diretamente no checklist */}
                        {field.type === FormFieldType.VIDEO && (
                            <div>
                                {answers[field.id] ? (
                                    <div className="relative aspect-video rounded-lg overflow-hidden border border-primary-500/30 group bg-black">
                                        <video src={answers[field.id]} controls className="w-full h-full object-contain" />
                                        {!readOnly && (
                                            <button
                                                onClick={() => onAnswerChange(field.id, null)}
                                                className="absolute top-2 right-2 bg-rose-500/90 p-2 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                            >
                                                <X size={16} />
                                            </button>
                                        )}
                                        <div className="absolute bottom-2 left-2 bg-primary-500/90 px-3 py-1.5 rounded-lg text-[9px] text-white font-black uppercase tracking-widest flex items-center gap-2 pointer-events-none">
                                            <Check size={12} /> Vídeo Salvo
                                        </div>
                                    </div>
                                ) : !readOnly ? (
                                    <label className="flex flex-col items-center justify-center aspect-video rounded-lg border-2 border-dashed border-slate-200 bg-white active:bg-slate-100 transition-all cursor-pointer">
                                        {uploading[field.id] ? (
                                            <div className="animate-spin w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full" />
                                        ) : (
                                            <>
                                                <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-2 border border-slate-100">
                                                    <Camera size={24} />
                                                </div>
                                                <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Gravar ou Anexar Vídeo</span>
                                            </>
                                        )}
                                        <input
                                            type="file"
                                            accept="video/*"
                                            capture="environment"
                                            className="hidden"
                                            disabled={readOnly}
                                            onChange={(e) => {
                                                if (e.target.files?.[0]) handleVideoUpload(field.id, e.target.files[0]);
                                            }}
                                        />
                                    </label>
                                ) : (
                                    <div className="flex flex-col items-center justify-center aspect-video rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
                                        <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Sem vídeo anexado</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
