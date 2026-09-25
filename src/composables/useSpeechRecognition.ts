/**
 * 语音输入 composable —— 基于 Web Speech API（SpeechRecognition）
 *
 * 封装识别器的生命周期与状态，组件只消费：
 *   - isListening / finalText / interimText / elapsedText / lastError
 *   - start() / stop() / reset()
 *
 * 关键行为：
 *   - continuous + interimResults：边说边出字；
 *   - Chrome 会在静音或约 60s 后自动断流，onend 时若聆听意图仍在则自动续听；
 *   - 组件卸载时 abort 并清理计时器，防止泄漏。
 *
 * 类型说明：lib.dom 对该 API 的声明不可靠（部分 TS 版本缺失 / 带 webkit 前缀），
 * 这里用 `*Like` 后缀的最小接口自声明，经 unknown 收窄取构造器，不使用 any。
 */

import {
  ref,
  computed,
  onUnmounted,
  toValue,
  type MaybeRefOrGetter,
  type Ref,
  type ComputedRef,
} from 'vue'

/** 单个识别候选文本 */
interface SpeechRecognitionAlternativeLike {
  transcript: string
}

/** 一个识别段（可有多候选，这里只用第 0 个） */
interface SpeechRecognitionResultLike {
  isFinal: boolean
  [index: number]: SpeechRecognitionAlternativeLike
}

/** 一次 onresult 事件携带的识别段列表 */
interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}

/** onresult 事件 */
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}

/** onerror 事件（error 为错误码，如 not-allowed / network / no-speech；message 为补充信息） */
interface SpeechRecognitionErrorEventLike extends Event {
  error: string
  message?: string
}

/** SpeechRecognition 实例的最小可用接口 */
interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  abort(): void
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}

/** SpeechRecognition 构造器类型 */
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/** useSpeechRecognition 返回值 */
export interface UseSpeechRecognitionReturn {
  /** 是否处于聆听中（用户意图态，断流自动续听期间仍为 true） */
  isListening: Ref<boolean>
  /** 已确定的转写文本 */
  finalText: Ref<string>
  /** 中间（未确定）转写文本，实时刷新 */
  interimText: Ref<string>
  /** 聆听时长文案（mm:ss），供状态栏展示 */
  elapsedText: ComputedRef<string>
  /** 最近一次错误码；no-speech / aborted 不会写入 */
  lastError: Ref<string>
  /** 当前浏览器是否支持语音识别 */
  isSupported: boolean
  /** 开始聆听（含麦克风权限预检） */
  start: () => Promise<void>
  /** 停止聆听（保留已出文字） */
  stop: () => void
  /** 清空转写文本（下次开始前调用） */
  reset: () => void
}

/**
 * 创建语音识别控制器。
 *
 * @param options.lang 识别语言，支持响应式（Ref/Getter，语言切换后下次 start() 生效），默认 'zh-CN'
 * @returns 语音识别状态与控制方法
 */
export function useSpeechRecognition(options?: {
  lang?: MaybeRefOrGetter<string>
}): UseSpeechRecognitionReturn {
  /**
   * 取当前识别语言：每次 start() 时求值，保证跟随界面语言切换。
   * @returns BCP-47 语言标签；空值回退 'zh-CN'
   */
  function currentLang(): string {
    const v = options?.lang ? toValue(options.lang) : ''
    return v || 'zh-CN'
  }

  /** 能力检测：Chrome 用 webkitSpeechRecognition 前缀，新版本两者都有 */
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  const isSupported = !!Ctor

  /** 聆听意图：true 期间 onend 断流会自动续听 */
  const isListening = ref(false)
  /** 已确定转写文本 */
  const finalText = ref('')
  /** 中间转写文本 */
  const interimText = ref('')
  /** 最近一次错误码 */
  const lastError = ref('')
  /** 计时器句柄 */
  let timer: ReturnType<typeof setInterval> | null = null
  /** 识别器单例（懒创建） */
  let recognition: SpeechRecognitionLike | null = null
  /** 聆听秒数（响应式，驱动 elapsedText） */
  const elapsedSeconds = ref(0)

  /** 聆听时长文案 mm:ss */
  const elapsedText = computed(() => {
    const m = Math.floor(elapsedSeconds.value / 60)
    const s = elapsedSeconds.value % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  })

  /**
   * 启动计时器：清零秒数并每秒自增。
   */
  function startTimer(): void {
    stopTimer()
    elapsedSeconds.value = 0
    timer = setInterval(() => {
      elapsedSeconds.value++
    }, 1000)
  }

  /**
   * 停止计时器并释放句柄。
   */
  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  /**
   * 懒创建识别器并绑定回调（单例，避免重复绑定事件）。
   *
   * @returns 识别器实例；浏览器不支持时返回 null
   */
  function ensureRecognition(): SpeechRecognitionLike | null {
    if (recognition) return recognition
    if (!Ctor) return null
    const rec = new Ctor()
    rec.lang = currentLang()
    rec.continuous = true
    rec.interimResults = true

    // 识别结果：final 段累加，非 final 段整体替换（interim 只有一段在刷新）
    rec.onresult = (ev) => {
      let interim = ''
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const result = ev.results[i]
        const text = result[0]?.transcript ?? ''
        if (result.isFinal) {
          finalText.value += text
        } else {
          interim += text
        }
      }
      interimText.value = interim
    }

    // 错误分流：no-speech（没说话）静默结束；aborted 是主动停止忽略；其余记录并终止意图
    rec.onerror = (ev) => {
      // 识别器错误打日志便于排查（权限已通时仍报 not-allowed 多为语音服务不可达）
      console.warn('[useSpeechRecognition] recognition error:', ev.error, ev.message ?? '')
      if (ev.error === 'aborted' || ev.error === 'no-speech') return
      lastError.value = ev.error
      isListening.value = false
      stopTimer()
    }

    // 断流续听：Chrome 静音/约 60s 会自动 onend；聆听意图仍在则重新 start，否则落回空闲
    rec.onend = () => {
      interimText.value = ''
      if (!isListening.value) return
      try {
        rec.start()
      } catch {
        // start 抛 InvalidStateError（尚未完全停止）等异常时视为终止
        isListening.value = false
        stopTimer()
      }
    }

    recognition = rec
    return rec
  }

  /**
   * 预检并申请麦克风权限：Web Speech API 在扩展页面里可能不弹授权框、直接报 not-allowed，
   * 先用 getUserMedia 触发 Chrome 的标准授权弹窗，拿到权限后立即释放轨道（不占用麦克风）。
   * 失败时按 err.name 分流写入 lastError（not-allowed / no-device / device-busy）。
   *
   * @returns 权限可用返回 true；被拒绝或硬件异常返回 false
   */
  async function ensureMicPermission(): Promise<boolean> {
    // 浏览器无 getUserMedia 时跳过预检，交由识别器自己报错
    if (!navigator.mediaDevices?.getUserMedia) return true
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      for (const track of stream.getTracks()) {
        track.stop()
      }
      return true
    } catch (err) {
      // 记录原始错误便于排查，并按错误名分流成可读的错误码
      console.warn('[useSpeechRecognition] getUserMedia failed:', err)
      const name = err instanceof DOMException ? err.name : ''
      const message = err instanceof Error ? err.message : ''
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        lastError.value = 'no-device'
      } else if (name === 'NotReadableError') {
        lastError.value = 'device-busy'
      } else if (name === 'NotAllowedError' && /dismiss/i.test(message)) {
        // 授权弹窗被关闭（未点允许/拒绝）：引导用户去地址栏气泡或站点设置授权
        lastError.value = 'permission-dismissed'
      } else {
        lastError.value = 'not-allowed'
      }
      return false
    }
  }

  /**
   * 开始聆听：预检麦克风权限 → 清空文本与错误 → 启动识别器并开始计时。
   * 失败（权限被拒 / 不支持 / 已在识别中）不抛异常：权限失败写入 lastError，
   * 其余由调用方通过状态判断。
   */
  async function start(): Promise<void> {
    const rec = ensureRecognition()
    if (!rec) return
    // 识别器单例会缓存 lang：每次开始前重写，保证界面语言切换后立即生效
    rec.lang = currentLang()
    // 预检失败时 ensureMicPermission 已写入分流后的 lastError，这里直接返回
    const allowed = await ensureMicPermission()
    if (!allowed) return
    finalText.value = ''
    interimText.value = ''
    lastError.value = ''
    try {
      rec.start()
      isListening.value = true
      startTimer()
    } catch {
      // 已在识别中（InvalidStateError）：保持当前聆听状态即可
      isListening.value = true
      if (timer === null) startTimer()
    }
  }

  /**
   * 停止聆听：终止自动续听意图并优雅停止识别器（会冲刷最后一段 final 结果）。
   */
  function stop(): void {
    isListening.value = false
    stopTimer()
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        /* 忽略：识别器可能已停止 */
      }
    }
    interimText.value = ''
  }

  /**
   * 清空转写文本（不动识别器状态，供下次开始前调用）。
   */
  function reset(): void {
    finalText.value = ''
    interimText.value = ''
    lastError.value = ''
  }

  // 组件卸载：硬中断识别并清理计时器
  onUnmounted(() => {
    isListening.value = false
    stopTimer()
    if (recognition) {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        /* 忽略 */
      }
      recognition = null
    }
  })

  return {
    isListening,
    finalText,
    interimText,
    elapsedText,
    lastError,
    isSupported,
    start,
    stop,
    reset,
  }
}
