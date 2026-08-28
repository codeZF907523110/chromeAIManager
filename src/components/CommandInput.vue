<template>
  <div class="command-area">
    <div class="input-container">
      <!-- 输入框 -->
      <div class="textarea-wrapper">
        <textarea
          ref="textareaRef"
          v-model="inputValue"
          placeholder="输入命令或 / 查看帮助..."
          rows="3"
          @keydown="handleKeydown"
          @input="handleInput"
        ></textarea>

        <!-- 斜杠命令提示 -->
        <div v-if="showSlashPicker" class="slash-picker">
          <div class="slash-picker-header">可用命令</div>
          <div class="slash-picker-list">
            <div
              v-for="(cmd, idx) in filteredCommands"
              :key="cmd.slash"
              class="slash-item"
              :class="{ active: idx === selectedSlashIndex }"
              @click="selectSlashCommand(cmd)"
            >
              <span class="slash-name">/{{ cmd.slash }}</span>
              <span class="slash-desc">{{ cmd.description }}</span>
            </div>
            <div v-if="filteredCommands.length === 0" class="slash-empty">无匹配命令</div>
          </div>
        </div>
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
                  <el-tag v-if="model.isDefault" size="small" class="ml-2">默认</el-tag>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 麦克风按钮 -->
          <button class="icon-btn" title="语音输入">
            <Mic :size="16" />
          </button>

          <!-- 停止按钮（AI 思考中显示） -->
          <button v-if="isRunning" class="stop-btn" title="停止生成" @click="emit('stop')">
            <StopCircle :size="16" />
          </button>

          <!-- 发送按钮（思考中隐藏） -->
          <button v-else class="send-btn" :disabled="!inputValue.trim()" @click="handleSend">
            <ArrowUp :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Mic, ArrowUp, StopCircle } from 'lucide-vue-next'
import { useCommandHistory } from '../composables/useCommandHistory'
import { SLASH_COMMANDS } from '../shared/slash-commands'
import type { AIModel, SlashCommand } from '../types'

const props = defineProps<{
  modelValue: string
  isRunning: boolean
  models: readonly AIModel[]
  currentModelName: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
  (e: 'stop'): void
  (e: 'select-model', modelId: string): void
}>()

defineExpose({
  focus() {
    textareaRef.value?.focus()
  },
})

const { addToHistory, navigateHistory } = useCommandHistory()

const inputValue = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

const currentModelName = computed(() => props.currentModelName)

const textareaRef = ref<HTMLTextAreaElement>()

// 斜杠命令
const showSlashPicker = ref(false)
const selectedSlashIndex = ref(0)
const slashQuery = ref('')

const filteredCommands = computed(() => {
  if (!slashQuery.value) return SLASH_COMMANDS
  const q = slashQuery.value.toLowerCase()
  return SLASH_COMMANDS.filter(
    (c) =>
      c.slash.toLowerCase().includes(q) ||
      (c.aliases || []).some((a) => a.toLowerCase().includes(q))
  )
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
onUnmounted(() => document.removeEventListener('click', handleDocClick))

function handleInput() {
  const val = inputValue.value
  if (val.startsWith('/')) {
    const spaceIdx = val.indexOf(' ')
    const query = spaceIdx > 0 ? val.slice(1, spaceIdx) : val.slice(1)
    slashQuery.value = query
    showSlashPicker.value = true
    selectedSlashIndex.value = 0
  } else {
    showSlashPicker.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
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
      if (filteredCommands.value.length > 0) {
        e.preventDefault()
        selectSlashCommand(filteredCommands.value[selectedSlashIndex.value])
        return
      }
      handleSend()
    } else if (e.key === 'Escape') {
      showSlashPicker.value = false
    }
    return
  }

  // 选择器关闭时，上下键导航已发送过的命令（包括 /sort、/history 等斜杠命令）
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const direction = e.key === 'ArrowUp' ? -1 : 1
    const previous = navigateHistory(direction, inputValue.value)
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
  // 注意：移除了单独的 Enter 发送处理，必须手动点发送按钮才能发送
  // 仅在 slash 选择器打开时 Enter 才生效，用于选中候选命令
}

function selectSlashCommand(cmd: SlashCommand) {
  inputValue.value = '/' + cmd.slash + (cmd.hasArg ? ' ' : '')
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
  addToHistory(inputValue.value)
  emit('submit')
  inputValue.value = ''
}

async function handleSelectModel(modelId: string) {
  emit('select-model', modelId)
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
