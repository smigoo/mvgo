import scrollx from './scrollx'
import permission from './permission'
import drag from './drag'
/**
 * 自定义指令 注册使用
 * @author 朱琦
 * @date   时间：2022/4/6
 */

const directives = [scrollx, permission, drag]
export default {
  install: (app) => {
    directives.forEach((directive) => {
      app.directive(directive.name, directive)
    })
  }
}
