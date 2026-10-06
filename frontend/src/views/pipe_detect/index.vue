<template>
  <section class="page" data-module="pipe_detect">
    <header class="page-head">
      <div>
        <h2>管道检测管理</h2>
        <p class="page-desc">同一管段的原始检测与历次复测按轮次归档；列表展示当前结论与历史轮次，报告视图按轮次呈现独立卡片。</p>
      </div>
      <div class="page-actions">
        <button v-if="view === 'list'" class="btn primary" type="button" @click="openCreate">登记检测记录</button>
        <button v-if="view === 'list'" class="btn" type="button" @click="exportRows">导出轮次报告</button>
        <button v-if="view === 'report'" class="btn" type="button" @click="backToList">返回列表</button>
      </div>
    </header>

    <!-- 列表视图 -->
    <template v-if="view === 'list'">
      <div class="stat-row">
        <article v-for="item in stats" :key="item.label" class="stat-card">
          <span class="stat-label">{{ item.label }}</span>
          <strong class="stat-value">{{ item.value }}</strong>
        </article>
      </div>

      <p class="status-legend">
        <span v-for="item in statusSummary" :key="item.status" class="legend-item">
          {{ item.status }}：{{ item.count }}
        </span>
      </p>

      <form class="filter-bar" @submit.prevent="reload(1)">
        <label class="filter-item">
          <span>检测编号</span>
          <input v-model="filters.检测编号" placeholder="按检测编号检索" />
        </label>
        <label class="filter-item">
          <span>检测管段</span>
          <input v-model="filters.检测管段" placeholder="按检测管段检索" />
        </label>
        <label class="filter-item">
          <span>检测方式</span>
          <input v-model="filters.检测方式" placeholder="按检测方式检索" />
        </label>
        <button class="btn" type="submit">查询</button>
        <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>检测编号</th>
            <th>检测管段</th>
            <th>检测方式</th>
            <th>历史轮次</th>
            <th>当前结论</th>
            <th>最近检测日期</th>
            <th>当前状态</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="String(row.id)">
            <td>{{ row.检测编号 }}</td>
            <td>{{ row.检测管段 }}</td>
            <td>{{ row.检测方式 }}</td>
            <td class="history-cell">{{ historySummary(row) }}</td>
            <td>
              <span :class="['conclusion-tag', conclusionClass(row)]">{{ currentConclusion(row) }}</span>
            </td>
            <td>{{ latestDate(row) || '—' }}</td>
            <td>{{ row.status }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="openReport(row)">查看报告</button>
              <template v-for="action in availableActions(row)" :key="action">
                <button v-if="action === '安排检测' || action === '安排复测'" class="link" type="button" @click="runArrange(row)">
                  {{ action }}
                </button>
                <button v-else-if="action === '记录结果'" class="link" type="button" @click="openResult(row)">
                  记录结果
                </button>
                <button v-else class="link" type="button" @click="openRetest(row)">
                  标记复测
                </button>
              </template>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td colspan="8" class="empty-state">暂无符合条件的管道检测数据，可先登记检测记录</td>
          </tr>
        </tbody>
      </table>

      <footer class="page-foot">
        <span>共 {{ total }} 条管道检测记录，第 {{ page }} / {{ totalPages }} 页</span>
        <span class="pager">
          <button class="btn" type="button" :disabled="page <= 1" @click="reload(page - 1)">上一页</button>
          <button class="btn" type="button" :disabled="page >= totalPages" @click="reload(page + 1)">下一页</button>
        </span>
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      </footer>
    </template>

    <!-- 报告视图：每轮检测结果一张独立卡片，按轮次顺序排列 -->
    <template v-else-if="activeEntry">
      <header class="report-head">
        <div>
          <h3>{{ activeEntry.检测编号 }} · {{ activeEntry.检测管段 }}</h3>
          <p class="page-desc">
            共 {{ activeEntry.rounds.length }} 轮记录，当前状态「{{ activeEntry.status }}」；
            当前只采用最新一轮复核结论，历史检测结果保留留档、不覆盖。
          </p>
        </div>
        <div class="report-banner">
          <span class="report-banner-label">当前结论</span>
          <strong :class="['conclusion-tag', conclusionClass(activeEntry)]">{{ currentConclusion(activeEntry) }}</strong>
        </div>
      </header>

      <nav class="round-tabs">
        <button
          v-for="tab in reportTabs"
          :key="tab.key"
          type="button"
          :class="['round-tab', { active: roundTab === tab.key }]"
          @click="roundTab = tab.key"
        >
          {{ tab.label }}（{{ tab.count }}）
        </button>
      </nav>

      <div v-if="visibleRounds.length" class="round-grid">
        <article
          v-for="(round, index) in visibleRounds"
          :key="round.roundNo"
          :class="['round-card', { pending: round.status !== '已完成', latest: isLatestRound(round) }]"
        >
          <header class="round-card-head">
            <div>
              <span class="round-seq">第 {{ round.roundNo }} 轮</span>
              <span class="round-kind">{{ round.kind === 'original' ? '原始检测' : '复测记录' }}</span>
              <span v-if="isLatestRound(round)" class="adopt-tag">当前采用</span>
            </div>
            <span :class="['round-status', round.status]">{{ round.status }}</span>
          </header>
          <dl class="round-detail">
            <div><dt>计划日期</dt><dd>{{ round.planDate || '—' }}</dd></div>
            <div><dt>检测日期</dt><dd>{{ round.inspectDate || '—' }}</dd></div>
            <div><dt>检测方式</dt><dd>{{ round.method || '—' }}</dd></div>
            <div><dt>检测设备</dt><dd>{{ round.device || '—' }}</dd></div>
            <div><dt>检测长度</dt><dd>{{ round.length || '—' }}</dd></div>
            <div><dt>检测人员</dt><dd>{{ round.inspector || '—' }}</dd></div>
          </dl>
          <div v-if="round.status === '已完成'" class="round-result">
            <div class="result-line">
              <span class="result-label">检测结论</span>
              <span :class="['verdict', round.verdict]">{{ round.verdict }}</span>
            </div>
            <p class="defect-line">缺陷描述：{{ round.defects || '无' }}</p>
          </div>
          <p v-else class="round-placeholder">
            {{ round.kind === 'retest' ? '复测' : '检测' }}尚未完成，此轮为「待检测」占位，
            完成前不排列已完成结果作为当前结论。
          </p>
          <!-- 排序提示仅用于确认轮次先后 -->
          <p class="round-order">排列顺序 {{ index + 1 }} / {{ visibleRounds.length }}</p>
        </article>
      </div>
      <p v-else class="empty-state report-empty">该分组下暂无检测轮次</p>

      <footer class="page-foot">
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      </footer>
    </template>
  </section>

  <!-- 登记检测记录 -->
  <div v-if="createOpen" class="modal-mask" @click.self="createOpen = false">
    <form class="modal" @submit.prevent="submitCreate">
      <h3>登记检测记录</h3>
      <label class="modal-item">
        <span>检测编号 *</span>
        <input v-model="createForm.检测编号" placeholder="如 PIPE-0009" />
      </label>
      <label class="modal-item">
        <span>检测管段 *</span>
        <input v-model="createForm.检测管段" placeholder="如 滨河路W18-W24" />
      </label>
      <label class="modal-item">
        <span>检测方式</span>
        <input v-model="createForm.检测方式" placeholder="如 CCTV检测" />
      </label>
      <label class="modal-item">
        <span>检测设备</span>
        <input v-model="createForm.检测设备" placeholder="如 爬行机器人R-07" />
      </label>
      <label class="modal-item">
        <span>计划检测日期</span>
        <input v-model="createForm.planDate" type="date" />
      </label>
      <p v-if="modalError" class="error-text">{{ modalError }}</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" @click="createOpen = false">取消</button>
        <button class="btn primary" type="submit">提交登记</button>
      </div>
    </form>
  </div>

  <!-- 记录检测结果 -->
  <div v-if="resultOpen" class="modal-mask" @click.self="resultOpen = false">
    <form class="modal" @submit.prevent="submitResult">
      <h3>记录结果 · {{ resultTargetLabel }}</h3>
      <p class="modal-tip">结果只写入当前待完成的这一轮，重复提交不会新增轮次。</p>
      <label class="modal-item">
        <span>检测日期 *</span>
        <input v-model="resultForm.inspectDate" type="date" />
      </label>
      <div class="modal-grid">
        <label class="modal-item">
          <span>检测方式</span>
          <input v-model="resultForm.method" />
        </label>
        <label class="modal-item">
          <span>检测设备</span>
          <input v-model="resultForm.device" />
        </label>
        <label class="modal-item">
          <span>检测长度</span>
          <input v-model="resultForm.length" placeholder="如 260m" />
        </label>
        <label class="modal-item">
          <span>检测人员</span>
          <input v-model="resultForm.inspector" />
        </label>
      </div>
      <label class="modal-item">
        <span>检测结论 *</span>
        <select v-model="resultForm.verdict">
          <option value="">请选择结论</option>
          <option value="合格">合格</option>
          <option value="不合格">不合格</option>
        </select>
      </label>
      <label class="modal-item">
        <span>缺陷描述</span>
        <textarea v-model="resultForm.defects" rows="3" placeholder="合格可填“未见明显缺陷”"></textarea>
      </label>
      <p v-if="modalError" class="error-text">{{ modalError }}</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" @click="resultOpen = false">取消</button>
        <button class="btn primary" type="submit">提交结果</button>
      </div>
    </form>
  </div>

  <!-- 标记复测 -->
  <div v-if="retestOpen" class="modal-mask" @click.self="retestOpen = false">
    <form class="modal" @submit.prevent="submitRetest">
      <h3>标记复测 · {{ retestTargetLabel }}</h3>
      <p class="modal-tip">确认后追加一轮「待检测」复测占位，最新结论切换为待检测。</p>
      <label class="modal-item">
        <span>计划复测日期 *</span>
        <input v-model="retestPlanDate" type="date" />
      </label>
      <p v-if="modalError" class="error-text">{{ modalError }}</p>
      <div class="modal-actions">
        <button class="btn ghost" type="button" @click="retestOpen = false">取消</button>
        <button class="btn primary" type="submit">确认标记复测</button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  PAGE_SIZE,
  allFilteredDetectEntries,
  arrangeDetect,
  createDetectEntry,
  currentConclusion,
  detectStats,
  downloadDetectCsv,
  entryStatus,
  getDetectEntry,
  historySummary,
  listDetectEntries,
  markRetest,
  recordDetectResult,
  roundLabel,
} from '@/api/pipe-detect-service'
import type { DetectResultInput, DetectRound, PipeDetectEntry } from '@/data/types'

type ViewMode = 'list' | 'report'
type RoundTab = 'all' | 'original' | 'retest'

const view = ref<ViewMode>('list')
const rows = ref<PipeDetectEntry[]>([])
const total = ref(0)
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)))
const errorMessage = ref('')
const stats = ref(detectStats())

const filters = ref({ 检测编号: '', 检测管段: '', 检测方式: '' })
const statusSummary = computed(() => {
  // rows 变化（执行动作、翻页、登记）后也要重新汇总全量状态。
  void rows.value
  const counts: Record<string, number> = { 待检测: 0, 检测中: 0, 已完成: 0, 需复测: 0 }
  // 状态汇总基于全量过滤结果，不随分页变动。
  for (const entry of allFilteredDetectEntries(filters.value)) {
    counts[entryStatus(entry)] += 1
  }
  return Object.entries(counts).map(([status, count]) => ({ status, count }))
})

// 报告视图状态
const activeId = ref<number | null>(null)
const activeEntry = ref<PipeDetectEntry | null>(null)
const roundTab = ref<RoundTab>('all')

const reportTabs = computed(() => [
  { key: 'all' as const, label: '全部轮次', count: activeEntry.value?.rounds.length ?? 0 },
  {
    key: 'original' as const,
    label: '原始记录',
    count: activeEntry.value?.rounds.filter((round) => round.kind === 'original').length ?? 0,
  },
  {
    key: 'retest' as const,
    label: '复测记录',
    count: activeEntry.value?.rounds.filter((round) => round.kind === 'retest').length ?? 0,
  },
])

const visibleRounds = computed(() => {
  if (!activeEntry.value) {
    return []
  }
  if (roundTab.value === 'original') {
    return activeEntry.value.rounds.filter((round) => round.kind === 'original')
  }
  if (roundTab.value === 'retest') {
    return activeEntry.value.rounds.filter((round) => round.kind === 'retest')
  }
  return activeEntry.value.rounds
})

// 弹窗状态
const createOpen = ref(false)
const resultOpen = ref(false)
const retestOpen = ref(false)
const modalError = ref('')
const createForm = ref({ 检测编号: '', 检测管段: '', 检测方式: '', 检测设备: '', planDate: '' })
const resultForm = ref<DetectResultInput>({
  inspectDate: '',
  method: '',
  device: '',
  length: '',
  verdict: '合格',
  inspector: '',
  defects: '',
})
const resultTargetId = ref<number | null>(null)
const resultTargetLabel = ref('')
const retestTargetId = ref<number | null>(null)
const retestTargetLabel = ref('')
const retestPlanDate = ref('')

function latestDate(entry: PipeDetectEntry): string {
  const latest = entry.rounds[entry.rounds.length - 1]
  return latest.inspectDate || latest.planDate
}

function conclusionClass(entry: PipeDetectEntry): string {
  const text = currentConclusion(entry)
  if (text === '合格') {
    return 'pass'
  }
  if (text === '不合格') {
    return 'fail'
  }
  return 'waiting'
}

function isLatestRound(round: DetectRound): boolean {
  return Boolean(activeEntry.value && activeEntry.value.rounds[activeEntry.value.rounds.length - 1] === round)
}

/**
 * 行内动作由最新一轮的状态决定：
 * 待检测/检测中可安排与记录结果；不合格才能标记复测；合格没有后续动作。
 */
function availableActions(entry: PipeDetectEntry): string[] {
  const latest = entry.rounds[entry.rounds.length - 1]
  if (latest.status === '待检测') {
    return [latest.kind === 'retest' ? '安排复测' : '安排检测', '记录结果']
  }
  if (latest.status === '检测中') {
    return ['记录结果']
  }
  return latest.verdict === '不合格' ? ['标记复测'] : []
}

function reload(targetPage?: number) {
  errorMessage.value = ''
  if (typeof targetPage === 'number') {
    page.value = targetPage
  }
  const payload = listDetectEntries(filters.value, page.value, PAGE_SIZE)
  rows.value = payload.items
  total.value = payload.total
  page.value = payload.page
  stats.value = detectStats()
  if (activeId.value !== null) {
    activeEntry.value = getDetectEntry(activeId.value) ?? null
  }
}

function resetFilters() {
  filters.value = { 检测编号: '', 检测管段: '', 检测方式: '' }
  reload(1)
}

function exportRows() {
  downloadDetectCsv()
}

function openReport(entry: PipeDetectEntry) {
  activeId.value = Number(entry.id)
  roundTab.value = 'all'
  activeEntry.value = getDetectEntry(activeId.value) ?? null
  view.value = 'report'
  errorMessage.value = ''
}

function backToList() {
  view.value = 'list'
  reload()
}

function runArrange(entry: PipeDetectEntry) {
  const result = arrangeDetect(Number(entry.id))
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function openCreate() {
  modalError.value = ''
  createForm.value = { 检测编号: '', 检测管段: '', 检测方式: '', 检测设备: '', planDate: '' }
  createOpen.value = true
}

function submitCreate() {
  const result = createDetectEntry(createForm.value)
  if (!result.ok) {
    modalError.value = result.message
    return
  }
  createOpen.value = false
  reload(1)
}

function openResult(entry: PipeDetectEntry) {
  modalError.value = ''
  resultTargetId.value = Number(entry.id)
  const latest = entry.rounds[entry.rounds.length - 1]
  resultTargetLabel.value = `${entry.检测编号} · ${roundLabel(latest)}`
  resultForm.value = {
    inspectDate: '',
    method: latest.method,
    device: latest.device,
    length: latest.length,
    verdict: '合格',
    inspector: latest.inspector,
    defects: '',
  }
  resultOpen.value = true
}

function submitResult() {
  if (resultTargetId.value === null) {
    return
  }
  const result = recordDetectResult(resultTargetId.value, resultForm.value)
  if (!result.ok) {
    modalError.value = result.message
    return
  }
  resultOpen.value = false
  reload()
}

function openRetest(entry: PipeDetectEntry) {
  modalError.value = ''
  retestTargetId.value = Number(entry.id)
  retestTargetLabel.value = `${entry.检测编号} · ${entry.检测管段}`
  retestPlanDate.value = ''
  retestOpen.value = true
}

function submitRetest() {
  if (retestTargetId.value === null) {
    return
  }
  const result = markRetest(retestTargetId.value, retestPlanDate.value)
  if (!result.ok) {
    modalError.value = result.message
    return
  }
  retestOpen.value = false
  reload()
}

onMounted(reload)
</script>

<style scoped>
.history-cell {
  color: var(--muted);
  font-size: 12px;
  max-width: 220px;
}

.conclusion-tag {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 600;
}
.conclusion-tag.pass {
  background: #e7f6ec;
  color: #1a7f37;
}
.conclusion-tag.fail {
  background: #fdecec;
  color: #b42318;
}
.conclusion-tag.waiting {
  background: #eef2f7;
  color: #64748b;
}

.pager {
  display: inline-flex;
  gap: 8px;
}
.pager .btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.report-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 12px;
}
.report-head h3 {
  margin: 0 0 4px;
}
.report-banner {
  text-align: right;
  white-space: nowrap;
}
.report-banner-label {
  display: block;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}

.round-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.round-tab {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
}
.round-tab.active {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}

.round-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 12px;
}
.round-card {
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.round-card.pending {
  border-style: dashed;
  background: #fafbfd;
}
.round-card.latest {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand) inset;
}
.round-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.round-seq {
  font-weight: 700;
  margin-right: 8px;
}
.round-kind {
  font-size: 12px;
  color: var(--muted);
  background: #eef2f7;
  border-radius: 4px;
  padding: 1px 8px;
}
.adopt-tag {
  margin-left: 8px;
  font-size: 11px;
  color: #fff;
  background: var(--brand);
  border-radius: 4px;
  padding: 1px 6px;
}
.round-status {
  font-size: 12px;
  border-radius: 999px;
  padding: 2px 10px;
}
.round-status.已完成 {
  background: #e7f6ec;
  color: #1a7f37;
}
.round-status.检测中 {
  background: #e8f1fe;
  color: #1f6feb;
}
.round-status.待检测 {
  background: #eef2f7;
  color: #64748b;
}

.round-detail {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: 12px;
}
.round-detail dt {
  color: var(--muted);
  display: inline;
  margin-right: 4px;
}
.round-detail dd {
  display: inline;
  margin: 0;
}
.round-result {
  border-top: 1px dashed var(--border);
  padding-top: 8px;
}
.result-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}
.verdict {
  font-weight: 700;
}
.verdict.合格 {
  color: #1a7f37;
}
.verdict.不合格 {
  color: #b42318;
}
.defect-line {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--muted);
}
.round-placeholder {
  margin: 0;
  border-top: 1px dashed var(--border);
  padding-top: 8px;
  font-size: 12px;
  color: #b54708;
}
.round-order {
  margin: 0;
  font-size: 11px;
  color: #94a3b8;
}
.report-empty {
  padding: 24px;
  background: #fff;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.modal {
  width: 460px;
  max-height: 86vh;
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  padding: 18px 20px;
}
.modal h3 {
  margin: 0 0 10px;
}
.modal-tip {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--muted);
}
.modal-item {
  display: block;
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--muted);
}
.modal-item span {
  display: block;
  margin-bottom: 4px;
}
.modal-item input,
.modal-item select,
.modal-item textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
}
.modal-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 10px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 6px;
}
</style>
