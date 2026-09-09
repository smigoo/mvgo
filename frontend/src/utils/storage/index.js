/**********************************
 * @FilePath: index.js
 * @Author: smigoo
 * @LastEditor: smigoo
 * @LastEditTime: 2024/04/04 22:46:07
 * @Email: xsmigoo@gmail.com
 * Copyright © 2024 Microvideo
 **********************************/

import { createStorage } from './storage'

const prefixKey = 'microvideo'

export const createLocalStorage = function (option = {}) {
  return createStorage({
    prefixKey: option.prefixKey || '',
    storage: localStorage
  })
}

export const createSessionStorage = function (option = {}) {
  return createStorage({
    prefixKey: option.prefixKey || '',
    storage: sessionStorage
  })
}

export const lStorage = createLocalStorage({ prefixKey })

export const sStorage = createSessionStorage({ prefixKey })
