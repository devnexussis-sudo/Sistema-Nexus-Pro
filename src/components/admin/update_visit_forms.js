const fs = require('fs');
const file = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/src/components/admin/VisitFormsTab.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace line 261
code = code.replace(
    /const videoUrl = formData\.videoUrl \|\| formData\.video_url;/,
    `const videoUrlsRaw = formData.videoUrl || formData.video_url;\n  const videoUrls = typeof videoUrlsRaw === 'string' ? videoUrlsRaw.split(',').map(u => u.trim()).filter(Boolean) : [];`
);

// Replace videoUrl condition at line 512
code = code.replace(
    /\{isOpen && \(signatureUrl \|\| clientName \|\| extraPhotos\.length > 0 \|\| videoUrl\) && \(/,
    `{isOpen && (signatureUrl || clientName || extraPhotos.length > 0 || videoUrls.length > 0) && (`
);

// Replace video rendering
code = code.replace(
    /\{\/\* Vídeo \*\/\}[\s\S]*?\{\/\* Fotos extras \*\/\}/,
    `{/* Vídeos */}
            {videoUrls.length > 0 && (
              <div>
                <p className="text-[9px] font-semibold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Video size={10} /> Vídeo{videoUrls.length > 1 ? 's' : ''} de Evidência</p>
                <div className="flex flex-wrap gap-3">
                  {videoUrls.map((url: string, i: number) => (
                    <div
                      key={i}
                      className="w-24 h-24 rounded-lg overflow-hidden border border-indigo-100 bg-black cursor-zoom-in hover:shadow-md transition-all relative"
                      onClick={() => onImageClick(url)}
                    >
                      <video src={url} className="w-full h-full object-cover opacity-60" preload="metadata" />
                      <div className="absolute inset-0 flex items-center justify-center"><Play size={16} className="text-white fill-white" /></div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fotos extras */}`
);

fs.writeFileSync(file, code);
