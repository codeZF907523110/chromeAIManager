<template>
  <div class="command-wrapper">
    <div class="command-input-row">
      <span class="command-prefix">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      </span>
      <input
        ref="inputRef"
        v-model="inputValue"
        type="text"
        placeholder="输入命令或 /help 查看帮助..."
        autofocus
        @input="onInput"
        @keydown="onKeydown"
      />
      <button class="submit-btn" title="发送" @click="handleSubmit">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"/>
          <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
      </button>
    </div>
    <div v-if="showPalette" class="command-palette">
      <div
        v-for="(cmd, index) in filteredCommands"
        :key="cmd.slash"
        class="palette-item"
        :class="{ active: index === paletteIndex }"
        @click="selectCommand(cmd)"
      >
        <span class="palette-cmd">
          /{{ cmd.slash }}{{ cmd.hasArg ? ' <' + (cmd.placeholder || '') + '>' : '' }}
        </span>
        <span class="palette-desc">{{ cmd.description }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { SLASH_COMMANDS } from '../sidepanel/command/slash-commands.js';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'submit'): void;
}>();

const inputValue = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const inputRef = ref<HTMLInputElement>();
const showPalette = ref(false);
const paletteIndex = ref(0);

const filteredCommands = computed(() => {
  if (!inputValue.value.startsWith('/')) return [];
  const query = inputValue.value.slice(1).toLowerCase();
  return SLASH_COMMANDS.filter(
    (c) =>
      c.slash.includes(query) ||
      (c.aliases || []).some((a) => a.includes(query)),
  );
});

function onInput() {
  if (inputValue.value.startsWith('/')) {
    showPalette.value = filteredCommands.value.length > 0;
  } else {
    showPalette.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (showPalette.value && filteredCommands.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      paletteIndex.value = Math.min(paletteIndex.value + 1, filteredCommands.value.length - 1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      paletteIndex.value = Math.max(paletteIndex.value - 1, 0);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      showPalette.value = false;
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      selectCommand(filteredCommands.value[paletteIndex.value]);
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSubmit();
  }
}

function selectCommand(cmd: (typeof SLASH_COMMANDS)[0]) {
  inputValue.value = '/' + cmd.slash + (cmd.hasArg ? ' ' : '');
  showPalette.value = false;
  inputRef.value?.focus();
}

function handleSubmit() {
  if (inputValue.value.trim()) {
    emit('submit');
    inputValue.value = '';
  }
}

// 点击外部关闭下拉框
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('.command-wrapper')) {
    showPalette.value = false;
  }
});
</script>

<style scoped>
.command-wrapper {
  position: relative;
}

.command-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #e0e0e0;
}

.command-prefix {
  color: #666;
}

.command-input-row input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
}

.submit-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  padding: 4px;
}

.submit-btn:hover {
  color: #1976d2;
}

.command-palette {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  max-height: 300px;
  overflow-y: auto;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
}

.palette-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  border-bottom: 1px solid #f5f5f5;
}

.palette-item:last-child {
  border-bottom: none;
}

.palette-item:hover,
.palette-item.active {
  background: #f5f5f5;
}

.palette-cmd {
  font-weight: 500;
  color: #1976d2;
}

.palette-desc {
  font-size: 12px;
  color: #666;
}
</style>
