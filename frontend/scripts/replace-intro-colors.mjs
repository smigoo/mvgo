import fs from 'fs';

const filePath = 'src/views/generator/Intro.vue';
let content = fs.readFileSync(filePath, 'utf8');
let count = 0;

// Map of replacements: [pattern, replacement]
// For gradients, we use CSS variables that work in both light and dark modes
const replacements = [
  // === Border colors ===
  [/#e9ecef/g, 'var(--border-default)'],
  [/#dee2e6/g, 'var(--border-default)'],
  [/#d1d9e6/g, 'var(--border-strong)'],
  [/#e1e8ed/g, 'var(--border-default)'],
  [/#adb5bd/g, 'var(--text-tertiary)'],
  [/#90caf9/g, 'var(--brand-border)'],
  
  // === Text colors ===
  [/#495057/g, 'var(--text-primary)'],
  [/#6c757d/g, 'var(--text-tertiary)'],
  
  // === Success/error colors ===
  [/#28a745/g, 'var(--success)'],
  [/#e65100/g, 'var(--warning)'],
  [/#e91e63/g, 'var(--error-text)'],
  
  // === Framework card borders ===
  [/#ff6b35/g, 'var(--warning)'],
  [/#14b8a6/g, 'var(--c-teal-500)'],
  
  // === Meta-item background ===
  [/#f5f7fa/g, 'var(--bg-hover)'],
  
  // === Solid backgrounds ===
  [/\bwhite\b/g, 'var(--bg-card)'],
  
  // === Pros/Cons borders ===
  [/#81c784/g, 'var(--success-light)'],
  [/#ffb74d/g, 'var(--warning-light)'],
  
  // === Gradient backgrounds in CSS ===
  // highlight-box default: light blue → light purple
  [/linear-gradient\(135deg,\s*#e3f2fd\s+0%,\s*#f3e5f5\s+100%\)/g, 'linear-gradient(135deg, var(--brand-bg) 0%, var(--feature-bg) 100%)'],
  
  // highlight-box warn: light orange
  [/linear-gradient\(135deg,\s*#fff3e0\s+0%,\s*#ffe0b2\s+100%\)/g, 'linear-gradient(135deg, var(--warning-bg) 0%, var(--c-orange-100) 100%)'],
  
  // highlight-box green: light green
  [/linear-gradient\(135deg,\s*#e8f5e9\s+0%,\s*#c8e6c9\s+100%\)/g, 'linear-gradient(135deg, var(--success-bg) 0%, var(--c-green-100) 100%)'],
  
  // architecture-diagram default
  [/linear-gradient\(135deg,\s*var\(--bg-hover\)\s+0%,\s*var\(--border-default\)\s+100%\)/g, 'linear-gradient(135deg, var(--bg-hover) 0%, var(--bg-alt) 100%)'],
  
  // architecture-diagram collaborative
  [/linear-gradient\(135deg,\s*#e3f2fd\s+0%,\s*#f3e5f5\s+100%\)/g, 'linear-gradient(135deg, var(--brand-bg) 0%, var(--feature-bg) 100%)'],
  
  // why-item summary gradient
  [/linear-gradient\(135deg,\s*#e3f2fd\s+0%,\s*#bbdefb\s+100%\)/g, 'linear-gradient(135deg, var(--brand-bg-hover) 0%, var(--brand-bg) 100%)'],
  
  // pros gradient
  [/linear-gradient\(135deg,\s*#e8f5e9\s+0%,\s*#f1f8e9\s+100%\)/g, 'linear-gradient(135deg, var(--success-bg) 0%, var(--c-green-50) 100%)'],
  
  // cons gradient
  [/linear-gradient\(135deg,\s*#fff8e1\s+0%,\s*#ffecb3\s+100%\)/g, 'linear-gradient(135deg, var(--warning-bg) 0%, var(--c-orange-50) 100%)'],
  
  // innovation-card gradient
  // innovation-card default gradient
  [/linear-gradient\(135deg,\s*#f5f7fa\s+0%,\s*#c3cfe2\s+100%\)/g, 'linear-gradient(135deg, var(--bg-hover) 0%, var(--bg-alt) 100%)'],
  
  // component-box gradient
  [/linear-gradient\(135deg,\s*#f5f7fa\s+0%,\s*var\(--border-default\)\s+100%\)/g, 'linear-gradient(135deg, var(--bg-hover) 0%, var(--bg-alt) 100%)'],
  
  // framework-header gradient
  [/linear-gradient\(135deg,\s*#f5f7fa\s+0%,\s*var\(--border-default\)\s+100%\)/g, 'linear-gradient(135deg, var(--bg-hover) 0%, var(--bg-alt) 100%)'],
  
  // openclaw framework-header
  [/linear-gradient\(135deg,\s*#fff0e6\s+0%,\s*#ffd6ba\s+100%\)/g, 'linear-gradient(135deg, var(--warning-bg) 0%, var(--c-orange-100) 100%)'],
  
  // langgraph framework-header (already uses brand-bg via #e3f2fd)
  // Already handled above
  
  // hermes framework-header
  [/linear-gradient\(135deg,\s*#f3e5f5\s+0%,\s*#e1bee7\s+100%\)/g, 'linear-gradient(135deg, var(--feature-bg) 0%, var(--c-purple-100) 100%)'],
  
  // step-actor.skill gradient
  [/linear-gradient\(135deg,\s*#e3f2fd\s+0%,\s*#bbdefb\s+100%\)/g, 'linear-gradient(135deg, var(--brand-bg-hover) 0%, var(--brand-bg) 100%)'],
  
  // step-actor.script gradient
  [/linear-gradient\(135deg,\s*#fff3e0\s+0%,\s*#ffe0b2\s+100%\)/g, 'linear-gradient(135deg, var(--warning-bg) 0%, var(--c-orange-100) 100%)'],
  
  // Innovation card gradients with explicit colors in template
  [/#e3f2fd\s+0%,\s*#\w{6}\s+100%/g, 'var(--brand-bg-hover) 0%, var(--brand-bg) 100%'],
  
  // arch-node gradient items - handle separately since they have various color combos
  // Let the generic gradient replacements above handle most cases
  
  // rgba backgrounds
  [/rgba\(255,\s*255,\s*255,\s*0\.5\)/g, 'var(--bg-elevated)'],
  [/rgba\(40,\s*167,\s*69,\s*0\.1\)/g, 'rgba(var(--c-green-500-rgb), 0.1)'],
  [/rgba\(233,\s*30,\s*99,\s*0\.1\)/g, 'rgba(var(--c-red-500-rgb), 0.12)'],
];

for (const [pattern, replacement] of replacements) {
  const before = content.length;
  content = content.replace(pattern, replacement);
  if (content.length !== before) count++;
}

// Handle arch-node parallel gradient
content = content.replace(
  /background:\s*linear-gradient\(135deg,\s*var\(--success\)\s+0%,\s*#81c784\s+100%\)/g,
  'background: linear-gradient(135deg, var(--success) 0%, var(--success-light) 100%)'
);

// Handle arch-node agent gradient
content = content.replace(
  /background:\s*linear-gradient\(135deg,\s*var\(--brand\)\s+0%,\s*#5DD9A5\s+100%\)/g,
  'background: linear-gradient(135deg, var(--brand) 0%, var(--c-teal-400) 100%)'
);

// Handle arch-node validator gradient
content = content.replace(
  /background:\s*linear-gradient\(135deg,\s*var\(--warning-light\)\s+0%,\s*#ffb74d\s+100%\)/g,
  'background: linear-gradient(135deg, var(--warning-light) 0%, var(--c-orange-300) 100%)'
);

// Handle arch-node generator gradient
content = content.replace(
  /background:\s*linear-gradient\(135deg,\s*var\(--feature\)\s+0%,\s*#ba68c8\s+100%\)/g,
  'background: linear-gradient(135deg, var(--feature) 0%, var(--c-purple-300) 100%)'
);

// Handle arch-node layout refiner gradient (in template)
content = content.replace(
  /style="background:\s*linear-gradient\(135deg,\s*var\(--warning-light\)\s+0%,\s*var\(--c-yellow-400\)\s+100%\)\s*;\s*color:\s*white\s*;\s*border-color:\s*var\(--warning-light\)\s*;"/g,
  'style="background: linear-gradient(135deg, var(--warning-light) 0%, var(--c-yellow-500) 100%); color: white; border-color: var(--warning-light);"'
);

// Handle arch-node style refiner gradient (in template)
content = content.replace(
  /style="background:\s*linear-gradient\(135deg,\s*var\(--c-purple-500\)\s+0%,\s*#f472b6\s+100%\)\s*;\s*color:\s*white\s*;\s*border-color:\s*var\(--c-purple-500\)\s*;"/g,
  'style="background: linear-gradient(135deg, var(--c-purple-500) 0%, var(--c-pink-400) 100%); color: white; border-color: var(--c-purple-500);"'
);

// Handle remaining #6366f1 (indigo) in border-left-color
content = content.replace(/#6366f1/g, 'var(--c-purple-500)');

fs.writeFileSync(filePath, content, 'utf8');
console.log(`Intro.vue: ${count} replacement groups applied`);
