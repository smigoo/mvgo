async page => {
  function runCase(w, h) {
    return { w, h };
  }
  const cases = [runCase(0, 0), runCase(80, 60), runCase(966, 1206)];

  const out = [];
  for (const c of cases) {
    const r = await page.evaluate(async (cc) => {
      const el = document.querySelector('input.form-input');
      let inst = el && el.__vueParentComponent;
      while (inst) {
        if (inst.setupState && ('frameResize' in inst.setupState)) break;
        inst = inst.parent;
      }
      const ss = inst.setupState;
      ss.figmaPreview = (cc.w > 0 && cc.h > 0)
        ? { imageUrl: '', nodeName: 'mock-node', width: cc.w, height: cc.h, previewToken: 'mock' }
        : null;
      ss.responsiveTestMode = true;
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const size = document.querySelector('.rz-toolbar .rz-size');
      const canvas = document.querySelector('.rz-canvas');
      const rect = canvas ? canvas.getBoundingClientRect() : null;
      return {
        injected: cc.w > 0 ? `${cc.w}x${cc.h}` : 'null',
        sizeLabel: size ? size.textContent.trim() : null,
        canvasRect: rect ? `${Math.round(rect.width)}x${Math.round(rect.height)}` : null
      };
    }, c);
    out.push(r);
  }
  return out;
}
