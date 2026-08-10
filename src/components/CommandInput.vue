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

          <!-- 发送按钮 -->
          <button class="send-btn" :disabled="!inputValue.trim()" @click="handleSend">
            <ArrowUp :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { ChevronDown, Mic, ArrowUp } from 'lucide-vue-next'
import { useAIEngine } from '../composables/useAIEngine'
import { useCommandHistory } from '../composables/useCommandHistory'
import { SLASH_COMMANDS } from '../shared/slash-commands'
import type { SlashCommand } from '../types'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
}>()

defineExpose({
  focus() {
    textareaRef.value?.focus()
  },
})

const { models, getActiveModel, selectModel } = useAIEngine()
const { addToHistory, navigateHistory } = useCommandHistory()

const inputValue = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

const currentModelName = computed(() => {
  const model = getActiveModel()
  return model?.name || '选择模型'
})

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
  } else {
    if (e.key === 'ArrowUp' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      const prev = navigateHistory(-1, inputValue.value)
      if (prev !== null) inputValue.value = prev
    } else if (e.key === 'ArrowDown' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      const next = navigateHistory(1, inputValue.value)
      if (next !== null) inputValue.value = next
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
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
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
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
  color: #f0f0f0;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
}
.textarea-wrapper textarea::-webkit-scrollbar {
  display: none; /* 直接不显示 */
}

.textarea-wrapper textarea::placeholder {
  color: #555;
}

/* 斜杠命令选择器 */
.slash-picker {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 168px;
  max-height: 240px;
  overflow-y: auto;
  background: #1a1a1a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  z-index: 100;
}
.slash-picker::-webkit-scrollbar {
  display: none; /* 直接不显示 */
}

.slash-picker-header {
  padding: 8px 14px;
  font-size: 11px;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  background: rgba(255, 255, 255, 0.06);
}

.slash-name {
  font-size: 13px;
  color: #e0e0e0;
  font-family: 'SF Mono', 'Fira Code', monospace;
  white-space: nowrap;
  min-width: 100px;
}

.slash-desc {
  font-size: 12px;
  color: #666;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slash-empty {
  padding: 16px;
  text-align: center;
  color: #555;
  font-size: 13px;
}

/* 工具栏 */
.toolbar {
  display: flex;
  justify-content: flex-end;
  padding: 8px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
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
  color: #888;
  font-size: 12px;
  cursor: pointer;
  transition: color 0.15s ease;
}

.model-dropdown-link:hover {
  color: #aaa;
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
  color: #666;
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #888;
}

/* 发送按钮 */
.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #fff;
  border: none;
  border-radius: 6px;
  color: #0a0a0a;
  cursor: pointer;
  transition: all 0.15s ease;
}

.send-btn:hover:not(:disabled) {
  background: #e8e8e8;
}

.send-btn:disabled {
  background: rgba(255, 255, 255, 0.1);
  color: #444;
  cursor: not-allowed;
}

.ml-2 {
  margin-left: 8px;
}
</style>
