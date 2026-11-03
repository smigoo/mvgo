async page => {
  // 恢复到典型小尺寸场景，便于截图
  await page.evaluate(async () => {
    const el = document.querySelector('input.form-input');
    let inst = el && el.__vueParentComponent;
    while (inst) {
      if (inst.setupState && ('frameResize' in inst.setupState)) break;
      inst = inst.parent;
    }
    const ss = inst.setupState;
    ss.figmaPreview = { imageUrl: '', nodeName: 'mock-node', width: 420, height: 147, previewToken: 'mock' };
    ss.responsiveTestMode = true;
    ss.showPreview = true;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForTimeout(400);
  const panel = await page.$('.rz-toolbar');
  if (panel) {
    await panel.scrollIntoViewIfNeeded();
    const box = await panel.boundingBox();
    // 连画布一起截
    await page.screenshot({ path: '.playwright-cli/gen-component-responsive-420x147.png' });
    return { shot: 'ok', toolbarBox: box };
  }
  return { shot: 'no-toolbar' };
}
