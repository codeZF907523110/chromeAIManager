<template>
  <div class="command-area">
    <div class="input-container">
      <!-- 输入框 -->
      <div class="textarea-wrapper">
        <textarea
          ref="textareaRef"
          v-model="inputValue"
          :placeholder="isListening ? t('input.listeningPlaceholder') : t('input.placeholder')"
          rows="3"
          @keydown="handleKeydown"
          @input="handleInput"
          @compositionstart="isComposing = true"
          @compositionend="onCompositionEnd"
        ></textarea>

        <!-- 斜杠命令提示 -->
        <div v-if="showSlashPicker" class="slash-picker">
          <div class="slash-picker-header">{{ t('input.availableCommands') }}</div>
          <div class="slash-picker-list">
            <div
              v-for="(cmd, idx) in filteredCommands"
              :key="cmd.slash"
              class="slash-item"
              :class="{ active: idx === selectedSlashIndex }"
              @click="selectSlashCommand(cmd)"
            >
              <span class="slash-name">/{{ cmd.slash }}</span>
              <span class="slash-desc">{{ t(`slash.${cmd.intent}.desc`) }}</span>
            </div>
            <div v-if="filteredCommands.length === 0" class="slash-empty">
              {{ t('input.noMatchCommand') }}
            </div>
          </div>
        </div>
      </div>

      <!-- 语音输入状态栏：聆听中显示（声浪条 + 计时 + 结束按钮） -->
      <div v-if="isListening" class="voice-bar">
        <span class="voice-eq" aria-hidden="true"><i /><i /><i /></span>
        <span class="voice-hint">{{ t('input.listening') }} {{ elapsedText }}</span>
        <button class="voice-stop" @click="stopVoice">{{ t('input.voiceStop') }}</button>
      </div>

      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-right">
          <!-- 模型选择 -->
          <el-dropdown trigger="click" @command="handleSelectModel">
            <span class="model-dropdown-link">
              {{ currentModelName }}
              <el-icon class="el-icon--right">
                <ChevronDown :size="14" />
              </el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="model in models" :key="model.id" :command="model.id">
                  <span>{{ model.name }}</span>
                  <el-tag v-if="model.isDefault" size="small" class="ml-2">
                    {{ t('app.defaultTag') }}
                  </el-tag>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 麦克风按钮（浏览器不支持语音识别时隐藏；聆听中变红脉冲） -->
          <button
            v-if="speechSupported"
            class="icon-btn"
            :class="{ 'mic-active': isListening }"
            :title="isListening ? t('input.micStopHint') : t('input.micHint')"
            @click="toggleSpeech"
          >
            <Mic :size="16" />
          </button>

          <!-- 停止按钮（AI 思考中显示） -->
          <button
            v-if="isRunning"
            class="stop-btn"
            :title="t('input.stopHint')"
            @click="emit('stop')"
          >
            <StopCircle :size="16" />
          </button>

          <!-- 发送按钮（思考中隐藏；扩展未初始化完时也禁用，避免初始化期间 push 的 user 消息被后续历史消息加载挤到末尾） -->
          <button
            v-else
            class="send-btn"
            :disabled="!inputValue.trim() || !isInitialized"
            :title="isInitialized ? '' : t('input.loadingHistory')"
            @click="handleSend"
          >
            <ArrowUp :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ChevronDown, Mic, ArrowUp, StopCircle } from 'lucide-vue-next'
import { useAIEngine } from '../composables/useAIEngine'
import { useMessageHistory } from '../composables/useCommandHistory'
import { useSpeechRecognition } from '../composables/useSpeechRecognition'
import { speechLangFor } from '../locales'
import { SLASH_COMMANDS } from '../shared/slash-commands'
import type { SlashCommand } from '../types'

const { t, locale } = useI18n()

const props = defineProps<{
  modelValue: string
  isRunning: boolean
  /**
   * 消息日志：用于按上键从历史 user 消息中取上一条。
   * 由 App.vue 从 useAIEngine().state.messageLog 透传。
   */
  messages: readonly import('../types').MessageLog[]
  /**
   * 扩展是否已完成初始化（IndexedDB 历史消息已加载）。
   * 初始化期间禁用发送，避免 user 消息 push 到空数组后被加载完成的历史消息"挤到后面"，
   * 造成视觉上的"乱序"。
   */
  isInitialized?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'stop'): void
}>()

defineExpose({
  focus() {
    textareaRef.value?.focus()
  },
})

const { models, getActiveModel, selectModel } = useAIEngine()
const { navigateHistory, resetHistoryNav } = useMessageHistory()
const messagesRef = computed<readonly import('../types').MessageLog[]>(() => props.messages)

const inputValue = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

const currentModelName = computed(() => {
  const model = getActiveModel()
  return model?.name || t('input.selectModel')
})

const textareaRef = ref<HTMLTextAreaElement>()

// ──── 语音输入（Web Speech API，封装见 useSpeechRecognition）────
// 识别语言跟随界面语言（zh-CN→zh-CN、en→en-US…），切换语言后下次聆听生效
const speechLang = computed(() => speechLangFor(locale.value))
const {
  isListening,
  finalText,
  interimText,
  elapsedText,
  lastError,
  isSupported: speechSupported,
  start: startSpeech,
  stop: stopSpeech,
  reset: resetSpeech,
} = useSpeechRecognition({ lang: speechLang })

/** 开始聆听时的输入框内容快照：转写文字以空格追加在其后，不覆盖用户已输入内容 */
const speechBaseText = ref('')

/** 尾句冲刷窗口：stop() 后识别器会把最后一段 final 补发给 onresult，窗口期内允许写回输入框 */
const flushWindow = ref(false)
/** 冲刷窗口计时器句柄 */
let flushTimer: ReturnType<typeof setTimeout> | null = null

// final/interim 任一变化 → 同步进输入框（flush: 'sync' 让文字随识别事件即时出现）
watch(
  [finalText, interimText],
  () => {
    // 仅聆听中或冲刷窗口内同步；发送路径不开窗口，补发尾句不得写回已清空的输入框
    if (!isListening.value && !flushWindow.value) return
    inputValue.value = speechBaseText.value + finalText.value + interimText.value
  },
  { flush: 'sync' }
)

// 识别错误 → 提示（no-speech / aborted 不会写入 lastError，无需过滤）
watch(lastError, (code) => {
  if (!code) return
  if (code === 'permission-dismissed') {
    // 侧边栏弹不出授权气泡，自动打开本扩展的站点设置页引导授权
    openMicPermissionSettings()
    ElMessage.warning(voiceErrorMessage(code))
    return
  }
  ElMessage.error(voiceErrorMessage(code))
})

/**
 * 打开本扩展的站点设置页（麦克风权限所在处）。
 * 侧边栏页面无法锚定 Chrome 授权气泡（请求会被直接 dismissed），
 * 需要用户在站点设置里把「麦克风」设为允许；扩展自己知道 ID，无需用户复制。
 */
function openMicPermissionSettings(): void {
  try {
    const url = `chrome://settings/content/siteDetails?site=chrome-extension://${chrome.runtime.id}`
    chrome.tabs.create({ url })
  } catch (e) {
    console.warn('[CommandInput] 打开麦克风权限设置页失败:', e)
  }
}

/**
 * 把语音识别/权限预检的错误码转成用户可读文案。
 * @param code 错误码（not-allowed / no-device / device-busy / network 等）
 * @returns 当前界面语言的提示文案
 */
function voiceErrorMessage(code: string): string {
  if (code === 'permission-dismissed') {
    return t('voice.permissionDismissed')
  }
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    return t('voice.notAllowed')
  }
  if (code === 'no-device') return t('voice.noDevice')
  if (code === 'device-busy') return t('voice.deviceBusy')
  if (code === 'network') return t('voice.network')
  return t('voice.genericError', { code })
}

/**
 * 结束聆听并保留文字（点击「结束」/麦克风）：开启 300ms 冲刷窗口，
 * 让识别器 stop() 后补发的最后一段 final 落进输入框，避免丢尾句。
 */
function stopVoice(): void {
  stopSpeech()
  flushWindow.value = true
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushWindow.value = false
  }, 300)
}

/**
 * 点击麦克风：聆听中 → 结束聆听（文字保留在输入框）；未开始 → 快照当前输入内容后开始聆听。
 */
function toggleSpeech(): void {
  if (isListening.value) {
    stopVoice()
    return
  }
  speechBaseText.value = inputValue.value.trim() ? inputValue.value + ' ' : ''
  resetSpeech()
  startSpeech()
}

// 输入法组合输入状态：中文/日文等输入候选词期间为 true，此时 Enter 用于确认候选词而非提交。
// compositionstart/end 由 @composition* 事件维护，isComposing 由 keydown 原生属性兜底双保险。
const isComposing = ref(false)

// 斜杠命令
const showSlashPicker = ref(false)
const selectedSlashIndex = ref(0)
const slashQuery = ref('')

/**
 * 单个命令与查询词的匹配强度打分（仅用于选择器候选排序，数值越大越靠前）：
 * 命令名/别名命中权重高于描述命中；同类命中内精确 > 前缀 > 包含。
 * 同分候选按注册顺序稳定排序（Array.sort 为稳定排序）。
 * @param c - 斜杠命令
 * @param q - 小写化的查询词
 * @returns 匹配权重；0 表示不匹配（该候选被过滤掉）
 */
function slashMatchWeight(c: SlashCommand, q: string): number {
  const name = c.slash.toLowerCase()
  if (name === q) return 100
  if ((c.aliases || []).some((a) => a.toLowerCase() === q)) return 90
  if (name.startsWith(q)) return 80
  if ((c.aliases || []).some((a) => a.toLowerCase().startsWith(q))) return 70
  if (name.includes(q)) return 60
  if ((c.aliases || []).some((a) => a.toLowerCase().includes(q))) return 50
  // 按本地化描述模糊匹配：输入中文功能词（如「排序」）也能搜到命令，权重最低
  const desc = t(`slash.${c.intent}.desc`).toLowerCase()
  if (desc.startsWith(q)) return 40
  if (desc.includes(q)) return 30
  return 0
}

const filteredCommands = computed(() => {
  if (!slashQuery.value) return SLASH_COMMANDS
  const q = slashQuery.value.toLowerCase()
  // 打分 → 过滤掉不匹配 → 按权重降序；高亮索引固定为 0（handleInput 里已重置）
  return SLASH_COMMANDS.map((c) => ({ cmd: c, weight: slashMatchWeight(c, q) }))
    .filter((x) => x.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((x) => x.cmd)
})

// 外部点击关闭斜杠面板（点击 picker 外任意位置关闭）
function handleDocClick(e: MouseEvent) {
  if (!showSlashPicker.value) return
  const picker = document.querySelector('.slash-picker')
  // 点击在 picker 内 → 保持打开
  if (picker?.contains(e.target as Node)) return
  // 点击在 picker 外任意位置 → 关闭
  showSlashPicker.value = false
}

onMounted(() => document.addEventListener('click', handleDocClick))
onUnmounted(() => {
  document.removeEventListener('click', handleDocClick)
  // 清理冲刷窗口计时器，防止组件卸载后回写状态
  if (flushTimer) clearTimeout(flushTimer)
})

function handleInput() {
  // 从 DOM 取实时值而非 v-model 的 ref：v-model 在中文 IME 组合输入期间不同步模型
  //（compositionend 上屏时才写入 ref，且时序晚于本 handler），读 ref 会拿到组合前
  // 的旧值，导致选择器列表不随中文输入刷新
  const val = textareaRef.value?.value ?? inputValue.value
  // 仅当整行（首个 token）以 / 开头且还没有空格时显示选择器——正在输入命令名。
  // 句中出现的 /path 等 token 不弹窗、不劫持 Enter，避免干扰自然语言输入；
  // 输入空格进入参数阶段后也关闭（参数不需要补全命令名）。
  if (!val.includes(' ') && val.startsWith('/')) {
    slashQuery.value = val.slice(1)
    showSlashPicker.value = true
    selectedSlashIndex.value = 0
  } else {
    showSlashPicker.value = false
  }
}

/**
 * IME 组合输入结束（中文候选词上屏）：v-model 在此刻才把最终文本同步进模型，
 * 之后大概率不再有 input 事件 → 显式刷新一次选择器，保证命令候选随最终输入更新
 */
function onCompositionEnd() {
  isComposing.value = false
  handleInput()
}

function handleKeydown(e: KeyboardEvent) {
  // 输入法组合输入中（中文候选词阶段）：所有按键交给输入法处理，不触发命令导航/提交。
  // isComposing 由 composition 事件维护，e.isComposing 是 keydown 原生属性兜底，
  // 两者取或确保不同浏览器/输入法下都能正确拦截（部分浏览器 keydown 时 isComposing 仍为 true）。
  if (isComposing.value || e.isComposing) return

  // 选择器打开时，方向键只负责选择命令候选项
  if (showSlashPicker.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedSlashIndex.value = Math.min(
        selectedSlashIndex.value + 1,
        filteredCommands.value.length - 1
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedSlashIndex.value = Math.max(selectedSlashIndex.value - 1, 0)
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (filteredCommands.value.length > 0) {
        selectSlashCommand(filteredCommands.value[selectedSlashIndex.value])
        return
      }
      // 候选为空（如拼错的命令）：按普通发送处理；
      // preventDefault 必须先做，否则 handleSend 清空输入后浏览器默认行为会补一个换行残留
      handleSend()
    } else if (e.key === 'Escape') {
      showSlashPicker.value = false
    }
    return
  }

  // 选择器关闭时，上下键导航已发送过的 user 命令（包括 /sort、/history 等斜杠命令）
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const direction = e.key === 'ArrowUp' ? -1 : 1
    const previous = navigateHistory(direction, inputValue.value, messagesRef)
    if (previous !== null) {
      inputValue.value = previous
      handleInput()
      nextTick(() => {
        const textarea = textareaRef.value
        if (textarea) {
          textarea.focus()
          const len = textarea.value.length
          textarea.setSelectionRange(len, len)
        }
      })
    }
  }
  // Enter 发送，Shift+Enter 换行（textarea 默认行为，不拦截）
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

function selectSlashCommand(cmd: SlashCommand) {
  // 只替换最后一个 token（正在输入的命令片段），保留其前的内容（前一个命令及其参数）。
  // 例：输入 "/close-url /pi" 选中 /pin → "/close-url /pin "，而非覆盖整行。
  const val = inputValue.value
  const lastSpaceIdx = val.lastIndexOf(' ')
  const prefix = lastSpaceIdx >= 0 ? val.slice(0, lastSpaceIdx + 1) : ''
  const replacement = '/' + cmd.slash + (cmd.hasArg ? ' ' : '')
  inputValue.value = prefix + replacement
  showSlashPicker.value = false
  // 光标定位到命令末尾（参数位置）
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.focus()
      const len = textareaRef.value.value.length
      textareaRef.value.setSelectionRange(len, len)
    }
  })
}

function handleSend() {
  if (!inputValue.value.trim()) return
  // 初始化期间拒绝提交：避免 user 消息 push 到空 messageLog，
  // 然后被异步加载的历史消息 "挤到末尾" 造成视觉顺序错乱。
  if (!props.isInitialized) return
  // 聆听中先停止语音识别，避免发送后仍在转写
  if (isListening.value) stopSpeech()
  resetHistoryNav()
  showSlashPicker.value = false // 发送后关闭命令选择器，避免残留
  emit('submit')
  inputValue.value = ''
}

async function handleSelectModel(modelId: string) {
  await selectModel(modelId)
}
</script>

<style scoped>
.command-area {
  padding: 12px 16px 16px;
  background: transparent;
  flex-shrink: 0;
}

.input-container {
  display: flex;
  flex-direction: column;
  background: var(--app-bg-input);
  border: 1px solid var(--app-border-input);
  border-radius: 10px;
  overflow: hidden;
}

.textarea-wrapper {
  position: relative;
}

.textarea-wrapper textarea {
  width: 100%;
  padding: 12px 14px;
  background: transparent;
  border: none;
  outline: none;
  color: var(--app-text-primary);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
}
.textarea-wrapper textarea::-webkit-scrollbar {
  display: none;
}

.textarea-wrapper textarea::placeholder {
  color: var(--app-text-placeholder);
}

/* 斜杠命令选择器 */
.slash-picker {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 168px;
  max-height: 240px;
  overflow-y: auto;
  background: var(--app-bg-picker);
  border: 1px solid var(--app-border-picker);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  z-index: 100;
}
.slash-picker::-webkit-scrollbar {
  display: none;
}

.slash-picker-header {
  padding: 8px 14px;
  font-size: 11px;
  color: var(--app-picker-header);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--app-picker-border);
}

.slash-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.slash-item:hover,
.slash-item.active {
  background: var(--app-picker-item-hover);
}

.slash-name {
  font-size: 13px;
  color: var(--app-text-primary);
  font-family: 'SF Mono', 'Fira Code', monospace;
  white-space: nowrap;
  min-width: 100px;
}

.slash-desc {
  font-size: 12px;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-empty {
  padding: 16px;
  text-align: center;
  color: var(--app-text-muted);
  font-size: 13px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  border-top: 1px solid var(--app-picker-border);
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 模型选择 */
.model-dropdown-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  color: var(--app-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s ease;
}

.model-dropdown-link:hover {
  color: var(--app-text-secondary);
}

/* 麦克风按钮 */
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--app-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--app-picker-item-hover);
  color: var(--app-text-muted);
}

/* 麦克风聆听中：红色 + 脉冲光圈 */
.icon-btn.mic-active {
  color: #ef4444;
  animation: mic-pulse 1.4s ease-out infinite;
}

@keyframes mic-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.45);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(239, 68, 68, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

/* 语音输入状态栏：声浪条 + 提示 + 结束按钮 */
.voice-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid var(--app-picker-border);
  background: rgba(239, 68, 68, 0.04);
}

/* 三根声浪条跳动 */
.voice-eq {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
  flex-shrink: 0;
}

.voice-eq i {
  width: 3px;
  height: 100%;
  border-radius: 2px;
  background: #ef4444;
  transform-origin: bottom;
  animation: voice-eq 0.9s ease-in-out infinite;
}

.voice-eq i:nth-child(2) {
  animation-delay: 0.2s;
}

.voice-eq i:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes voice-eq {
  0%,
  100% {
    transform: scaleY(0.3);
  }
  50% {
    transform: scaleY(1);
  }
}

.voice-hint {
  flex: 1;
  font-size: 12px;
  color: var(--app-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.voice-stop {
  flex-shrink: 0;
  padding: 3px 10px;
  font-size: 12px;
  color: #ef4444;
  background: transparent;
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.voice-stop:hover {
  background: rgba(239, 68, 68, 0.08);
}

/* 停止按钮 */
.stop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: #ef4444;
  cursor: pointer;
  transition: all 0.15s ease;
}

.stop-btn:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

/* 发送按钮 */
.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: var(--app-text-primary);
  border: none;
  border-radius: 6px;
  color: var(--app-bg);
  cursor: pointer;
  transition: all 0.15s ease;
}

.send-btn:hover:not(:disabled) {
  background: var(--app-text-secondary);
}

.send-btn:disabled {
  background: var(--app-bg-input);
  color: var(--app-text-muted);
  cursor: not-allowed;
}

.ml-2 {
  margin-left: 8px;
}
</style>
