<template>
  <section class="page" data-module="pipe_detect">
    <header class="page-head">
      <div>
        <h2>管道检测管理</h2>
        <p class="page-desc">
          一条管段一条检测档案，原始检测与每次复测各自独立成轮；当前结论只采用最新复核，历史轮次完整保留可查。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记检测记录</button>
        <button class="btn" type="button" @click="exportRows">导出轮次清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in statCards" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="applyFilter">
      <label class="filter-item">
        <span>编号 / 管段 / 设备</span>
        <input v-model="filters.keyword" placeholder="按关键字检索" />
      </label>
      <label class="filter-item">
        <span>当前状态</span>
        <select v-model="filters.status">
          <option value="">全部</option>
          <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
        </select>
      </label>
      <label class="filter-item">
        <span>记录范围</span>
        <select v-model="filters.kind">
          <option value="">全部记录</option>
          <option value="原始检测">仅原始检测</option>
          <option value="复测">含复测记录</option>
        </select>
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
          <th>检测长度</th>
          <th>当前结论</th>
          <th>历史轮次</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="entry in rows" :key="entry.id">
          <td>
            <button class="link" type="button" @click="openReport(entry.id)">{{ entry.code }}</button>
          </td>
          <td>{{ entry.segment }}</td>
          <td>{{ entry.method }}</td>
          <td>{{ entry.length || '—' }}</td>
          <td>
            <template v-if="currentOf(entry)?.status === '已完成'">
              <span :class="['conclusion-tag', currentOf(entry)?.conclusion === '通过' ? 'pass' : 'fail']">
                {{ currentOf(entry)?.conclusion }}
              </span>
              <span class="cell-sub">最新复核 {{ currentOf(entry)?.reviewedAt }}</span>
            </template>
            <span v-else class="muted-text">尚未出复核结论</span>
          </td>
          <td>
            <span class="round-count">共 {{ entry.rounds.length }} 轮</span>
            <span class="cell-sub">
              原始 {{ resultText(entry, 0) }}<template v-if="entry.rounds.length > 1">
                ｜复测 {{ resultText(entry, entry.rounds.length - 1) }}
              </template>
            </span>
          </td>
          <td><span :class="['status-badge', statusClass(currentStatus(entry))]">{{ currentStatus(entry) }}</span></td>
          <td class="row-actions">
            <button
              v-for="action in availableActions(entry)"
              :key="action.key"
              class="link"
              type="button"
              @click="handleAction(action.key, entry)"
            >
              {{ action.label }}
            </button>
            <button class="link" type="button" @click="openReport(entry.id)">查看报告</button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td colspan="8" class="empty-state">没有符合条件的管道检测记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条管道检测记录，第 {{ page }} / {{ totalPages }} 页</span>
      <span class="pager">
        <button class="btn" type="button" :disabled="page <= 1" @click="goPage(page - 1)">上一页</button>
        <button
          v-for="p in pageNumbers"
          :key="p"
          class="btn"
          :class="{ primary: p === page }"
          type="button"
          @click="goPage(p)"
        >
          {{ p }}
        </button>
        <button class="btn" type="button" :disabled="page >= totalPages" @click="goPage(page + 1)">下一页</button>
      </span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 报告视图：抽屉，每轮检测结果一张卡片 -->
    <div v-if="reportEntry" class="drawer-mask" @click.self="closeReport">
      <section class="report-drawer" role="dialog" aria-modal="true">
        <header class="drawer-head">
          <div>
            <h3>检测报告 · {{ reportEntry.code }}</h3>
            <p class="page-desc">{{ reportEntry.segment }}｜{{ reportEntry.method }}｜{{ reportEntry.length }}</p>
          </div>
          <button class="btn ghost" type="button" @click="closeReport">关闭</button>
        </header>

        <div class="report-tabs" role="tablist">
          <button
            class="tab-btn"
            :class="{ active: reportTab === 'all' }"
            type="button"
            @click="reportTab = 'all'"
          >
            全部轮次（{{ reportEntry.rounds.length }}）
          </button>
          <button
            class="tab-btn"
            :class="{ active: reportTab === '原始检测' }"
            type="button"
            @click="reportTab = '原始检测'"
          >
            原始记录
          </button>
          <button
            class="tab-btn"
            :class="{ active: reportTab === '复测' }"
            :disabled="!hasRetest"
            @click="reportTab = '复测'"
          >
            复测记录（{{ reportEntry.rounds.length - 1 }}）
          </button>
        </div>

        <div class="report-summary">
          <span>
            当前状态：
            <span :class="['status-badge', statusClass(currentStatus(reportEntry))]">{{ currentStatus(reportEntry) }}</span>
          </span>
          <span>
            当前结论：
            <template v-if="currentOf(reportEntry)?.status === '已完成'">
              <span :class="['conclusion-tag', currentOf(reportEntry)?.conclusion === '通过' ? 'pass' : 'fail']">
                {{ currentOf(reportEntry)?.conclusion }}
              </span>
              （采用最新复核）
            </template>
            <span v-else class="muted-text">待最新一轮出结果</span>
          </span>
        </div>

        <div class="round-list">
          <article
            v-for="round in visibleRounds"
            :key="round.round"
            class="round-card"
            :class="{ placeholder: round.status !== '已完成' }"
          >
            <header class="round-card-head">
              <div>
                <strong>{{ roundLabel(round) }}</strong>
                <span :class="['status-badge', statusClass(roundStatusText(round))]">{{ round.status }}</span>
                <span v-if="round.round === reportEntry.rounds.length && round.status === '已完成'" class="adopt-tag">
                  最新采用
                </span>
              </div>
              <span class="cell-sub">{{ round.detectedAt ? `检测日期 ${round.detectedAt}` : '尚未检测' }}</span>
            </header>

            <template v-if="round.status === '已完成'">
              <dl class="round-grid">
                <div><dt>检测结果</dt><dd>{{ round.result }}</dd></div>
                <div><dt>复核结论</dt><dd>{{ round.conclusion }}</dd></div>
                <div><dt>复核日期</dt><dd>{{ round.reviewedAt }}</dd></div>
                <div><dt>检测设备</dt><dd>{{ round.device }}</dd></div>
                <div><dt>检测人员</dt><dd>{{ round.inspector }}</dd></div>
                <div class="span-two"><dt>情况说明</dt><dd>{{ round.note || '—' }}</dd></div>
              </dl>
            </template>
            <div v-else class="round-placeholder">
              <p>本轮{{ round.status === '待检测' ? '尚未安排检测' : '检测进行中' }}，报告先展示「{{ round.status }}」占位。</p>
              <p class="cell-sub">已完成的其他轮次结果仍在下方/上方并排列出，历史检测结果不会被覆盖。</p>
              <div class="placeholder-actions">
                <button v-if="round.status === '待检测'" class="btn" type="button" @click="schedule(round.round)">
                  安排{{ round.kind }}
                </button>
                <button v-if="round.status === '检测中'" class="btn primary" type="button" @click="openResult(reportEntry.id, round.round)">
                  录入本轮结果
                </button>
              </div>
            </div>
          </article>
          <p v-if="!visibleRounds.length" class="empty-state" style="padding: 24px">该分类下暂无轮次记录</p>
        </div>
      </section>
    </div>

    <!-- 录入结果 -->
    <div v-if="resultModal.open" class="drawer-mask" @click.self="resultModal.open = false">
      <section class="form-modal" role="dialog" aria-modal="true">
        <header class="drawer-head">
          <h3>录入{{ roundDisplayName(resultModal.round) }}结果</h3>
        </header>
        <div class="form-grid">
          <label>
            <span>检测结果</span>
            <select v-model="resultModal.form.result">
              <option value="">请选择</option>
              <option value="合格">合格</option>
              <option value="不合格">不合格</option>
            </select>
          </label>
          <label>
            <span>复核结论</span>
            <select v-model="resultModal.form.conclusion">
              <option value="">请选择</option>
              <option value="通过">通过</option>
              <option value="不通过">不通过</option>
            </select>
          </label>
          <label>
            <span>检测日期</span>
            <input v-model="resultModal.form.detectedAt" type="date" />
          </label>
          <label>
            <span>复核日期</span>
            <input v-model="resultModal.form.reviewedAt" type="date" />
          </label>
          <label>
            <span>检测设备</span>
            <input v-model="resultModal.form.device" placeholder="如：CCTV-A1" />
          </label>
          <label>
            <span>检测人员</span>
            <input v-model="resultModal.form.inspector" placeholder="姓名" />
          </label>
          <label class="span-two">
            <span>情况说明</span>
            <textarea v-model="resultModal.form.note" rows="3" placeholder="缺陷描述、修复与复核说明"></textarea>
          </label>
        </div>
        <p v-if="resultModal.error" class="error-text">{{ resultModal.error }}</p>
        <footer class="modal-foot">
          <button class="btn ghost" type="button" @click="resultModal.open = false">取消</button>
          <button class="btn primary" type="button" @click="submitResult">提交结果</button>
        </footer>
      </section>
    </div>

    <!-- 标记复测 -->
    <div v-if="retestModal.open" class="drawer-mask" @click.self="retestModal.open = false">
      <section class="form-modal" role="dialog" aria-modal="true">
        <header class="drawer-head">
          <h3>标记复测 · {{ retestModal.code }}</h3>
        </header>
        <p class="page-desc">将新增一轮「复测」记录，初始为「待检测」占位；原始检测结果原样保留。</p>
        <label class="full-label">
          <span>复测原因 / 已采取措施</span>
          <textarea v-model="retestModal.note" rows="3" placeholder="如：三级破裂已开挖修复，申请复测"></textarea>
        </label>
        <p v-if="retestModal.error" class="error-text">{{ retestModal.error }}</p>
        <footer class="modal-foot">
          <button class="btn ghost" type="button" @click="retestModal.open = false">取消</button>
          <button class="btn primary" type="button" @click="submitRetest">确认标记复测</button>
        </footer>
      </section>
    </div>

    <!-- 登记新记录 -->
    <div v-if="createModal.open" class="drawer-mask" @click.self="createModal.open = false">
      <section class="form-modal" role="dialog" aria-modal="true">
        <header class="drawer-head">
          <h3>登记检测记录</h3>
        </header>
        <div class="form-grid">
          <label class="span-two">
            <span>检测管段</span>
            <input v-model="createModal.form.segment" placeholder="如：滨河路 W3-W5 污水干管" />
          </label>
          <label>
            <span>检测方式</span>
            <input v-model="createModal.form.method" placeholder="CCTV 检测 / QV 潜望镜 / 声纳" />
          </label>
          <label>
            <span>检测设备</span>
            <input v-model="createModal.form.device" placeholder="设备编号" />
          </label>
          <label>
            <span>检测长度</span>
            <input v-model="createModal.form.length" placeholder="如：186m" />
          </label>
        </div>
        <p v-if="createModal.error" class="error-text">{{ createModal.error }}</p>
        <footer class="modal-foot">
          <button class="btn ghost" type="button" @click="createModal.open = false">取消</button>
          <button class="btn primary" type="button" @click="submitCreate">登记</button>
        </footer>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, reactive, ref, watch } from 'vue'

defineOptions({ name: 'PipeDetectWorkbench' })

import {
  createDetectEntry,
  currentStatus,
  detectStats,
  exportDetectCsv,
  getDetectEntry,
  latestRound,
  listDetectEntries,
  recordDetectResult,
  requestRetest,
  roundLabel,
  scheduleDetect,
  type DetectFilters,
} from '@/api/pipe-detect-service'
import type { DetectEntry, DetectResultInput, DetectRound } from '@/data/pipe-detect-types'

const statusOptions = ['待检测', '检测中', '复测中', '需复测', '已完成']

const rows = ref<DetectEntry[]>([])
const total = ref(0)
const page = ref(1)
const errorMessage = ref('')
const statCards = ref(detectStats())

const filters = reactive<DetectFilters>({ keyword: '', status: '', kind: '' })

// 工作台往返保持：页码与筛选条件写 sessionStorage，离开再回来仍是原报告/原列表。
const VIEW_STATE_KEY = 'underground-pipeline-inspection:pipe-detect-view'
const REPORT_KEY = 'underground-pipeline-inspection:pipe-detect-report'

function persistViewState() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return
  }
  window.sessionStorage.setItem(VIEW_STATE_KEY, JSON.stringify({ ...filters, page: page.value }))
}

function restoreViewState() {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return
  }
  const raw = window.sessionStorage.getItem(VIEW_STATE_KEY)
  if (raw) {
    try {
      const saved = JSON.parse(raw) as DetectFilters & { page?: number }
      filters.keyword = saved.keyword ?? ''
      filters.status = saved.status ?? ''
      filters.kind = saved.kind ?? ''
      page.value = saved.page ?? 1
    } catch {
      /* 状态损坏时回退默认 */
    }
  }
}

const reportEntry = ref<DetectEntry | null>(null)
const reportTab = ref<'all' | '原始检测' | '复测'>('all')

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / 5)))
const pageNumbers = computed(() => {
  const pages: number[] = []
  const max = totalPages.value
  const start = Math.max(1, Math.min(page.value - 2, max - 4))
  for (let p = start; p <= Math.min(max, start + 4); p += 1) {
    pages.push(p)
  }
  return pages
})

const statusSummary = computed(() =>
  statusOptions.map((status) => ({
    status,
    count: rows.value.filter((entry) => currentStatus(entry) === status).length,
  })),
)

const hasRetest = computed(() => (reportEntry.value?.rounds.length ?? 0) > 1)

const visibleRounds = computed<DetectRound[]>(() => {
  if (!reportEntry.value) {
    return []
  }
  if (reportTab.value === 'all') {
    return reportEntry.value.rounds
  }
  return reportEntry.value.rounds.filter((round) => round.kind === reportTab.value)
})

function currentOf(entry: DetectEntry): DetectRound {
  return latestRound(entry)
}

function resultText(entry: DetectEntry, index: number): string {
  const round = entry.rounds[index]
  if (!round || round.status !== '已完成') {
    return round ? round.status : '—'
  }
  return round.conclusion
}

function roundStatusText(round: DetectRound): string {
  if (round.kind === '复测' && round.status !== '已完成') {
    return round.status === '待检测' ? '需复测' : '复测中'
  }
  return round.status
}

function statusClass(status: string): string {
  if (status === '已完成') {
    return 'badge-done'
  }
  if (status === '需复测' || status === '复测中') {
    return 'badge-retest'
  }
  if (status === '检测中') {
    return 'badge-doing'
  }
  return 'badge-pending'
}

type ActionKey = 'schedule' | 'record' | 'retest'

function availableActions(entry: DetectEntry): { key: ActionKey; label: string }[] {
  const latest = latestRound(entry)
  const actions: { key: ActionKey; label: string }[] = []
  if (latest.status === '待检测') {
    actions.push({ key: 'schedule', label: latest.kind === '复测' ? '安排复测' : '安排检测' })
  }
  if (latest.status === '检测中') {
    actions.push({ key: 'record', label: '录入结果' })
  }
  if (
    latest.status === '已完成' &&
    latest.kind === '原始检测' &&
    latest.result === '不合格'
  ) {
    actions.push({ key: 'retest', label: '标记复测' })
  }
  return actions
}

function reload() {
  const payload = listDetectEntries(filters, page.value)
  rows.value = payload.items
  total.value = payload.total
  page.value = payload.page
  statCards.value = detectStats()
  if (reportEntry.value) {
    reportEntry.value = getDetectEntry(reportEntry.value.id) ?? reportEntry.value
  }
  persistViewState()
}

function applyFilter() {
  page.value = 1
  reload()
}

function resetFilters() {
  filters.keyword = ''
  filters.status = ''
  filters.kind = ''
  page.value = 1
  reload()
}

function goPage(target: number) {
  if (target < 1 || target > totalPages.value || target === page.value) {
    return
  }
  page.value = target
  reload()
}

// ---- 报告抽屉 ----
function openReport(id: number) {
  const entry = getDetectEntry(id)
  if (!entry) {
    errorMessage.value = '没有找到这条检测记录'
    return
  }
  reportEntry.value = entry
  reportTab.value = 'all'
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.setItem(REPORT_KEY, String(id))
  }
}

function closeReport() {
  reportEntry.value = null
  if (typeof window !== 'undefined' && window.sessionStorage) {
    window.sessionStorage.removeItem(REPORT_KEY)
  }
}

function roundDisplayName(round: number): string {
  const target = reportEntry.value?.rounds.find((item) => item.round === round)
  return target ? roundLabel(target) : `第${round}轮`
}

// ---- 动作 ----
function flash(message: string, ok: boolean) {
  if (ok) {
    errorMessage.value = ''
    reload()
  } else {
    errorMessage.value = message
  }
}

function handleAction(key: ActionKey, entry: DetectEntry) {
  const latest = latestRound(entry)
  if (key === 'schedule') {
    const outcome = scheduleDetect(entry.id, latest.round)
    flash(outcome.message, outcome.ok)
    return
  }
  if (key === 'record') {
    openResult(entry.id, latest.round)
    return
  }
  retestModal.open = true
  retestModal.id = entry.id
  retestModal.code = entry.code
  retestModal.note = ''
  retestModal.error = ''
}

function schedule(round: number) {
  if (!reportEntry.value) {
    return
  }
  const outcome = scheduleDetect(reportEntry.value.id, round)
  flash(outcome.message, outcome.ok)
}

const emptyResult = (): DetectResultInput => ({
  result: '',
  conclusion: '',
  detectedAt: '',
  reviewedAt: '',
  device: '',
  inspector: '',
  note: '',
})

const resultModal = reactive({
  open: false,
  id: 0,
  round: 1,
  form: emptyResult(),
  error: '',
})

function openResult(id: number, round: number) {
  resultModal.id = id
  resultModal.round = round
  resultModal.form = emptyResult()
  const entry = getDetectEntry(id)
  const target = entry?.rounds.find((item) => item.round === round)
  if (target) {
    resultModal.form.device = target.device || entry?.device || ''
  }
  resultModal.error = ''
  resultModal.open = true
}

function submitResult() {
  const outcome = recordDetectResult(resultModal.id, resultModal.round, { ...resultModal.form })
  if (!outcome.ok) {
    resultModal.error = outcome.message
    return
  }
  resultModal.open = false
  flash(outcome.message, true)
}

const retestModal = reactive({
  open: false,
  id: 0,
  code: '',
  note: '',
  error: '',
})

function submitRetest() {
  const outcome = requestRetest(retestModal.id, retestModal.note)
  if (!outcome.ok) {
    retestModal.error = outcome.message
    return
  }
  retestModal.open = false
  flash(outcome.message, true)
}

const createModal = reactive({
  open: false,
  error: '',
  form: { segment: '', method: '', device: '', length: '' },
})

function openCreate() {
  createModal.form = { segment: '', method: '', device: '', length: '' }
  createModal.error = ''
  createModal.open = true
}

function submitCreate() {
  const outcome = createDetectEntry({ ...createModal.form })
  if (!outcome.ok) {
    createModal.error = outcome.message
    return
  }
  createModal.open = false
  page.value = 1
  reload()
}

function exportRows() {
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

watch(
  () => reportEntry.value?.id,
  () => {
    if (reportEntry.value && typeof window !== 'undefined' && window.sessionStorage) {
      window.sessionStorage.setItem(REPORT_KEY, String(reportEntry.value.id))
    }
  },
)

onMounted(() => {
  restoreViewState()
  reload()
  if (typeof window !== 'undefined' && window.sessionStorage) {
    const reportId = window.sessionStorage.getItem(REPORT_KEY)
    if (reportId) {
      openReport(Number(reportId))
    }
  }
})

// 被 keep-alive 缓存后再回到本页：数据可能在别处变过，按原页码/筛选刷新，但保持报告打开。
onActivated(() => {
  reload()
})
</script>

<style scoped>
.muted-text {
  color: var(--muted);
  font-size: 12px;
}
.cell-sub {
  display: block;
  color: var(--muted);
  font-size: 12px;
  margin-top: 2px;
}
.round-count {
  font-weight: 600;
}
.conclusion-tag {
  display: inline-block;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 12px;
}
.conclusion-tag.pass {
  background: #e7f6ec;
  color: #18794e;
}
.conclusion-tag.fail {
  background: #fdecec;
  color: #b42318;
}
.status-badge {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  background: #eef2f7;
  color: #475569;
}
.badge-done {
  background: #e7f6ec;
  color: #18794e;
}
.badge-retest {
  background: #fff3e0;
  color: #b25e09;
}
.badge-doing {
  background: #e8f0fe;
  color: #1f6feb;
}
.badge-pending {
  background: #eef2f7;
  color: #64748b;
}
.pager {
  display: flex;
  gap: 6px;
}
.pager .btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 50;
}
.report-drawer {
  width: 760px;
  max-width: 92vw;
  height: 100%;
  background: #fff;
  padding: 18px 20px;
  overflow-y: auto;
  box-shadow: -8px 0 24px rgba(15, 23, 42, 0.18);
}
.drawer-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}
.drawer-head h3 {
  margin: 0 0 4px;
  font-size: 16px;
}
.report-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.tab-btn {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 999px;
  padding: 5px 14px;
  font-size: 13px;
  cursor: pointer;
}
.tab-btn.active {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
}
.tab-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.report-summary {
  display: flex;
  gap: 20px;
  background: #f8fafc;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 13px;
  margin-bottom: 14px;
}
.round-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.round-card {
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
  background: #fff;
}
.round-card.placeholder {
  background: #fbfcfe;
  border-style: dashed;
}
.round-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.round-card-head strong {
  margin-right: 10px;
}
.adopt-tag {
  margin-left: 8px;
  background: #1f6feb;
  color: #fff;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 12px;
}
.round-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px 16px;
  margin: 0;
}
.round-grid dt {
  font-size: 12px;
  color: var(--muted);
}
.round-grid dd {
  margin: 2px 0 0;
  font-size: 13px;
}
.round-grid .span-two {
  grid-column: span 3;
}
.round-placeholder {
  color: #475569;
  font-size: 13px;
}
.round-placeholder p {
  margin: 4px 0;
}
.placeholder-actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.form-modal {
  width: 560px;
  max-width: 94vw;
  margin: auto;
  background: #fff;
  border-radius: 10px;
  padding: 18px 20px;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.28);
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-grid label,
.full-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);
}
.form-grid .span-two {
  grid-column: span 2;
}
.form-grid input,
.form-grid select,
.form-grid textarea,
.full-label textarea,
.filter-bar select {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
