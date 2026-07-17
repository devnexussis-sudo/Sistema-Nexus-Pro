const fs = require('fs');
const file = '/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/src/components/public/PublicOrderView.tsx';
let code = fs.readFileSync(file, 'utf8');

// Helper replacement for print block
// Line 1516:
// if (!order.videoUrl && !formDataPrint.videoUrl && !formDataPrint.video_url && allValidExtrasPrint.length === 0) return null;
code = code.replace(
    /if \(\!order\.videoUrl && \!formDataPrint\.videoUrl && \!formDataPrint\.video_url && allValidExtrasPrint\.length === 0\) return null;/,
    `const videoUrlsRawP1 = order.videoUrl || formDataPrint.videoUrl || formDataPrint.video_url;
          const printVideoUrls = typeof videoUrlsRawP1 === 'string' ? videoUrlsRawP1.split(',').map(u => u.trim()).filter(Boolean) : [];
          if (printVideoUrls.length === 0 && allValidExtrasPrint.length === 0) return null;`
);

// Line 1522:
code = code.replace(
    /\{\(order\.videoUrl \|\| formDataPrint\.videoUrl \|\| formDataPrint\.video_url\) && \([\s\S]*?\}\)/,
    `{printVideoUrls.length > 0 && printVideoUrls.map((vUrl, vIdx) => (
                  <div key={'v'+vIdx} className="border border-slate-200 rounded-lg p-1.5 w-[220px] h-[160px] overflow-hidden flex items-center justify-center bg-black break-inside-avoid shadow-inner relative">
                    <video src={\`\${vUrl}#t=0.1\`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Play size={16} className="text-white opacity-80" />
                    </div>
                    <span className="absolute bottom-1 bg-black/60 text-white text-[8px] px-1.5 py-0.5 rounded uppercase leading-none">Vídeo \${vIdx + 1}</span>
                  </div>
                ))}`
);

// Helper replacement for visit block (print logic)
// Line 1798:
code = code.replace(
    /\{\(vFd\.technical_report \|\| vFd\.technicalReport \|\| v\.notes \|\| vFd\.parts_used \|\| vFd\.partsUsed \|\| visitPhotos\.length > 0 \|\| vFd\.videoUrl \|\| vFd\.video_url\) && \(/g,
    `{(() => {
                        const visitVideoUrlsRawP = vFd.videoUrl || vFd.video_url;
                        const visitVideoUrlsP = typeof visitVideoUrlsRawP === 'string' ? visitVideoUrlsRawP.split(',').map(u => u.trim()).filter(Boolean) : [];
                        return (vFd.technical_report || vFd.technicalReport || v.notes || vFd.parts_used || vFd.partsUsed || visitPhotos.length > 0 || visitVideoUrlsP.length > 0) && (`
);

code = code.replace(
    /\{\(visitPhotos\.length > 0 \|\| vFd\.videoUrl \|\| vFd\.video_url\) && \(/g,
    `{(visitPhotos.length > 0 || visitVideoUrlsP.length > 0) && (`
);

code = code.replace(
    /\{\(vFd\.videoUrl \|\| vFd\.video_url\) && \([\s\S]*?\}\)/g,
    `{visitVideoUrlsP.length > 0 && visitVideoUrlsP.map((vUrl, vIdx) => (
                                  <div key={'vv'+vIdx} className="border border-slate-200 rounded p-1 w-[140px] h-[105px] overflow-hidden flex items-center justify-center bg-black relative shadow-sm">
                                    <a href={vUrl} target="_blank" rel="noopener noreferrer" className="w-full h-full relative flex items-center justify-center cursor-pointer">
                                      <video src={\`\${vUrl}#t=0.1\`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <Play size={10} className="text-white opacity-80" />
                                      </div>
                                      <span className="absolute bottom-1 bg-black/60 text-white text-[7px] px-1 py-0.5 rounded uppercase leading-none z-10">Vídeo</span>
                                    </a>
                                  </div>
                                ))}`
);

// We added an IIFE around line 1798 so we need to close it:
// Search for:
//                         </div>
//                       </div>
//                     )}
// And replace ONE instance (the one corresponding to line 1858)
code = code.replace(
    /([\s\S]*?)(\n\s*?)(<\/div>\s*<\/div>\s*\)\})/,
    (match, p1, p2, p3) => p1 + p2 + `</div></div>)} )()} `
);

// Fix Web logic
code = code.replace(
    /\{\(visitData\.technical_report \|\| visitData\.technicalReport \|\| visit\.notes \|\| visitData\.parts_used \|\| visitData\.partsUsed \|\| visitPhotos\.length > 0 \|\| visitData\.videoUrl \|\| visitData\.video_url\) && \(/,
    `{(() => {
              const visitVideoUrlsRaw = visitData.videoUrl || visitData.video_url;
              const visitVideoUrls = typeof visitVideoUrlsRaw === 'string' ? visitVideoUrlsRaw.split(',').map(u => u.trim()).filter(Boolean) : [];
              return (visitData.technical_report || visitData.technicalReport || visit.notes || visitData.parts_used || visitData.partsUsed || visitPhotos.length > 0 || visitVideoUrls.length > 0) && (`
);

code = code.replace(
    /\{\(visitPhotos\.length > 0 \|\| visitData\.videoUrl \|\| visitData\.video_url\) && \(/,
    `{(visitPhotos.length > 0 || visitVideoUrls.length > 0) && (`
);

code = code.replace(
    /\{\(visitData\.videoUrl \|\| visitData\.video_url\) && \([\s\S]*?\}\)/,
    `{visitVideoUrls.length > 0 && visitVideoUrls.map((vUrl, vIdx) => (
                        <div
                          key={'vv'+vIdx}
                          className="w-24 h-24 rounded-lg overflow-hidden border border-slate-200 bg-black cursor-zoom-in hover:shadow-md transition-all relative"
                          onClick={() => onImageClick(vUrl)}
                        >
                          <video src={\`\${vUrl}#t=0.1\`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Play size={16} className="text-white opacity-80" />
                          </div>
                          <span className="absolute bottom-1 bg-black/60 text-white text-[8px] px-1 py-0.5 rounded uppercase leading-none z-10">Vídeo</span>
                        </div>
                      ))}`
);

// Find the corresponding closing div for web block and close the IIFE
// Because I don't want to mess up, I'll use multi_replace for this manually if it fails, or I will write out the exact match

fs.writeFileSync(file, code);
