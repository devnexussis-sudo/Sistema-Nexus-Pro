/**
 * standardize_modals.cjs
 * Applies OS-panel-style modal wrappers to all specified admin pages
 */
const fs = require('fs');
const path = require('path');

const BASE = path.join(__dirname, '..', 'src', 'components', 'admin');

// Replacements: [oldPattern, newPattern] as plain string matches
const WRAPPER_REPLACEMENTS = [
  // Customer / Equipment: old rounded-[4rem] big modal
  [
    `bg-white rounded-[4rem] w-full max-w-4xl shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[92vh] animate-fade-in-up`,
    `bg-white rounded-none lg:rounded-xl w-full max-w-4xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200`
  ],
  [
    `bg-white rounded-[4rem] w-full max-w-3xl shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[92vh] animate-fade-in-up`,
    `bg-white rounded-none lg:rounded-xl w-full max-w-3xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200`
  ],
  // Backdrop overlay
  [
    `fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6 animate-in fade-in`,
    `fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in`
  ],
  [
    `fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6`,
    `fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in`
  ],
  // PlannedMaintenance container
  [
    `bg-white rounded-[2.5rem] w-full max-w-6xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col h-[85vh]`,
    `bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200`
  ],
  // PlannedMaintenance view modal
  [
    `fixed inset-0 z-[1300] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-6 print:p-0 print:bg-white print:relative print:z-0`,
    `fixed inset-0 z-[1300] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 lg:p-4 print:p-0 print:bg-white print:relative print:z-0 animate-in fade-in`
  ],
  [
    `bg-white rounded-[2.5rem] w-full max-w-6xl shadow-2xl overflow-hidden animate-fade-in-up flex flex-col h-[85vh] print:h-auto print:shadow-none print:rounded-none print:w-full print:max-w-none`,
    `bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200 print:h-auto print:shadow-none print:rounded-none print:w-full print:max-w-none`
  ],
  // PMCO audit modal
  [
    `fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/60 backdrop-blur-xl p-6`,
    `fixed inset-0 z-[1500] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in`
  ],
  [
    `bg-white rounded-[4rem] shadow-2xl p-12 max-w-sm w-full text-center animate-fade-in-up border border-primary-100`,
    `bg-white rounded-xl shadow-2xl p-10 max-w-sm w-full text-center border border-slate-200`
  ],
  // Headers — rounded corners on top
  [
    `p-10 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center rounded-t-[4rem]`,
    `px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 bg-white`
  ],
  [
    `px-10 py-6 border-b border-slate-200 flex justify-between items-center bg-white shrink-0`,
    `px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 bg-white`
  ],
  // Footers — rounded corners on bottom
  [
    `p-10 border-t border-slate-200 bg-slate-50/50 flex justify-end gap-6 rounded-b-[4rem]`,
    `px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0`
  ],
  // Header icon (large) → compact OS icon
  [
    `p-5 bg-[#1c2d4f] rounded-[1.5rem] text-white shadow-xl`,
    `w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-[#1c2d4f] shrink-0`
  ],
  // Header titles
  [
    `text-2xl font-bold text-slate-900  tracking-tight leading-none lowercase`,
    `text-sm sm:text-base font-semibold text-slate-900 font-poppins`
  ],
  [
    `text-2xl font-semibold text-slate-900 tracking-tight leading-none font-poppins`,
    `text-sm sm:text-base font-semibold text-slate-900 font-poppins`
  ],
  [
    `text-xl font-bold text-slate-900 uppercase tracking-tight`,
    `text-sm sm:text-base font-semibold text-slate-900 font-poppins`
  ],
  // Body form areas
  [
    `p-12 space-y-12 overflow-y-auto custom-scrollbar flex-1`,
    `flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar`
  ],
  [
    `p-12 space-y-10 overflow-y-auto custom-scrollbar flex-1`,
    `flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar`
  ],
  // Close button
  [
    `p-4 bg-white border border-slate-200 rounded-2xl text-slate-300 hover:text-slate-900 transition-all`,
    `p-2 text-slate-400 hover:text-slate-900 transition-all`
  ],
  [
    `p-4 bg-white border border-slate-200 rounded-2xl text-slate-300 hover:text-slate-900 transition-all shadow-sm`,
    `p-2 text-slate-400 hover:text-slate-900 transition-all`
  ],
  // Customer/equipment subtitle
  [
    `text-[10px] text-slate-400 font-bold  tracking-[0.2em] mt-2 lowercase`,
    `text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5`
  ],
  [
    `text-[10px] text-slate-400 font-bold  tracking-[0.2em] mt-2`,
    `text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5`
  ],
  // FormManagement backdrop
  [
    `fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden animate-in fade-in`,
    `fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in`
  ],
  [
    `bg-white rounded-xl w-full max-w-[96vw] h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up`,
    `bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200`
  ],
  // StockManagement item modal
  [
    `bg-white rounded-xl w-full max-w-6xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border border-slate-200`,
    `bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200`
  ],
  [
    `fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 sm:pt-20 animate-fade-in`,
    `fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in`
  ],
];

const FILES = [
  'CustomerManagement.tsx',
  'EquipmentManagement.tsx',
  'PlannedMaintenance.tsx',
  'StockManagement.tsx',
  'FormManagement.tsx',
];

let totalChanges = 0;

for (const filename of FILES) {
  const filePath = path.join(BASE, filename);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Skipping ${filename} — not found`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let fileChanges = 0;

  for (const [oldStr, newStr] of WRAPPER_REPLACEMENTS) {
    if (content.includes(oldStr)) {
      content = content.split(oldStr).join(newStr);
      fileChanges++;
    }
  }

  if (fileChanges > 0) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${filename}: ${fileChanges} replacements`);
    totalChanges += fileChanges;
  } else {
    console.log(`⏭️  ${filename}: no changes needed`);
  }
}

console.log(`\n🎯 Done — ${totalChanges} total replacements across ${FILES.length} files`);
