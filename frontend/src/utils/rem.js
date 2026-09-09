// 设置 rem 函数 PC端
function setRem() {
  const baseSize = $config.pxtorem.baseSize || 16 // 默认16px
  const basePc = baseSize / ($config.pxtorem.uiSize || 1920)
  let vW = window.innerWidth
  const vH = window.innerHeight

  // 非正常屏幕下的尺寸换算
  const dueH = (vW * ($config.pxtorem.uiHSize || 1080)) / ($config.pxtorem.uiSize || 1920)
  if (vH < dueH) {
    vW = (vH * ($config.pxtorem.uiSize || 1920)) / ($config.pxtorem.uiHSize || 1080)
  }

  const rem = vW * basePc
  try {
    const parenFontSize = getComputedStyle(window.parent.document.documentElement).fontSize;
    const parenFontSizeNumber = Number(parenFontSize.slice(0, -2));
    if (parenFontSizeNumber > rem) {
      document.documentElement.style.fontSize = parenFontSizeNumber + 'px'
    } else {
      document.documentElement.style.fontSize = rem + 'px'
    }
  } catch (error) {
    document.documentElement.style.fontSize = rem + 'px'
  }

  // 返回计算后的rem值
  return rem
}

// 修改为返回计算后的rem值
export function pxRem(baseSize = null, uiSize = null) {
  const config = $config?.pxtorem || {}
  const base = baseSize !== null ? baseSize : config.baseSize || 16
  const ui = uiSize !== null ? uiSize : config.uiSize || 1920
  const basePc = base / ui
  let vW = window.innerWidth
  const vH = window.innerHeight

  // 非正常屏幕下的尺寸换算
  const uiHSize = config.uiHSize || 1080
  const dueH = (vW * uiHSize) / ui
  if (vH < dueH) {
    vW = (vH * ui) / uiHSize
  }

  const rem = vW * basePc
  // document.documentElement.style.fontSize = rem + 'px'

  // 返回计算后的rem值，供直接使用
  return rem
}

// 改变窗口大小时重新设置 rem
window.addEventListener('resize', () => {
  if ($config?.pxtorem?.open) {
    setRem()
    pxRem()
  }
})

// 初始化
if ($config.pxtorem.open) {
  pxRem()
  setRem()
}
