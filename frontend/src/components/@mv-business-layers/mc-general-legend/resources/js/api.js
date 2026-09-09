import { createRequest } from 'microvideo-request'

export default {
  /**
   * 查询单条数据
   */
  getSbdsCommonDataList(params) {
    return createRequest('BASE_SERVER').setParameters(params).post(`/sbds/common`)
  }
}
