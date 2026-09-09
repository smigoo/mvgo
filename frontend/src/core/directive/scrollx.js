/**
 * 自定义指令 - 横向滚动
 * @author 朱琦
 * @date   时间：2023/4/6
 */

/**
 * 滚动触发函数
 * rate滚动的速度 数字越大滚动越慢
 */
const mouseScroll = (obj, rate = 20, callback) => {
  return function () {
    const e = window.event || document.all ? window.event : arguments[0] ? arguments[0] : event

    e.preventDefault()
    let detail // 浏览器滚动步数
    let step = 0 // 实际需要滚动的步数

    if (e.wheelDelta) {
      // google 下滑负数： -120
      detail = e.wheelDelta
    } else if (e.detail) {
      // firefox 下滑正数：3
      detail = e.detail
    }
    step = (detail > 0 ? rate * -1 : rate) * 2 // 实际需要滚动的步数
    let scrollLeft = obj.scrollLeft // 当前的滚动距离
    const maxleft = obj.scrollLeft + step // 最大滚动到的距离
    var funTop = function () {
      scrollLeft = scrollLeft + step / (rate * 0.2) // 计算每次滚动的距离
      // 临界判断，终止动画
      if (Math.abs(maxleft - scrollLeft) <= 1) {
        obj.scrollLeft = scrollLeft
        callback && callback()
        return
      }
      obj.scrollLeft = scrollLeft
      // 动画gogogo!
      // requestAnimationFrame(funTop)
    }
    funTop()
  }
}
const addv = (el, binding, vnode) => {
  const { value } = binding // 滚动的速率
  const obj = vnode.el
  try {
    obj.addEventListener('DOMMouseScroll', mouseScroll(obj, value), false)
  } catch (err) {
    obj.attachEvent('onmousewheel', mouseScroll(obj, value))
  }
  obj.onmousewheel = obj.onmousewheel = mouseScroll(obj, value)
}
export default {
  name: 'scrollx',
  mounted(el, binding, vnode) {
    addv(el, binding, vnode)
  },
  unmounted(el) {
    el.removeEventListener('DOMMouseScroll', mouseScroll)
  }
}
