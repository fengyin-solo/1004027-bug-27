import { listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  DetectResultInput,
  DetectRound,
  PageResult,
  PipeDetectEntry,
} from '@/data/types'

// 管道检测专用服务：一条检测记录下挂多轮（原始检测 + 历次复测）。
// 当前结论只采用最新一轮，历史轮次原样保留；复测未完成时最新轮是待检测占位。
const MODULE_KEY = 'pipe_detect'
export const PAGE_SIZE = 5

export type DetectStatus = '待检测' | '检测中' | '已完成' | '需复测'

type DetectFilters = {
  检测编号?: string
  检测管段?: string
  检测方式?: string
}

function today(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function latestRound(entry: PipeDetectEntry): DetectRound {
  return entry.rounds[entry.rounds.length - 1]
}

export function roundLabel(round: DetectRound): string {
  return round.kind === 'original' ? '原始检测' : `第 ${round.roundNo} 轮（第 ${round.roundNo - 1} 次复测）`
}

/** 记录状态由最新一轮推导：最新轮待检测时整条仍是待检测，不被历史结果顶替。 */
export function entryStatus(entry: PipeDetectEntry): DetectStatus {
  const latest = latestRound(entry)
  if (latest.status === '待检测') {
    return latest.kind === 'retest' ? '需复测' : '待检测'
  }
  if (latest.status === '检测中') {
    return '检测中'
  }
  return latest.verdict === '不合格' ? '需复测' : '已完成'
}

/** 当前结论：只采用最新复核；最新轮未完成时显示待检测占位。 */
export function currentConclusion(entry: PipeDetectEntry): string {
  const latest = latestRound(entry)
  if (latest.status !== '已完成') {
    return '待检测'
  }
  return latest.verdict
}

export function historySummary(entry: PipeDetectEntry): string {
  const done = entry.rounds.filter((round) => round.status === '已完成')
  if (done.length === 0) {
    return '暂无已完成轮次'
  }
  const tail = done.slice(-3).map((round) => {
    const tag = round.kind === 'original' ? '原始' : `复测${round.roundNo - 1}`
    return `${tag}·${round.verdict}`
  })
  const prefix = done.length > tail.length ? '…' : ''
  return `已完成 ${done.length} 轮：${prefix}${tail.join(' / ')}`
}

function syncFlags(entry: PipeDetectEntry): PipeDetectEntry {
  const status = entryStatus(entry)
  entry.status = status
  entry.pending = status !== '已完成'
  // 异常只跟随最新复核：复测合格后历史不合格不再标异常。
  entry.abnormal = status === '需复测'
  return entry
}

/** 兼容旧版扁平数据：没有 rounds 字段时，把原行上的字段收拢成第 1 轮。 */
function normalize(raw: PipeDetectEntry): PipeDetectEntry {
  if (Array.isArray(raw.rounds) && raw.rounds.length > 0) {
    return syncFlags(raw)
  }
  const method = String(raw.检测方式 ?? '')
  const device = String(raw.检测设备 ?? '')
  const first: DetectRound = {
    roundNo: 1,
    kind: 'original',
    status: '待检测',
    planDate: String(raw.检测日期 ?? today()),
    inspectDate: '',
    method,
    device,
    length: String(raw.检测长度 ?? ''),
    verdict: '',
    inspector: '',
    defects: '',
  }
  const oldStatus = String(raw.status ?? '')
  if (oldStatus === '检测中') {
    first.status = '检测中'
  } else if (oldStatus === '已完成' || oldStatus === '需复测') {
    first.status = '已完成'
    first.inspectDate = String(raw.检测日期 ?? today())
    // 旧扁平数据没有结论字段：需复测即上一轮结果不合格。
    first.verdict = oldStatus === '需复测' ? '不合格' : '合格'
    first.defects = String(raw.检测结果 ?? '')
  }
  return syncFlags({ ...raw, rounds: [first] })
}

function allEntries(): { entries: PipeDetectEntry[]; migrated: boolean } {
  const rows = listRows(MODULE_KEY) as PipeDetectEntry[]
  let migrated = false
  const entries = rows.map((row) => {
    const normalized = normalize(row)
    if (!Array.isArray(row.rounds)) {
      migrated = true
    }
    return normalized
  })
  if (migrated) {
    saveRows(MODULE_KEY, entries)
  }
  return { entries, migrated }
}

function applyFilters(entries: PipeDetectEntry[], filters: DetectFilters): PipeDetectEntry[] {
  const pairs = Object.entries(filters).filter(([, value]) => value && value.trim() !== '')
  if (pairs.length === 0) {
    return entries
  }
  return entries.filter((entry) =>
    pairs.every(([field, value]) => String(entry[field] ?? '').includes(value.trim())),
  )
}

export function listDetectEntries(
  filters: DetectFilters = {},
  page = 1,
  size = PAGE_SIZE,
): PageResult<PipeDetectEntry> {
  const matched = applyFilters(allEntries().entries, filters)
  const safePage = Math.min(Math.max(1, page), Math.max(1, Math.ceil(matched.length / size)))
  const start = (safePage - 1) * size
  return {
    items: matched.slice(start, start + size),
    total: matched.length,
    page: safePage,
    size,
  }
}

/** 状态汇总用：返回过滤后的全部记录，不受分页影响。 */
export function allFilteredDetectEntries(filters: DetectFilters = {}): PipeDetectEntry[] {
  return applyFilters(allEntries().entries, filters)
}

export function getDetectEntry(id: number): PipeDetectEntry | undefined {
  return allEntries().entries.find((entry) => Number(entry.id) === id)
}

export type DetectStats = { label: string; value: number }[]

export function detectStats(): DetectStats {
  const entries = allEntries().entries
  const count = (status: DetectStatus) =>
    entries.filter((entry) => entryStatus(entry) === status).length
  return [
    { label: '待检测管段', value: count('待检测') },
    { label: '检测中管段', value: count('检测中') },
    { label: '已完成管段', value: count('已完成') },
    { label: '需复测管段', value: count('需复测') },
  ]
}

function mutateEntry(id: number, mutate: (entry: PipeDetectEntry) => ActionResult): ActionResult {
  const rows = listRows(MODULE_KEY) as PipeDetectEntry[]
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的检测记录` }
  }
  const result = mutate(rows[index])
  if (!result.ok) {
    return result
  }
  rows[index] = syncFlags(rows[index])
  saveRows(MODULE_KEY, rows)
  return result
}

/** 安排检测/安排复测：最新轮已在检测中或已完成时拒绝，重复提交不会多生成一轮。 */
export function arrangeDetect(id: number): ActionResult {
  return mutateEntry(id, (entry) => {
    const latest = latestRound(entry)
    if (latest.status === '检测中') {
      return { ok: false, message: `第 ${latest.roundNo} 轮已在检测中，无需重复安排` }
    }
    if (latest.status === '已完成') {
      if (latest.verdict === '不合格') {
        return { ok: false, message: '本轮结果为不合格，请先标记复测，再安排复测' }
      }
      return { ok: false, message: '最新一轮已完成且合格，无需再次安排' }
    }
    latest.status = '检测中'
    const action = latest.kind === 'retest' ? '复测' : '检测'
    return { ok: true, message: `第 ${latest.roundNo} 轮${action}已安排，当前状态「检测中」` }
  })
}

/** 记录结果：把最新的进行中/待安排轮次写实；已完成轮次重复提交直接拒绝，不新增轮次。 */
export function recordDetectResult(id: number, input: DetectResultInput): ActionResult {
  if (!input.inspectDate || !input.verdict) {
    return { ok: false, message: '请填写检测日期并选择检测结论' }
  }
  return mutateEntry(id, (entry) => {
    const latest = latestRound(entry)
    if (latest.status === '已完成') {
      // 重复提交只认已有那一轮，不另起一轮展示记录。
      return { ok: false, message: `第 ${latest.roundNo} 轮结果已记录，请勿重复提交` }
    }
    latest.status = '已完成'
    latest.inspectDate = input.inspectDate
    latest.method = input.method || latest.method
    latest.device = input.device || latest.device
    latest.length = input.length || latest.length
    latest.verdict = input.verdict
    latest.inspector = input.inspector
    latest.defects = input.defects
    return {
      ok: true,
      message: `第 ${latest.roundNo} 轮结果已记录，当前结论「${input.verdict}」`,
    }
  })
}

/** 标记复测：最新一轮必须是不合格结论；已有待完成复测轮时拒绝，复测轮只追加一次。 */
export function markRetest(id: number, planDate: string): ActionResult {
  if (!planDate) {
    return { ok: false, message: '请填写计划复测日期' }
  }
  return mutateEntry(id, (entry) => {
    const latest = latestRound(entry)
    if (latest.status !== '已完成') {
      return { ok: false, message: '最新一轮检测尚未完成，不能标记复测' }
    }
    if (latest.verdict !== '不合格') {
      return { ok: false, message: '最新结论为合格，不需要复测' }
    }
    // 追加前再查一次：同一不合格结论只能挂一轮复测。
    entry.rounds.push({
      roundNo: latest.roundNo + 1,
      kind: 'retest',
      status: '待检测',
      planDate,
      inspectDate: '',
      method: latest.method,
      device: latest.device,
      length: latest.length,
      verdict: '',
      inspector: '',
      defects: '',
    })
    return { ok: true, message: `已生成第 ${latest.roundNo + 1} 轮复测待检测占位` }
  })
}

export function createDetectEntry(input: {
  检测编号: string
  检测管段: string
  检测方式: string
  检测设备: string
  planDate: string
}): ActionResult {
  if (!input.检测编号.trim() || !input.检测管段.trim()) {
    return { ok: false, message: '请填写检测编号与检测管段' }
  }
  const { entries } = allEntries()
  if (entries.some((entry) => entry.检测编号 === input.检测编号.trim())) {
    return { ok: false, message: `检测编号 ${input.检测编号.trim()} 已存在` }
  }
  const nextId = entries.reduce((max, entry) => Math.max(max, Number(entry.id) || 0), 0) + 1
  const round: DetectRound = {
    roundNo: 1,
    kind: 'original',
    status: '待检测',
    planDate: input.planDate || today(),
    inspectDate: '',
    method: input.检测方式,
    device: input.检测设备,
    length: '',
    verdict: '',
    inspector: '',
    defects: '',
  }
  const entry: PipeDetectEntry = syncFlags({
    id: nextId,
    status: '待检测',
    pending: true,
    abnormal: false,
    检测编号: input.检测编号.trim(),
    检测管段: input.检测管段.trim(),
    检测方式: input.检测方式,
    检测设备: input.检测设备,
    rounds: [round],
  })
  saveRows(MODULE_KEY, [...(listRows(MODULE_KEY) as PipeDetectEntry[]), entry])
  return { ok: true, message: `检测记录 ${entry.检测编号} 已登记` }
}

export function resetDetectEntries(): void {
  resetRows(MODULE_KEY)
  // 重置后统一过一遍状态推导，保证示例数据的状态标记与轮次一致。
  const seeded = (listRows(MODULE_KEY) as PipeDetectEntry[]).map(syncFlags)
  saveRows(MODULE_KEY, seeded)
}

function csvCell(value: string | number): string {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function exportDetectCsv(): { filename: string; content: string } {
  const header = [
    '检测编号',
    '检测管段',
    '轮次',
    '轮次类型',
    '轮次状态',
    '计划日期',
    '检测日期',
    '检测方式',
    '检测设备',
    '检测长度',
    '检测结论',
    '检测人员',
    '缺陷描述',
    '当前采用',
  ]
  const lines = [header.join(',')]
  for (const entry of allEntries().entries) {
    const latestIndex = entry.rounds.length - 1
    entry.rounds.forEach((round, index) => {
      lines.push(
        [
          entry.检测编号,
          entry.检测管段,
          round.roundNo,
          round.kind === 'original' ? '原始检测' : `复测${round.roundNo - 1}`,
          round.status,
          round.planDate,
          round.inspectDate,
          round.method,
          round.device,
          round.length,
          round.verdict,
          round.inspector,
          round.defects,
          index === latestIndex ? '是' : '历史',
        ]
          .map(csvCell)
          .join(','),
      )
    })
  }
  return { filename: '管道检测-轮次报告.csv', content: `\uFEFF${lines.join('\n')}` }
}

export function downloadDetectCsv(): void {
  const { filename, content } = exportDetectCsv()
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
