/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean | DetectRound[]
}

/** 管道检测：一轮检测（原始检测或复测）的结果。未完成轮次只保留待检测占位，不写结论。 */
export type DetectVerdict = '合格' | '不合格'

export type DetectRound = {
  roundNo: number
  kind: 'original' | 'retest'
  status: '待检测' | '检测中' | '已完成'
  planDate: string
  inspectDate: string
  method: string
  device: string
  length: string
  verdict: '' | DetectVerdict
  inspector: string
  defects: string
}

export type DetectResultInput = {
  inspectDate: string
  method: string
  device: string
  length: string
  verdict: DetectVerdict
  inspector: string
  defects: string
}

/** 管道检测记录：一条管段对应多轮检测，当前结论只取最新一轮，历史轮次原样保留。 */
export type PipeDetectEntry = EntryRow & {
  检测编号: string
  检测管段: string
  检测方式: string
  检测设备: string
  rounds: DetectRound[]
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult<T = EntryRow> = {
  items: T[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
