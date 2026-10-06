import { SEED_DETECT_ENTRIES } from '@/data/pipe-detect-seed'
import type {
  DetectCreateInput,
  DetectEntry,
  DetectPageResult,
  DetectResultInput,
  DetectRound,
  DetectRoundStatus,
} from '@/data/pipe-detect-types'

const STORAGE_KEY = 'underground-pipeline-inspection:pipe-detect'
export const PAGE_SIZE = 5

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): DetectEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return clone(SEED_DETECT_ENTRIES)
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    const fallback = clone(SEED_DETECT_ENTRIES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as DetectEntry[]
    return Array.isArray(parsed) ? parsed : clone(SEED_DETECT_ENTRIES)
  } catch {
    return clone(SEED_DETECT_ENTRIES)
  }
}

let cache: DetectEntry[] | null = null

export function allDetectEntries(): DetectEntry[] {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

function persist(entries: DetectEntry[]): void {
  cache = entries
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }
}

export type DetectFilters = {
  keyword?: string
  status?: string
  kind?: string
}

// 当前状态只看「最新一轮」：历史轮次的结论保留可查，但不覆盖当前结论。
export function currentStatus(entry: DetectEntry): string {
  const latest = entry.rounds[entry.rounds.length - 1]
  if (!latest) {
    return '待检测'
  }
  if (latest.status === '已完成') {
    return '已完成'
  }
  if (latest.kind === '复测') {
    // 复测轮占位待安排时是「需复测」，下井作业期间是「复测中」。
    return latest.status === '待检测' ? '需复测' : '复测中'
  }
  return latest.status
}

export function isPending(entry: DetectEntry): boolean {
  return currentStatus(entry) !== '已完成'
}

export function isAbnormal(entry: DetectEntry): boolean {
  // 只要还停留在原始检测不合格、等待或正在复测，就按异常待办统计。
  const status = currentStatus(entry)
  return status === '需复测' || status === '复测中'
}

export function latestRound(entry: DetectEntry): DetectRound {
  return entry.rounds[entry.rounds.length - 1]
}

export function completedRounds(entry: DetectEntry): DetectRound[] {
  return entry.rounds.filter((round) => round.status === '已完成')
}

export function roundLabel(round: DetectRound): string {
  return round.kind === '原始检测'
    ? '原始检测'
    : `第${round.round}轮复测`
}

function findEntry(entries: DetectEntry[], id: number): number {
  return entries.findIndex((entry) => entry.id === id)
}

export function getDetectEntry(id: number): DetectEntry | undefined {
  return allDetectEntries().find((entry) => entry.id === id)
}

export function listDetectEntries(
  filters: DetectFilters = {},
  page = 1,
): DetectPageResult {
  const keyword = filters.keyword?.trim() ?? ''
  const status = filters.status ?? ''
  const kind = filters.kind ?? ''
  const matched = allDetectEntries()
    .filter((entry) => {
      if (!keyword) {
        return true
      }
      const haystack = [entry.code, entry.segment, entry.method, entry.device].join(' ')
      return haystack.includes(keyword)
    })
    .filter((entry) => (status ? currentStatus(entry) === status : true))
    .filter((entry) => {
      if (!kind) {
        return true
      }
      if (kind === '原始检测') {
        return true
      }
      return entry.rounds.length > 1
    })
    .sort((a, b) => b.id - a.id)

  const size = PAGE_SIZE
  const total = matched.length
  const safePage = Math.min(Math.max(page, 1), Math.max(1, Math.ceil(total / size)))
  const start = (safePage - 1) * size
  return { items: matched.slice(start, start + size), total, page: safePage, size }
}

type Outcome = { ok: boolean; message: string }

function updateEntry(
  id: number,
  updater: (entry: DetectEntry) => Outcome,
): Outcome {
  const entries = allDetectEntries()
  const index = findEntry(entries, id)
  if (index < 0) {
    return { ok: false, message: '没有找到这条管道检测记录' }
  }
  const working = clone(entries[index])
  const outcome = updater(working)
  if (!outcome.ok) {
    return outcome
  }
  const next = [...allDetectEntries()]
  next[index] = working
  persist(next)
  return outcome
}

function setRoundStatus(
  entry: DetectEntry,
  round: number,
  status: DetectRoundStatus,
): Outcome {
  const target = entry.rounds.find((item) => item.round === round)
  if (!target) {
    return { ok: false, message: `没有找到第${round}轮检测` }
  }
  if (status !== '检测中' && target.status === status) {
    return { ok: false, message: `第${round}轮已经是「${status}」，不用重复操作` }
  }
  target.status = status
  return { ok: true, message: '' }
}

export function scheduleDetect(id: number, round: number): Outcome {
  return updateEntry(id, (entry) => {
    const target = entry.rounds.find((item) => item.round === round)
    if (!target) {
      return { ok: false, message: `没有找到第${round}轮检测` }
    }
    if (target.status === '已完成') {
      return { ok: false, message: `第${round}轮检测已完成，不能重复安排` }
    }
    if (target.status === '检测中') {
      // 重复提交只保留同一轮，不新增展示记录。
      return { ok: false, message: '该轮检测已在检测中，无需重复安排' }
    }
    target.status = '检测中'
    return { ok: true, message: `已安排${roundLabel(target)}，当前状态「检测中」` }
  })
}

export function recordDetectResult(
  id: number,
  round: number,
  input: DetectResultInput,
): Outcome {
  if (!input.result) {
    return { ok: false, message: '请选择本轮检测结果（合格 / 不合格）' }
  }
  if (!input.conclusion) {
    return { ok: false, message: '请选择复核结论（通过 / 不通过）' }
  }
  if (!input.detectedAt || !input.reviewedAt) {
    return { ok: false, message: '请填写检测日期与复核日期' }
  }
  return updateEntry(id, (entry) => {
    const target = entry.rounds.find((item) => item.round === round)
    if (!target) {
      return { ok: false, message: `没有找到第${round}轮检测` }
    }
    if (target.status === '已完成') {
      // 幂等：已完成的轮次重复提交不会再生成一轮展示记录。
      return { ok: false, message: `${roundLabel(target)}已出结果，重复提交不会重复建档` }
    }
    target.status = '已完成'
    target.result = input.result
    target.conclusion = input.conclusion
    target.detectedAt = input.detectedAt
    target.reviewedAt = input.reviewedAt
    target.device = input.device || target.device || entry.device
    target.inspector = input.inspector
    target.note = input.note
    return {
      ok: true,
      message: `${roundLabel(target)}结果已记录，当前结论以最新复核为准`,
    }
  })
}

export function requestRetest(id: number, note: string): Outcome {
  return updateEntry(id, (entry) => {
    const latest = latestRound(entry)
    if (latest.kind === '复测') {
      // 复测轮已存在（待检测 / 检测中 / 已完成）时重复提交，只保留一轮复测记录。
      if (latest.status === '已完成') {
        return { ok: false, message: '最新一轮复测已完成，如需再次复测请走专项流程' }
      }
      return { ok: false, message: '复测轮已建立，重复标记不会重复建档' }
    }
    if (latest.status !== '已完成') {
      return { ok: false, message: '原始检测尚未完成，暂时不能标记复测' }
    }
    if (latest.result !== '不合格') {
      return { ok: false, message: '原始检测合格，无需发起复测' }
    }
    const nextRound: DetectRound = {
      round: entry.rounds.length + 1,
      kind: '复测',
      status: '待检测',
      result: '',
      conclusion: '',
      detectedAt: '',
      reviewedAt: '',
      device: '',
      method: entry.method,
      length: entry.length,
      inspector: '',
      note: note || '原始检测不合格，等待复测安排。',
    }
    entry.rounds.push(nextRound)
    return { ok: true, message: `已标记需复测，${roundLabel(nextRound)}占位待检测` }
  })
}

export function createDetectEntry(input: DetectCreateInput): Outcome {
  if (!input.segment.trim()) {
    return { ok: false, message: '请填写检测管段' }
  }
  const entries = allDetectEntries()
  const nextId = entries.reduce((max, entry) => Math.max(max, entry.id), 0) + 1
  const now = new Date()
  const createdAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
  const entry: DetectEntry = {
    id: nextId,
    code: `PDC-2026-${String(nextId).padStart(4, '0')}`,
    segment: input.segment.trim(),
    method: input.method.trim() || 'CCTV 检测',
    device: input.device.trim(),
    length: input.length.trim(),
    createdAt,
    rounds: [
      {
        round: 1,
        kind: '原始检测',
        status: '待检测',
        result: '',
        conclusion: '',
        detectedAt: '',
        reviewedAt: '',
        device: input.device.trim(),
        method: input.method.trim() || 'CCTV 检测',
        length: input.length.trim(),
        inspector: '',
        note: '新登记检测记录，等待安排。',
      },
    ],
  }
  persist([...entries, entry])
  return { ok: true, message: `检测记录 ${entry.code} 已登记` }
}

export function resetDetectEntries(): DetectEntry[] {
  const fallback = clone(SEED_DETECT_ENTRIES)
  persist(fallback)
  return fallback
}

export function exportDetectCsv(): { filename: string; content: string } {
  const header = [
    '检测编号',
    '检测管段',
    '检测方式',
    '轮次',
    '轮次类型',
    '轮次状态',
    '检测结果',
    '复核结论',
    '检测日期',
    '复核日期',
    '检测设备',
    '检测人员',
  ]
  const lines = [header.join(',')]
  for (const entry of allDetectEntries()) {
    for (const round of entry.rounds) {
      lines.push(
        [
          entry.code,
          entry.segment,
          round.method,
          round.round,
          round.kind,
          round.status,
          round.result,
          round.conclusion,
          round.detectedAt,
          round.reviewedAt,
          round.device,
          round.inspector,
        ]
          .map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`)
          .join(','),
      )
    }
  }
  return { filename: '管道检测-轮次清单.csv', content: `﻿${lines.join('\n')}` }
}

export function detectStats(): { label: string; value: number }[] {
  const entries = allDetectEntries()
  return [
    { label: '待检测管段', value: entries.filter((entry) => currentStatus(entry) === '待检测').length },
    { label: '检测中管段', value: entries.filter((entry) => currentStatus(entry) === '检测中').length },
    { label: '需复测管段', value: entries.filter((entry) => isAbnormal(entry)).length },
    { label: '已完成管段', value: entries.filter((entry) => currentStatus(entry) === '已完成').length },
  ]
}
