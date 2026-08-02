<template>
  <div class="command-area">
    <el-autocomplete
      ref="inputRef"
      v-model="inputValue"
      :fetch-suggestions="querySearch"
      :trigger-on-focus="false"
      placeholder="输入命令或 / 查看帮助..."
      class="command-input"
      @select="handleSelect"
      @keydown.enter="handleEnter"
    >
      <template #prefix>
        <Send :size="16" class="input-icon" />
      </template>
      <template #default="{ item }">
        <div class="cmd-item">
          <span class="cmd-slash">/{{ item.slash }}</span>
          <span class="cmd-desc">{{ item.description }}</span>
        </div>
      </template>
    </el-autocomplete>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Send } from 'lucide-vue-next'
import { SLASH_COMMANDS } from '../sidepanel/command/slash-commands'
import type { SlashCommand } from '../types'

interface CommandSuggestion {
  value: string
  slash: string
  description: string
  command: SlashCommand
}

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'submit'): void
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

const inputRef = ref<{ focus: () => void }>()

const filteredCommands = computed(() => {
  if (!inputValue.value.startsWith('/')) return []
  const query = inputValue.value.slice(1).toLowerCase()
  return SLASH_COMMANDS.filter(
    (c) => c.slash.includes(query) || (c.aliases || []).some((a) => a.includes(query))
  )
})

function querySearch(query: string, cb: (results: CommandSuggestion[]) => void) {
  if (query.startsWith('/')) {
    const results = filteredCommands.value.map((cmd) => ({
      value: '/' + cmd.slash + (cmd.hasArg ? ' ' : ''),
      slash: cmd.slash,
      description: cmd.description,
      command: cmd,
    }))
    cb(results)
  } else {
    cb([])
  }
}

function handleSelect(item: CommandSuggestion) {
  inputValue.value = item.value
  inputRef.value?.focus()
}

function handleEnter() {
  if (inputValue.value.trim()) {
    emit('submit')
    inputValue.value = ''
  }
}

onMounted(() => {
  inputRef.value?.focus()
})
</script>

<style>
.el-autocomplete__popper {
  background-color: rgb(0, 0, 0, 8) !important;
}
.el-autocomplete__popper li:hover {
  background-color: rgba(100, 100, 100, 8) !important;
}
</style>

<style scoped>
.command-area {
  padding: 12px 16px 16px;
  background: rgba(10, 10, 10, 0.9);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.command-input {
  width: 100%;
}

.input-icon {
  color: #666;
}

:deep(.el-input__wrapper) {
  background-color: rgba(255, 255, 255, 0.05);
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0 12px;
}

:deep(.el-input__wrapper:hover) {
  border-color: rgba(255, 255, 255, 0.2);
}

:deep(.el-input__wrapper.is-focus) {
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.05);
}

:deep(.el-input__inner) {
  color: #f0f0f0;
  font-size: 14px;
}

:deep(.el-input__inner::placeholder) {
  color: #555;
}

.cmd-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cmd-slash {
  font-weight: 500;
  color: #fff;
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  white-space: nowrap;
}

.cmd-desc {
  font-size: 12px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
}

:deep(.el-autocomplete-suggestion__list) {
  padding: 4px 0;
}

:deep(.el-autocomplete-suggestion__item) {
  padding: 8px 12px;
}

:deep(.el-autocomplete-suggestion__item.hover),
:deep(.el-autocomplete-suggestion__item:hover) {
  background-color: rgba(255, 255, 255, 0.05);
}
</style>
