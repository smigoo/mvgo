async page => {
  return await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('input')].map(i => ({
      ph: i.placeholder, val: i.value, type: i.type, cls: i.className
    }));
    const btns = [...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(Boolean);
    const tautos = [...document.querySelectorAll('textarea')].map(t => ({ ph: t.placeholder }));
    return {
      href: location.href,
      title: document.title,
      bodyLen: document.body.innerText.length,
      bodyHead: document.body.innerText.slice(0, 300),
      inputs,
      textareas: tautos,
      buttons: btns
    };
  });
}
