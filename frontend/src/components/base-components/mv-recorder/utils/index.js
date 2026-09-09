// 函数handleWithTimestamp用于将文本和时间戳结合
export function handleWithTimestamp(tmptext, tmptime) {
  if (tmptime == null || tmptime == 'undefined' || tmptext.length <= 0) {
    return tmptext
  }
  tmptext = tmptext.replace(/。|？|，|、|\?|\.|\ /g, ',') // in case there are a lot of "。"
  var words = tmptext.split(',') // split to chinese sentence or english words
  var jsontime = JSON.parse(tmptime) //JSON.parse(tmptime.replace(/\]\]\[\[/g, "],[")); // in case there are a lot segments by VAD
  var char_index = 0 // index for timestamp
  var text_withtime = ''
  for (var i = 0; i < words.length; i++) {
    if (words[i] == 'undefined' || words[i].length <= 0) {
      continue
    }
    if (/^[a-zA-Z]+$/.test(words[i])) {
      // if it is english
      text_withtime = text_withtime + jsontime[char_index][0] / 1000 + ':' + words[i] + '\n'
      char_index = char_index + 1 //for english, timestamp unit is about a word
    } else {
      // if it is chinese
      text_withtime = text_withtime + jsontime[char_index][0] / 1000 + ':' + words[i] + '\n'
      char_index = char_index + words[i].length //for chinese, timestamp unit is about a char
    }
  }
  return text_withtime
}

// 判断是否是一个函数
export function isFunction(fn) {
  return typeof fn === 'function'
}
