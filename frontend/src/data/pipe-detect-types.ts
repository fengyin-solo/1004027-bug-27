/** 管道检测领域模型：一条检测记录包含多轮检测，原始检测与复测各自独立成轮。 */

export type DetectRoundKind = '原始检测' | '复测'

export type DetectRoundStatus = '待检测' | '检测中' | '已完成'

export type DetectRound = {
  /** 轮次序号，从 1 开始 */
  round: number
  kind: DetectRoundKind
  status: DetectRoundStatus
  /** 现场检测结果：合格 / 不合格，未出结果时为空 */
  result: string
  /** 复核结论：通过 / 不通过，未复核时为空 */
  conclusion: string
  detectedAt: string
  reviewedAt: string
  device: string
  method: string
  length: string
  inspector: string
  note: string
}

export type DetectEntry = {
  id: number
  code: string
  segment: string
  method: string
  device: string
  length: string
  createdAt: string
  rounds: DetectRound[]
}

export type DetectResultInput = {
  result: string
  conclusion: string
  detectedAt: string
  reviewedAt: string
  device: string
  inspector: string
  note: string
}

export type DetectCreateInput = {
  segment: string
  method: string
  device: string
  length: string
}

export type DetectPageResult = {
  items: DetectEntry[]
  total: number
  page: number
  size: number
}
