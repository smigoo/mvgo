const parseTreeData = (treeNode, returnTreeData) => {
  const treeElement = parseTreeNode(treeNode)
  if (treeNode.elementType === 0) {
    returnTreeData = treeElement
  } else {
    returnTreeData.compose.push(treeElement)
  }
  treeNode.children.map((item) => {
    parseTreeData(item, treeElement)
  })
}

const getRootTreeNode = (treeNode) => {
  const parameters =
    treeNode.elementParameters != null ? JSON.parse(treeNode.elementParameters) : {}

  return {
    id: treeNode.id,
    customerClassName: treeNode.elementTitle,
    theme: parameters.theme ? parameters.theme : 'dark',
    runtimeParameters: '',
    layout: {
      id: treeNode.elementId,
      customerClassName: '',
      customerStyle: {
        padding: parameters?.paddingValue + 'px',
        backgroundColor: parameters?.backgroundColorValue
      },
      interval: parameters.paddingValue ? Number(parameters.paddingValue) : 0,
      layoutType: 0,
      pageConfig: JSON.parse(treeNode?.elementParameters),
      compose: []
    },
    interactiveRouting: []
  }
}
let number = 1,
  pageId = { value: undefined }

const defaultSize = [
  {
    name: '上',
    selectValue: 'num',
    inputValue: '',
    selectLayoutValue: ''
  },
  {
    name: '下',
    selectValue: 'num',
    inputValue: '',
    selectLayoutValue: ''
  },
  {
    name: '左',
    selectValue: 'num',
    inputValue: '',
    selectLayoutValue: ''
  },
  {
    name: '右',
    selectValue: 'num',
    inputValue: '',
    selectLayoutValue: ''
  }
]

const filterPostion = (size, index) => {
  if (size[index]?.selectValue === 'num' && size[index]?.inputValue != '') {
    return size[index]?.inputValue + 'px'
  } else if (size[index]?.selectValue === 'relative' && size[index]?.selectLayoutValue != '') {
    return '#' + size[index]?.selectLayoutValue
  } else if (size[index]?.selectValue === '%' && size[index]?.inputValue != '') {
    return size[index]?.inputValue + '%'
  } else if (size[index]?.selectValue === 'rem' && size[index]?.inputValue != '') {
    return size[index]?.inputValue + 'rem'
  } else {
    return ''
  }
}
const parseTreeNode = (item) => {
  const elementParameters = JSON.parse(item.elementParameters || '{}')
  if (item.elementType == '1' || item.elementType == '6') {
    const size = elementParameters?.size || defaultSize
    let obj = {
      ...elementParameters,
      id: item.id,
      zIndex: number++,
      containerId: pageId.value,
      customerClassName: '',
      customerStyle: {},
      position: {
        top: filterPostion(size, 0),
        bottom: filterPostion(size, 1),
        left: filterPostion(size, 2),
        right: filterPostion(size, 3)
      },
      layoutDirection: elementParameters?.adaptiveDirection,
      layoutType: elementParameters?.layoutType,
      componetIdSerialNumber: elementParameters?.componetIdSerialNumber,
      ratio: elementParameters?.ratio || [0, 0],
      size: {
        width: elementParameters?.width,
        height: elementParameters?.height
      },
      grid: Number(elementParameters.grid),
      parentId: item.elementParentId,
      compose: [],
      elementType: item.elementType,
      type: (item.elementType == 6 && 'children-block') || '',
      interval: Number(elementParameters.interval)
    }
    return obj
  } else if (item.elementType == '2') {
    let obj2 = {
      ...elementParameters,
      containerId: pageId.value,
      layoutId: item.elementParentId,
      startStatus: item.startStatus || 0,
      type: elementParameters?.type,
      componentId: item.elementId,
      componentSerialNumber: item.elementSerial,
      grid: Number(elementParameters?.span),
      parentId: item.elementParentId,
      elementType: item.elementType,
      componentName: item.elementTitle,
      size: {
        width: elementParameters?.width,
        height: elementParameters?.height
      },
      isMapWindowInfo: elementParameters?.isMapWindowInfo,
      compose: [],
      id: item.id
    }
    return obj2
  } else if (item.elementType == '3') {
    let obj3 = {
      ...elementParameters,
      id: item.id,
      grid: Number(elementParameters?.span),
      parentId: item.elementParentId,
      startStatus: item.startStatus || 0,
      type: elementParameters?.type,
      componentId: item.elementId,
      componentSerialNumber: item.elementSerial,
      layoutId: item.elementParentId,
      containerId: pageId.value,
      compose: [],
      elementType: item.elementType,
      componentName: item.elementTitle,
      center: elementParameters?.center,
      area: elementParameters?.area
    }
    return obj3
  } else if (item.elementType == '4') {
    const size = elementParameters?.size
    const position = size
      ? {
        top: size[0].inputValue,
        bottom: size[1].inputValue,
        left: size[2].inputValue,
        right: size[3].inputValue
      }
      : {
        top: 0,
        bottom: 0,
        left: 0,
        right: 0
      }
    let obj3 = {
      ...elementParameters,
      id: item.id,
      position: position,
      layoutDirection: elementParameters?.layoutDirection,
      legendSize: Number(elementParameters?.legendSize),
      legendCount: Number(elementParameters?.legendCount),
      legendInterval: Number(elementParameters?.legendInterval),
      parentId: item.elementParentId,
      compose: [],
      type: 'map-layout',
      elementType: item.elementType,
      layoutId: item.layoutId,
      containerId: pageId.value
    }
    return obj3
  } else if (item.elementType == '5') {
    return item
  }
}

const getPageStruct = (rootNode, lineData) => {
  number = 1
  let returnTreeData = getRootTreeNode(rootNode)
  pageId.value = returnTreeData.id
  rootNode.children.map((item) => {
    parseTreeData(item, returnTreeData.layout)
  })
  returnTreeData.interactiveRouting = lineData
  return returnTreeData
}

/**
 * const pageStruct = getPageStruct(testData.data.pageElement)
 * */
export default getPageStruct
