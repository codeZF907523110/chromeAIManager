# 企业级 DOM 操作架构设计方案

> 版本：v4.0
> 日期：2026-08-16
> 状态：待实施

---

## 1. 背景与目标

### 1.1 现状评估
当前 chromeAIManager 项目通过 `dom-commander.js` Content Script + `executor.ts` 命令分发实现 DOM 操作，存在以下问题：
- 硬编码 AI 逻辑（中文关键词分类）
- DOM 感知能力弱（单轮扫描，无状态跟踪）
- 错误处理粗糙，缺乏自动重试
- 批量操作（batchExecute）与任务规划脱节
- CSP/跨域页面适配不健全
- Content Script 生命周期管理缺失
- 无性能预算和熔断机制
- **DOM 快照方式错误：使用原始 DOM 而非 Accessibility Tree**
- **缺少元素确定性引用系统**
- **未遵循原子操作约束**
- **缺少敏感数据保护机制**
- **缺少 iframe/shadow DOM 处理**
- **缺少多标签页完整管理 API**
- **缺少 CDP 直接通信设计**
- **缺少 WebMCP / Site-declared tools 前瞻性支持**
- **Service Worker 状态持久化方案缺失**

### 1.2 设计目标
参考业内最佳方案（Stagehand、Browser-Use、Nanobrowser、CrewAI、Playwright MCP），设计一套**企业级、AI 驱动、可扩展**的 DOM 操作架构：

| 维度 | 目标 | 关键指标 |
|------|------|---------|
| **AI 决策能力** | 所有执行策略由 AI 动态决策，无硬编码规则 | 置信度 ≥ 0.85，人工介入阈值 = 0.7 |
| **DOM 感知** | Accessibility Tree + 确定性引用 + 变化检测 | 快照延迟 < 200ms（1000 元素内），Token 消耗 < 5KB |
| **执行可靠性** | 幂等操作、自动重试、失败恢复 | 重试成功率 > 95% |
| **性能** | 懒加载快照、增量更新、内存管控 | 内存占用 < 50MB，CPU < 30% |
| **可观测性** | 完整审计日志、性能监控、错误追踪 | 日志延迟 < 100ms |
| **企业合规** | 权限隔离、审计追踪、配置中心 | 支持 100+ 配置项热更新 |
| **安全性** | AI 决策安全边界、人工确认机制 | 高危操作二次确认率 100% |
| **可测试性** | 完整的测试金字塔 | 单元测试覆盖率 > 80% |
| **原子性** | 单步单操作约束 | 每步最多 1 个操作，单元素目标 |

---

## 2. 参考方案分析

### 2.1 Stagehand (Browserbase) - v4.0
- **核心优势**：LLM 驱动的 DOM 操作，直接通过 CDP 与浏览器通信
- **关键设计**：
  - 使用 **Chrome Accessibility Tree** 而非原始 DOM
  - `act()`、`extract()`、`observe()` 三层抽象
  - 内置 retry + timeout 机制
  - **自愈合执行层**：DOM 变化时自动适应
  - **Context Builder**：智能压缩上下文，减少 Token 浪费
- **借鉴点**：Accessibility Tree 优先、确定性引用、原子操作约束

### 2.2 Browser-Use
- **核心优势**：自主浏览器自动化，多步骤任务分解
- **关键设计**：
  - Agent 循环：感知 → 规划 → 执行 → 验证
  - 状态记忆（短期 + 长期）
  - 失败自动恢复
  - **语义树构建**：过滤非交互和不可见元素
- **借鉴点**：Agent 循环架构、语义树过滤、失败恢复策略

### 2.3 Playwright MCP (Microsoft)
- **核心优势**：确定性元素引用 + 结构化快照
- **关键设计**：
  - **每个交互元素分配唯一 ref**（如 `[ref=e14]`）
  - Accessibility Tree 转结构化文本（2-5KB vs 截图 100+KB）
  - **不需要 Vision Model**，任何 LLM 均可使用
  - 提供完整工具集：`browser_navigate`, `browser_snapshot`, `browser_click` 等
- **借鉴点**：确定性引用系统、Accessibility Snapshot、Token 效率优化

### 2.4 Nanobrowser
- **核心优势**：轻量级、低延迟 DOM 操作
- **关键设计**：
  - 选择性注入（按需加载）
  - 高效 DOM 序列化（XPath + 属性快照）
- **借鉴点**：按需注入策略、注入池复用

### 2.5 WebMCP / Site-declared tools (Google)
- **核心优势**：网站主动声明可用操作，Agent 无需猜测
- **关键设计**：
  - 网站在 HTML 中声明 `web-mcp` 协议
  - Agent 直接调用声明的工具（如 `checkout`、`search`）
  - 避免 DOM 解析，效率最高
- **借鉴点**：前瞻性设计，为未来 Web 标准做准备

### 2.6 Chrome Extension MV3 最佳实践
- **核心优势**：官方推荐的 Service Worker 和 Content Script 管理模式
- **关键设计**：
  - Service Worker 使用 `chrome.alarms` 替代 `setInterval`
  - 使用 `chrome.storage.local` 替代内存变量持久化
  - Content Script 通过 `runtime.sendMessage` 单向通信
  - 避免长连接（Long-lived connections 不可靠）
- **借鉴点**：Service Worker 生命周期管理、持久化策略

### 2.7 Playwright MCP (Microsoft) - 补充
- **核心优势**：确定性元素引用 + 结构化快照 + 完整工具集
- **关键设计**：
  - 原生多标签页管理（`browser_tabs` 工具）
  - 完整的工具集合（navigate/snapshot/click/type/select/hover/drag/press/screenshot）
  - 支持保存和恢复浏览器状态（cookies、localStorage）
- **借鉴点**：多标签页管理 API、浏览器状态持久化

### 2.8 WebMCP / Site-declared tools (Google) - 前瞻性
- **核心优势**：网站主动声明可用操作，Agent 无需猜测
- **关键设计**：
  - 网站在 HTML 中声明 `web-mcp` 协议
  - Agent 直接调用声明的工具（如 `checkout`、`search`）
  - 避免 DOM 解析，效率最高
- **借鉴点**：前瞻性设计，为未来 Web 标准做准备

### 2.9 Stagehand V3 决策缓存（关键新增）
- **核心优势**：缓存 LLM 决策，避免重复 Token 消耗
- **关键设计**：
  - **Decision Store**：哈希映射 `hash(DOM + Instruction) -> LLM Result`
  - 重新运行相同测试成本为 0 Token，耗时毫秒级
  - **CI/CD 集成**：本地生成缓存 → CI 验证 → 回归检测
  - **安全脱敏**：缓存文件中不包含 PII（密码、密钥）
- **借鉴点**：决策缓存机制、CI/CD 集成模式

### 2.10 Stagehand V4 性能优化（关键新增）
- **核心优势**：作为 Chrome Extension 运行，性能提升 2x，Token 效率提升 80%
- **关键设计**：
  - **本地执行**：减少网络往返延迟
  - **直接 CDP 通信**：44% 更快的交互速度
  - **智能模型选择**：简单任务用快速模型，复杂任务用高质量模型
  - **网络拦截**：阻塞无网络流量（analytics 等），减少干扰
- **借鉴点**：Extension 内执行架构、智能模型路由

---

## 3. 整体架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Chrome Extension                                      │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐   │
│  │   UI Layer   │  │   Command    │  │   AI Engine                     │   │
│  │  (Vue)       │  │   Input      │  │   (useAIEngine)                 │   │
│  └──────┬───────┘  └──────┬───────┘  └────────────────┬─────────────────┘   │
│         │                 │                           │                    │
│         └─────────────────┼───────────────────────────┘                    │
│                           │                                                │
│                    ┌──────▼──────┐                                         │
│                    │  Service    │                                         │
│                    │  Worker     │                                         │
│                    └──────┬──────┘                                         │
│                           │                                                │
│  ┌────────────────────────▼────────────────────────────────────────────┐   │
│  │              AGENT ORCHESTRATOR                                      │   │
│  │  ┌───────────────────────────────────────────────────────────────┐  │   │
│  │  │  Task Planner (task-planner.ts)                              │  │   │
│  │  │  - 解析用户意图                                                │  │   │
│  │  │  - 任务分解 & 调度                                            │  │   │
│  │  │  - 状态管理 & 恢复                                            │  │   │
│  │  └───────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                │
│              ┌────────────▼────────────┐                                   │
│              │      DOM Executor       │                                   │
│              │    (dom-executor.ts)    │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ Action Router   │    │                                   │
│              │  │ - 命令分发      │    │                                   │
│              │  │ - 参数校验      │    │                                   │
│              │  │ - 重试策略      │    │                                   │
│              │  └─────────────────┘    │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ Permission Check│    │                                   │
│              │  │ - 权限验证      │    │                                   │
│              │  │ - 安全隔离      │    │                                   │
│              │  └─────────────────┘    │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ Safety Boundary │    │                                   │
│              │  │ - 禁止操作清单  │    │                                   │
│              │  │ - 确认阈值      │    │                                   │
│              │  └─────────────────┘    │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ Self-Healing    │    │                                   │
│              │  │ - 失败诊断      │    │                                   │
│              │  │ - 替代方案生成  │    │                                   │
│              │  └─────────────────┘    │                                   │
│              └────────────┬────────────┘                                   │
│                           │                                                │
│              ┌────────────▼────────────┐                                   │
│              │   DOM Perception Engine │                                   │
│              │   (dom-perception.ts)   │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ A11y Snapshot   │    │                                   │
│              │  │ - 可访问性树    │    │                                   │
│              │  │ - 确定性引用    │    │                                   │
│              │  │ - 语义过滤      │    │                                   │
│              │  └─────────────────┘    │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ Context Builder │    │                                   │
│              │  │ - Token 压缩    │    │                                   │
│              │  │ - 选择性提取    │    │                                   │
│              │  └─────────────────┘    │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ Cache Manager   │    │                                   │
│              │  │ - 快照缓存      │    │                                   │
│              │  │ - TTL 过期      │    │                                   │
│              │  └─────────────────┘    │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ Decision Cache  │    │  ← Stagehand V3 核心          │    │
│              │  │ - LLM 决策缓存  │    │                                   │
│              │  │ - 哈希键生成    │    │                                   │
│              │  └─────────────────┘    │                                   │
│              │  ┌─────────────────┐    │                                   │
│              │  │ Network Filter  │    │  ← Stagehand V4 优化          │    │
│              │  │ - 拦截无网络流量│    │                                   │
│              │  └─────────────────┘    │                                   │
│              └─────────────────────────┘                               │
│                           │                                                │
│         ┌─────────────────▼─────────────────┐                              │
│         │        Content Script             │                              │
│         │      (dom-perception.js)          │                              │
│         │  - DOM 访问 & 操作                │                              │
│         │  - 事件监听 & 响应                │                              │
│         │  - 快照采集 (A11y Tree)           │                              │
│         │  - iframe/shadow DOM 遍历         │                              │
│         │  - MutationObserver 增量更新      │                              │
│         └───────────────────────────────────┘                              │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    SERVICE WORKER PERSISTENCE                       │    │
│  │  - chrome.storage.local 持久化                                     │    │
│  │  - chrome.alarms 定时任务                                           │    │
│  │  - 会话状态恢复                                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    CONFIGURATION CENTER                             │    │
│  │  - 运行时配置加载                                                   │    │
│  │  - 配置热更新                                                       │    │
│  │  - 权限配置持久化                                                   │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. 核心模块设计

### 4.1 Agent Orchestrator（代理编排器）

**职责**：协调感知、规划、执行、验证全流程

```typescript
// src/service-worker/agent-orchestrator.ts

export interface AgentSession {
  sessionId: string;
  taskId: string;
  agent: 'perception' | 'executor' | 'verifier' | 'planner';
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  stepHistory: AgentStep[];
  memory?: {
    shortTerm: string[];    // 当前任务上下文
    longTerm: string[];     // 跨任务经验
  };
}

export interface AgentStep {
  stepId: string;
  action: DOMAction;
  result: AgentStepResult;
  metadata: {
    duration: number;
    retryCount: number;
    memorySnapshot?: string;
    confidence: number;
  };
}

export interface AgentStepResult {
  success: boolean;
  data?: unknown;
  error?: DOMError;
  actionTaken?: DOMActionType;
}

export interface DOMError {
  type: DOMErrorType;
  message: string;
  context?: Record<string, unknown>;
  recoveryAction?: DOMActionType;  // 建议的恢复操作
}

export enum DOMErrorType {
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  ELEMENT_NOT_INTERACTIVE = 'ELEMENT_NOT_INTERACTIVE',
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CSP_VIOLATION = 'CSP_VIOLATION',
  NAVIGATION_FAILED = 'NAVIGATION_FAILED',
  CONFIDENCE_TOO_LOW = 'CONFIDENCE_TOO_LOW',
  SAFETY_BLOCKED = 'SAFETY_BLOCKED',
  ATOMIC_VIOLATION = 'ATOMIC_VIOLATION',  // 违反原子操作约束
}

export class AgentOrchestrator {
  private sessions: Map<string, AgentSession> = new Map();
  private safetyBoundary: SafetyBoundary;
  private atomicConstraint: AtomicConstraint;
  
  constructor(safetyBoundary: SafetyBoundary, atomicConstraint: AtomicConstraint) {
    this.safetyBoundary = safetyBoundary;
    this.atomicConstraint = atomicConstraint;
  }
  
  async planAndExecute(
    userIntent: string,
    context: PageContext
  ): Promise<ExecutionResult> {
    // 1. 解析意图（AI 决策）
    const plan = await this.planner.parseIntent(userIntent);
    
    // 2. 安全边界检查
    if (!this.validateSafety(plan)) {
      return { success: false, error: 'Safety boundary violation' };
    }
    
    // 3. 原子性检查
    if (!this.validateAtomic(plan)) {
      return { success: false, error: 'Atomic constraint violation' };
    }
    
    // 4. 分解任务
    const steps = await this.planner.decompose(plan);
    
    // 5. 执行并验证
    return await this.executeWithVerification(steps, context);
  }
  
  private validateSafety(plan: TaskPlan): boolean {
    for (const step of plan.steps) {
      if (this.safetyBoundary.forbiddenActions.includes(step.action.type)) {
        return false;
      }
    }
    return true;
  }
  
  private validateAtomic(plan: TaskPlan): boolean {
    // 确保每个步骤只有一个操作，目标单一元素
    for (const step of plan.steps) {
      if (step.action.target.includes(',')) {
        return false;  // 不支持多元素选择器
      }
    }
    return true;
  }
}

export interface AtomicConstraint {
  maxActionsPerStep: number;     // 默认 1
  allowComplexSequences: boolean; // 默认 false
  requireSingleElement: boolean;  // 默认 true
}
```

### 4.2 DOM Executor（DOM 执行器）

**职责**：安全、可靠地执行 DOM 操作

```typescript
// src/service-worker/dom-executor.ts

export type DOMActionType =
  | 'click'           // 点击元素
  | 'type'            // 输入文本
  | 'hover'           // 悬停
  | 'select'          // 下拉选择
  | 'scroll'          // 滚动
  | 'navigate'        // 导航
  | 'wait'            // 等待
  | 'extract'         // 提取数据
  | 'screenshot'      // 截图
  | 'fillForm'        // 表单填充
  | 'dragDrop'        // 拖拽
  | 'copyText'        // 复制文本
  | 'pasteText'       // 粘贴文本
  | 'pressKey'        // 按键
  | 'waitUntilVisible' // 等待元素可见
  | 'waitUntilHidden'  // 等待元素隐藏
  | 'waitForLoad'      // 等待页面加载
  | 'waitForNetworkIdle'; // 等待网络空闲

export interface DOMAction {
  type: DOMActionType;
  target: string; // 确定性引用 [ref=e14] 或 CSS selector
  args?: Record<string, unknown>;
  retry?: RetryStrategy;
  confidence?: number;  // AI 置信度
  requiresConfirmation?: boolean;  // 是否需要二次确认
  variables?: Record<string, string>;  // 敏感数据变量（替代明文）
}

export interface RetryStrategy {
  maxRetries: number;
  backoff: 'linear' | 'exponential' | 'constant';
  initialDelay: number;
  jitter: boolean;  // 添加随机抖动避免雪崩
}

export interface SafetyBoundary {
  forbiddenActions: DOMActionType[];      // 绝对禁止的操作
  requiresConfirmation: DOMActionType[];  // 需要二次确认
  humanInLoopThreshold: number;           // 低于此置信度必须人工介入
  maxElementsPerScan: number;             // 单次扫描最大元素数
  timeoutMs: number;                      // 操作超时时间
}

export interface SensitiveDataConfig {
  maskFields: string[];       // 需要脱敏的字段名（password, email, phone 等）
  useVariables: boolean;      // 是否使用变量替代明文
  logSanitization: boolean;   // 日志脱敏
}

export class DOMExecutor {
  private registry: Map<string, DOMHandler> = new Map();
  private safetyBoundary: SafetyBoundary;
  private sensitiveConfig: SensitiveDataConfig;
  
  async execute(action: DOMAction, context: PageContext): Promise<DOMResult> {
    // 1. 安全边界检查
    if (this.isForbidden(action)) {
      throw new DOMSecurityError(`Action ${action.type} is forbidden`);
    }
    
    // 2. 敏感数据脱敏
    this.sanitizeArgs(action);
    
    // 3. 确认检查
    if (this.needsConfirmation(action)) {
      const confirmed = await this.requestConfirmation(action);
      if (!confirmed) {
        return { success: false, error: 'User declined' };
      }
    }
    
    // 4. 置信度检查
    if (action.confidence && action.confidence < this.safetyBoundary.humanInLoopThreshold) {
      return { success: false, error: 'Confidence too low', needsHumanIntervention: true };
    }
    
    // 5. 执行 + 重试
    const handler = this.registry.get(action.type);
    if (!handler) {
      return { success: false, error: `Unsupported action type: ${action.type}` };
    }
    
    const strategy = action.retry || this.defaultRetry;
    return this.executeWithRetry(handler, action, context, strategy);
  }
  
  private sanitizeArgs(action: DOMAction): void {
    if (!this.sensitiveConfig.maskFields || !action.args) return;
    
    for (const field of this.sensitiveConfig.maskFields) {
      if (action.args[field]) {
        if (this.sensitiveConfig.logSanitization) {
          action.args[field] = '[REDACTED]';
        }
        if (this.sensitiveConfig.useVariables && action.variables?.[field]) {
          action.args[field] = action.variables[field];
        }
      }
    }
  }
  
  private executeWithRetry(
    handler: DOMHandler,
    action: DOMAction,
    context: PageContext,
    strategy: RetryStrategy
  ): Promise<DOMResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
      try {
        const result = await handler(action, context);
        return { success: true, data: result };
      } catch (error) {
        lastError = error;
        if (attempt < strategy.maxRetries) {
          const delay = this.calculateBackoff(strategy, attempt);
          await this.sleep(delay);
        }
      }
    }
    
    return { success: false, error: lastError?.message };
  }
  
  private calculateBackoff(strategy: RetryStrategy, attempt: number): number {
    const baseDelay = strategy.initialDelay * Math.pow(2, attempt);
    const jitter = strategy.jitter ? Math.random() * 1000 : 0;
    return baseDelay + jitter;
  }
}
```

### 4.3 DOM Perception Engine（DOM 感知引擎）

**职责**：基于 Accessibility Tree 采集、理解、序列化页面 DOM 状态

```typescript
// src/content/dom-perception.ts

/**
 * 核心改进：使用 Chrome Accessibility Tree 而非原始 DOM
 * 优势：
 * 1. 天然过滤非交互元素
 * 2. 提供语义化信息（role, name, state）
 * 3. Token 效率高（2-5KB vs 原始 DOM 10-100KB）
 * 4. 跨布局变化保持稳定
 */

export interface DOMSnapshot {
  snapshotId: string;
  timestamp: number;
  url: string;
  title: string;
  /** 确定性引用树（替代原始 DOM 数组） */
  tree: AccessibilityNode[];
  /** 元素映射表（ref → element） */
  elementMap: Map<string, DOMElement>;
  structure: DOMStructure;
  performance: DOMPerformance;
  fingerprint: string;  // 页面指纹（用于快速识别页面变化）
}

/**
 * 可访问性树节点 - 业界标准格式
 */
export interface AccessibilityNode {
  ref: string;              // 确定性引用 [ref=e1]
  role: string;             // button, textbox, link 等
  name: string;             // 可访问名称
  value?: string;           // 当前值
  state?: Record<string, boolean>;  // checked, selected, expanded 等
  children: AccessibilityNode[];
  /** 对应的 DOMElement 详情 */
  element?: DOMElement;
}

export interface DOMElement {
  elementId: string;
  ref: string;           // [ref=e1] AI 使用的确定性引用
  xpath: string;
  cssSelector: string;
  tagName: string;
  attributes: Record<string, string>;
  textContent: string;
  rect: DOMRect;
  ariaLabel?: string;
  role?: string;
  visible: boolean;
  enabled: boolean;
  interactive: boolean;
  parentId?: string;
  index: number;  // 在页面中的索引（用于增量更新）
}

export interface DOMStructure {
  depth: number;
  totalElements: number;
  interactiveElements: number;  // 可交互元素数
  formFields: number;
  buttons: number;
  links: number;
  images: number;
  iframes: number;
}

export interface DOMPerformance {
  scanTime: number;      // 扫描耗时 ms
  elementCount: number;  // 元素数量
  memoryUsage: number;   // 内存占用 bytes
  tokenEstimate: number; // 预估 Token 数
}

export interface DifferentialSnapshot {
  added: DOMElement[];
  removed: DOMElement[];
  modified: DOMElement[];
  unchanged: number;
}

export interface ContextOptimization {
  maxTokensPerSnapshot: number;    // 默认 4000
  compressNonInteractive: boolean; // 默认 true
  selectiveExtraction: boolean;    // 默认 true
  chunkStrategy: 'by-element' | 'by-section' | 'by-depth';
}

export class DOMPerceptionEngine {
  private cache: Map<string, DOMSnapshot> = new Map();
  private performanceBudget: PerformanceBudget;
  private contextOptimization: ContextOptimization;
  
  // 全量快照采集 - 基于 Accessibility Tree
  async captureFullSnapshot(tabId: number): Promise<DOMSnapshot> {
    const startTime = Date.now();
    
    // 1. 安全检查
    this.checkPerformanceBudget();
    
    // 2. 采集 Accessibility Tree（替代原始 DOM 扫描）
    const tree = await this.captureAccessibilityTree(tabId);
    
    // 3. 构建元素映射表
    const elementMap = this.buildElementMap(tree);
    
    // 4. 分析结构
    const structure = this.analyzeStructure(tree);
    
    // 5. 计算性能指标
    const scanTime = Date.now() - startTime;
    const performance = {
      scanTime,
      elementCount: elementMap.size,
      memoryUsage: this.estimateMemoryUsage(tree),
      tokenEstimate: this.estimateTokens(tree),
    };
    
    // 6. 生成指纹
    const fingerprint = this.generateFingerprint(tree);
    
    const snapshot: DOMSnapshot = {
      snapshotId: generateId(),
      timestamp: Date.now(),
      url: window.location.href,
      title: document.title,
      tree,
      elementMap,
      structure,
      performance,
      fingerprint,
    };
    
    // 7. 缓存
    this.cacheSnapshot(snapshot);
    
    return snapshot;
  }
  
  /**
   * 采集 Accessibility Tree - 业界最佳实践
   * 使用 Chrome DevTools Protocol 或原生 API 获取可访问性树
   */
  private async captureAccessibilityTree(tabId: number): Promise<AccessibilityNode[]> {
    // 方案 A：使用 CDP Accessibility 域（推荐）
    // const tree = await cdp('Accessibility.getFullAXTree');
    
    // 方案 B：使用原生 getComputedRole/getAccessibleName
    const nodes: AccessibilityNode[] = [];
    const root = document.body;
    
    function traverse(node: Node, parentRef?: string): void {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        const name = el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 50);
        
        const ref = `e${nodes.length}`;
        nodes.push({
          ref: `[ref=${ref}]`,
          role,
          name: name || undefined,
          children: [],
          element: this.extractDOMElement(el, ref),
        });
        
        for (const child of el.children) {
          traverse(child, ref);
        }
      }
    }
    
    traverse(root);
    return nodes;
  }
  
  private buildElementMap(tree: AccessibilityNode[]): Map<string, DOMElement> {
    const map = new Map<string, DOMElement>();
    
    function traverse(nodes: AccessibilityNode[]): void {
      for (const node of nodes) {
        if (node.element) {
          map.set(node.ref, node.element);
        }
        if (node.children?.length > 0) {
          traverse(node.children);
        }
      }
    }
    
    traverse(tree);
    return map;
  }
  
  /**
   * 生成 AI 友好的快照文本 - Token 优化
   */
  generateSnapshotText(snapshot: DOMSnapshot): string {
    const maxTokens = this.contextOptimization.maxTokensPerSnapshot;
    
    // 选择性提取：只包含交互元素
    if (this.contextOptimization.compressNonInteractive) {
      const interactiveNodes = snapshot.tree.filter(node => node.role === 'button' 
        || node.role === 'textbox' 
        || node.role === 'link'
        || node.role === 'checkbox'
        || node.role === 'combobox');
      
      return this.serializeNodes(interactiveNodes, maxTokens);
    }
    
    return this.serializeNodes(snapshot.tree, maxTokens);
  }
  
  private serializeNodes(nodes: AccessibilityNode[], maxTokens: number): string {
    let result = '';
    let tokenCount = 0;
    
    function serialize(node: AccessibilityNode, depth: number): void {
      if (tokenCount >= maxTokens) return;
      
      const indent = '  '.repeat(depth);
      const line = `${indent}${node.ref} ${node.role}: "${node.name || ''}"`;
      result += line + '\n';
      tokenCount += line.split(' ').length;
      
      if (node.children) {
        for (const child of node.children) {
          serialize(child, depth + 1);
        }
      }
    }
    
    for (const node of nodes) {
      serialize(node, 0);
    }
    
    return result.trim();
  }
  
  // 增量更新（变化检测）
  async captureIncrementalSnapshot(
    previous: DOMSnapshot
  ): Promise<DifferentialSnapshot> {
    const current = await this.captureFullSnapshot();
    return this.computeDifferences(previous, current);
  }
  
  // 语义查找（辅助 AI 定位元素）
  async findElements(
    ref: string,
    options?: FindOptions
  ): Promise<DOMElement | null> {
    // 支持确定性引用查找
    // 示例：[ref=e14] → DOMElement
    return this.elementMap.get(ref) || null;
  }
  
  private checkPerformanceBudget(): void {
    if (this.memoryUsage > this.performanceBudget.maxMemory) {
      this.evictOldestSnapshots();
    }
    if (this.elementCount > this.performanceBudget.maxElements) {
      throw new DOMPerformanceError('Too many elements, using lazy loading');
    }
  }
}
```

### 4.4 Command Router（命令路由器）

**职责**：将 AI 决策映射到具体 DOM 操作

```typescript
// src/service-worker/dom-command-router.ts

export interface CommandMapping {
  aiIntent: string;
  action: DOMAction;
  confidence: number;
  requiresConfirmation?: boolean;
}

export interface AIDecision {
  intent: string;
  actions: DOMAction[];
  confidence: number;
  reasoning: string;
  needsConfirmation?: boolean;
}

export class CommandRouter {
  private mappings: CommandMapping[] = [];
  
  mapIntentToAction(aiDecision: AIDecision): DOMAction | null {
    // AI 输出结构化决策 → DOM 操作映射
    // 示例：
    // AI: "点击页面上的"确认"按钮"
    // → DOMAction: { type: 'click', target: '[ref=e14]', confidence: 0.92 }
    
    if (aiDecision.confidence < 0.7) {
      return null;  // 置信度太低，请求人工确认
    }
    
    // 原子性检查
    if (aiDecision.actions.length > 1) {
      return aiDecision.actions[0];  // 只取第一个操作
    }
    
    return aiDecision.actions[0] || null;
  }
}
```

### 4.6 Service Worker Persistence（Service Worker 持久化）

**职责**：管理 Service Worker 状态持久化和定时任务

```typescript
// src/service-worker/sw-persistence.ts

export interface SWState {
  sessions: Record<string, AgentSession>;
  config: DOMConfig;
  lastActiveTab: number | null;
  initializedAt: number;
}

export class ServiceWorkerPersistence {
  private state: SWState;
  
  constructor() {
    this.state = {
      sessions: {},
      config: defaultConfig,
      lastActiveTab: null,
      initializedAt: Date.now(),
    };
  }
  
  /**
   * 初始化时从 storage 恢复状态
   */
  async initialize(): Promise<void> {
    const saved = await chrome.storage.local.get(['swState']);
    if (saved.swState) {
      this.state = { ...this.state, ...saved.swState };
    }
  }
  
  /**
   * 持久化状态到 storage
   */
  async persist(): Promise<void> {
    await chrome.storage.local.set({ swState: this.state });
  }
  
  /**
   * 注册定时任务（替代 setInterval）
   */
  async registerIdleCheck(intervalMinutes: number = 5): Promise<void> {
    await chrome.alarms.create('idleCheck', {
      periodInMinutes: intervalMinutes,
    });
  }
  
  /**
   * 获取活跃 session
   */
  getActiveSession(sessionId: string): AgentSession | undefined {
    return this.state.sessions[sessionId];
  }
  
  /**
   * 更新 session
   */
  updateSession(session: AgentSession): void {
    this.state.sessions[session.sessionId] = session;
    this.persist();
  }
}
```

### 4.8 Decision Cache（决策缓存引擎）← Stagehand V3 核心特性

**职责**：缓存 LLM 决策，避免重复 Token 消耗

```typescript
// src/service-worker/decision-cache.ts

export interface CacheEntry {
  key: string;           // hash(DOM + Instruction)
  llmResult: unknown;    // LLM 输出结果
  timestamp: number;
  ttl: number;           // 缓存有效期
}

export class DecisionCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number = 1000;
  
  /**
   * 生成缓存键
   */
  generateKey(domHash: string, instruction: string): string {
    return `${domHash}_${this.hashString(instruction)}`;
  }
  
  /**
   * 获取缓存结果
   */
  get(key: string): unknown | null {
    const entry = this.cache.get(key);
    if (!entry || Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.llmResult;
  }
  
  /**
   * 设置缓存
   */
  set(key: string, result: unknown, ttlMs: number = 3600000): void {
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }
    this.cache.set(key, {
      key,
      llmResult: result,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }
  
  /**
   * 安全脱敏 - 确保 PII 不包含在缓存中
   */
  sanitizeResult(result: unknown): unknown {
    // 移除密码、密钥等敏感字段
    return JSON.parse(
      JSON.stringify(result).replace(/"password"\s*:\s*"[^"]*"/g, '"password": "[REDACTED]"')
    );
  }
  
  private evictOldest(): void {
    let oldestKey = '';
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    this.cache.delete(oldestKey);
  }
  
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return hash.toString(16);
  }
}
```

### 4.9 Network Interceptor（网络拦截器）← Stagehand V4 优化

**职责**：拦截无网络流量，减少页面噪声

```typescript
// src/service-worker/network-interceptor.ts

export interface NetworkFilterConfig {
  patterns: string[];       // 需要拦截的模式
  action: 'block' | 'allow'; // 拦截动作
}

export class NetworkInterceptor {
  private filters: NetworkFilterConfig[] = [];
  
  /**
   * 注册拦截规则
   */
  register(pattern: string, action: 'block' | 'allow' = 'block'): void {
    this.filters.push({ patterns: [pattern], action });
  }
  
  /**
   * 批量注册 - 阻塞常见无网络流量
   */
  registerCommonFilters(): void {
    // 阻塞分析跟踪
    this.register('*analytics*', 'block');
    this.register('*tracking*', 'block');
    this.register('*telemetry*', 'block');
    
    // 阻塞广告
    this.register('*ad*', 'block');
    this.register('*advertisement*', 'block');
    
    // 阻塞字体和媒体（减少加载时间）
    this.register('*font*', 'block');
    this.register('*media*', 'block');
  }
  
  /**
   * 检查是否需要拦截
   */
  shouldBlock(url: string): boolean {
    return this.filters.some(f => 
      f.patterns.some(pattern => url.includes(pattern.replace('*', '')))
    );
  }
}
```

### 4.10 Vibe Score Estimator（页面稳定性检测）← Stagehand V4 优化

**职责**：检测页面是否稳定，避免在动态加载时操作

```typescript
// src/service-worker/vibe-score.ts

export interface VibeScore {
  layoutStability: number;  // 布局稳定性 (0-1)
  domSettled: boolean;      // DOM 是否稳定
  networkIdle: boolean;     // 网络是否空闲
  overallScore: number;     // 综合评分
}

export class VibeScoreEstimator {
  /**
   * 计算页面稳定性评分
   */
  async calculateScore(): Promise<VibeScore> {
    const startTime = Date.now();
    
    // 1. 检测布局稳定性
    const layoutStability = await this.measureLayoutStability();
    
    // 2. 检测 DOM 是否稳定
    const domSettled = await this.checkDOMSettled();
    
    // 3. 检测网络状态
    const networkIdle = await this.checkNetworkIdle();
    
    // 4. 计算综合评分
    const overallScore = (layoutStability + (domSettled ? 1 : 0) + (networkIdle ? 1 : 0)) / 3;
    
    return {
      layoutStability,
      domSettled,
      networkIdle,
      overallScore,
    };
  }
  
  /**
   * 测量布局稳定性（基于 CLS）
   */
  private async measureLayoutStability(): Promise<number> {
    // 使用 Performance API 检测 Cumulative Layout Shift
    const entries = performance.getEntriesByType('layout-shift') as PerformanceLayoutShiftEntry[];
    const totalShift = entries.reduce((sum, entry) => sum + entry.value, 0);
    return Math.max(0, 1 - totalShift); // 转换为稳定性分数
  }
  
  /**
   * 检测 DOM 是否稳定
   */
  private async checkDOMSettled(): Promise<boolean> {
    // 检测是否有正在进行的 DOM 变更
    return new Promise(resolve => {
      let mutationCount = 0;
      const observer = new MutationObserver(() => {
        mutationCount++;
      });
      observer.observe(document.body, { childList: true, subtree: true });
      
      setTimeout(() => {
        observer.disconnect();
        resolve(mutationCount < 10); // 如果短时间内变更少于 10 次，认为稳定
      }, 500);
    });
  }
  
  /**
   * 检测网络是否空闲
   */
  private async checkNetworkIdle(): Promise<boolean> {
    // 使用 Network Information API
    const connection = navigator.connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    if (connection) {
      return connection.saveData || connection.effectiveType === '4g';
    }
    return true; // 无法检测时默认空闲
  }
}
```

### 4.7 Tab Manager（多标签页管理器）

**职责**：操作失败时自动诊断并生成替代方案

```typescript
// src/service-worker/self-healing.ts

export interface FailureAnalysis {
  rootCause: string;
  suggestedActions: DOMAction[];
  confidence: number;
}

export class SelfHealingEngine {
  /**
   * 诊断操作失败原因
   */
  diagnoseFailure(action: DOMAction, error: DOMError): FailureAnalysis {
    switch (error.type) {
      case DOMErrorType.ELEMENT_NOT_FOUND:
        return {
          rootCause: 'Element not found or changed',
          suggestedActions: [
            { type: 'waitUntilVisible', target: action.target, args: { timeout: 5000 } },
            { type: 'snapshot', args: {} },  // 重新获取快照
          ],
          confidence: 0.8,
        };
      
      case DOMErrorType.ELEMENT_NOT_INTERACTIVE:
        return {
          rootCause: 'Element not yet interactive',
          suggestedActions: [
            { type: 'wait', args: { ms: 1000 } },
            { ...action, retry: { maxRetries: 2, backoff: 'exponential', initialDelay: 500 } },
          ],
          confidence: 0.7,
        };
      
      case DOMErrorType.TIMEOUT:
        return {
          rootCause: 'Operation timeout',
          suggestedActions: [
            { type: 'snapshot', args: {} },  // 检查当前页面状态
          ],
          confidence: 0.6,
        };
      
      default:
        return {
          rootCause: error.message,
          suggestedActions: [],
          confidence: 0.5,
        };
    }
  }
  
  /**
   * 自动自愈执行
   */
  async selfHeal(
    action: DOMAction,
    executor: DOMExecutor,
    maxAttempts: number = 3
  ): Promise<DOMResult> {
    let lastError: DOMError | null = null;
    
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      try {
        return await executor.execute(action);
      } catch (error) {
        lastError = error as DOMError;
        
        if (attempt < maxAttempts) {
          // 诊断并生成替代方案
          const analysis = this.diagnoseFailure(action, lastError);
          
          if (analysis.suggestedActions.length > 0) {
            // 尝试替代方案
            const alternative = analysis.suggestedActions[0];
            console.log(`Self-healing: trying alternative action ${alternative.type}`);
            action = alternative;
          } else {
            break;  // 无替代方案，放弃
          }
        }
      }
    }
    
    return { success: false, error: lastError?.message };
  }
}
```

### 4.6 Configuration Center（配置中心）

**职责**：管理运行时配置、权限、安全策略

```typescript
// src/shared/config-manager.ts

export interface DOMConfig {
  // 性能配置
  performance: {
    maxElementsPerScan: number;    // 默认 5000
    snapshotTTL: number;           // 默认 60000ms
    maxMemoryMB: number;           // 默认 50
    maxTokensPerSnapshot: number;  // 默认 4000
  };
  
  // 安全配置
  safety: {
    forbiddenActions: DOMActionType[];
    requiresConfirmation: DOMActionType[];
    humanInLoopThreshold: number;  // 默认 0.7
  };
  
  // 原子操作配置
  atomic: {
    maxActionsPerStep: number;     // 默认 1
    requireSingleElement: boolean; // 默认 true
  };
  
  // 敏感数据配置
  sensitiveData: {
    maskFields: string[];          // 默认 ['password', 'email', 'phone']
    useVariables: boolean;         // 默认 true
    logSanitization: boolean;      // 默认 true
  };
  
  // 重试配置
  retry: {
    maxRetries: number;            // 默认 3
    backoffStrategy: 'linear' | 'exponential';
    initialDelayMs: number;        // 默认 100
    jitter: boolean;               // 默认 true
  };
  
  // 权限配置
  permissions: {
    requiredScopes: string[];
    domainAllowList: string[];
    domainBlockList: string[];
  };
}

export class ConfigManager {
  private config: DOMConfig;
  private listeners: Set<() => void> = new Set();
  
  // 加载配置
  async load(): Promise<DOMConfig> {
    // 从 extension storage 或 remote config 加载
  }
  
  // 热更新
  update(newConfig: Partial<DOMConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.notifyListeners();
  }
  
  // 订阅变化
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

### 4.11 Agent Communication Protocol（Agent 通信协议）← 新增

**职责**：定义多 Agent 间的通信机制

```typescript
// src/service-worker/agent-protocol.ts

/**
 * Agent 间通信消息格式
 */
export interface AgentMessage {
  type: 'request' | 'response' | 'event' | 'error';
  from: string;      // 发送者 Agent ID
  to: string;        // 接收者 Agent ID
  messageId: string; // 唯一消息 ID
  timestamp: number;
  payload: unknown;
}

/**
 * Agent 间状态共享接口
 */
export interface SharedState {
  currentUrl: string;
  currentSnapshot?: DOMSnapshot;
  activeSessionId?: string;
  pendingActions: DOMAction[];
}

/**
 * Agent 通信管理器
 */
export class AgentProtocol {
  private agents: Map<string, AgentInstance> = new Map();
  private messageQueue: AgentMessage[] = [];
  
  /**
   * 注册 Agent
   */
  register(agentId: string, agent: AgentInstance): void {
    this.agents.set(agentId, agent);
  }
  
  /**
   * 发送消息
   */
  async send(message: AgentMessage): Promise<void> {
    this.messageQueue.push(message);
    await this.dispatch(message);
  }
  
  /**
   * 分发消息
   */
  private async dispatch(message: AgentMessage): Promise<void> {
    const target = this.agents.get(message.to);
    if (target) {
      await target.receive(message);
    }
  }
  
  /**
   * 广播事件
   */
  broadcast(event: string, payload: unknown): void {
    const message: AgentMessage = {
      type: 'event',
      from: 'system',
      to: '*',  // 通配符表示广播
      messageId: generateId(),
      timestamp: Date.now(),
      payload: { event, data: payload },
    };
    this.dispatch(message);
  }
}

/**
 * Agent 实例接口
 */
export interface AgentInstance {
  id: string;
  role: 'perception' | 'executor' | 'verifier' | 'planner';
  receive(message: AgentMessage): Promise<void>;
  getState(): SharedState;
}
```

---

## 5. 数据模型

### 5.1 DOMSnapshot（基于 Accessibility Tree）
```typescript
interface DOMSnapshot {
  snapshotId: string;
  timestamp: number;
  url: string;
  title: string;
  tree: AccessibilityNode[];           // 确定性引用树
  elementMap: Map<string, DOMElement>; // ref → element 映射
  structure: DOMStructure;
  performance: DOMPerformance;
  fingerprint: string;
}

interface AccessibilityNode {
  ref: string;              // [ref=e1] 确定性引用
  role: string;             // button, textbox, link
  name: string;             // 可访问名称
  value?: string;
  state?: Record<string, boolean>;
  children: AccessibilityNode[];
  element?: DOMElement;
}
```

### 5.2 DOMAction
```typescript
interface DOMAction {
  type: DOMActionType;
  target: string;           // [ref=e14] 确定性引用
  args?: Record<string, unknown>;
  retry?: RetryStrategy;
  confidence?: number;
  requiresConfirmation?: boolean;
  variables?: Record<string, string>;  // 敏感数据变量
}
```

### 5.3 AgentSession
```typescript
interface AgentSession {
  sessionId: string;
  taskId: string;
  agent: 'perception' | 'executor' | 'verifier' | 'planner';
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  createdAt: number;
  updatedAt: number;
  stepHistory: AgentStep[];
  memory?: {
    shortTerm: string[];
    longTerm: string[];
  };
}
```

---

## 6. 执行流程

### 6.1 单步操作
```
用户输入 → AI 解析 → CommandRouter 映射 → 安全边界检查 → 原子性检查 → DOMExecutor 执行 → 结果返回
```

### 6.2 任务规划
```
用户输入 → TaskPlanner 解析 → 任务分解 → 循环执行 → 验证结果
```

### 6.3 批量操作
```
多个 DOMAction → batchExecute → 事务管理 → 统一结果返回
```

### 6.4 带自愈的执行
```
AI 决策 → 执行 → 失败？→ Self-Healing 诊断 → 生成替代方案 → 重试 → 验证结果
```

### 6.5 AI 提示词规范
```
# 元素描述规范
✅ 正确：click the "Sign In" button
❌ 错误：click the blue button

# 动作动词规范
✅ 正确：click, type, select, check, upload
❌ 错误：press, choose, hit

# 敏感数据处理
✅ 正确：enter %username% in the email field（使用变量）
❌ 错误：type 'secret123' into password field（明文）
```

---

## 7. 内容脚本设计

### 7.1 按需注入（Lazy Loading）与生命周期管理

```javascript
// src/content/dom-perception.js

class DOMPerceptionContentScript {
  constructor() {
    this.enabled = false;
    this.observer = null;
    this.tabId = null;
    this.lastActivity = Date.now();
    this.idleTimeout = 5 * 60 * 1000;  // 5 分钟无活动自动卸载
  }
  
  // 接收到消息后按需启用
  async enable(tabId) {
    if (this.enabled && this.tabId === tabId) {
      this.resetIdleTimer();
      return;
    }
    
    this.tabId = tabId;
    this.enabled = true;
    this.setupMutationObserver();
    this.setupMessageListener();
    this.startIdleDetector();
  }
  
  // 检测到无活动时自动卸载
  async disable() {
    this.enabled = false;
    this.observer?.disconnect();
    this.idleDetector?.clearInterval();
    this.tabId = null;
  }
  
  setupMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      if (!this.enabled) return;
      this.onDOMChange(mutations);
    });
    this.observer.observe(document.body, {
      childList: true,
      attributes: true,
      subtree: true,
    });
  }
  
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'PAGE_SCAN') {
        this.handlePageScan(message, sendResponse);
      }
    });
  }
  
  startIdleDetector() {
    this.idleDetector = setInterval(() => {
      if (Date.now() - this.lastActivity > this.idleTimeout) {
        this.disable();
      }
    }, 60000);  // 每分钟检查一次
  }
  
  resetIdleTimer() {
    this.lastActivity = Date.now();
  }
  
  private onDOMChange(mutations) {
    // 触发增量快照更新
    this.triggerIncrementalUpdate();
  }
}
```

### 7.2 官方 Content Script 注册 API（MV3 推荐）
```javascript
// src/content/dom-perception.js

class DOMPerceptionContentScript {
  constructor() {
    this.enabled = false;
    this.observer = null;
    this.tabId = null;
    this.lastActivity = Date.now();
    this.idleTimeout = 5 * 60 * 1000;  // 5 分钟无活动自动卸载
  }

### 7.3 多标签页协调

```typescript
// Service Worker 维护 Content Script 实例池
class ContentScriptPool {
  private pools: Map<number, DOMPerceptionContentScript> = new Map();
  
  async getOrCreate(tabId: number): Promise<DOMPerceptionContentScript> {
    if (this.pools.has(tabId)) {
      return this.pools.get(tabId)!;
    }
    
    const script = new DOMPerceptionContentScript();
    await this.injectScript(tabId, script);
    this.pools.set(tabId, script);
    return script;
  }
  
  private async injectScript(tabId: number, script: DOMPerceptionContentScript) {
    // 使用官方 API
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/dom-perception.js'],
      world: 'MAIN',
    });
    script.enable(tabId);
  }
}

// 注意：Content Script 通过 runtime.sendMessage 与 Service Worker 通信
// 避免使用 runtime.connect（长连接不可靠）
```

### 7.4 iframe 和 Shadow DOM 处理

```javascript
// 递归遍历 iframe 和 shadow DOM
async function traverseNestedDOM(root, depth = 0) {
  const MAX_DEPTH = 5;
  if (depth > MAX_DEPTH) return;
  
  // 处理当前节点的 shadow DOM
  if (root.shadowRoot) {
    await traverseNestedDOM(root.shadowRoot, depth + 1);
  }
  
  // 处理 iframe
  const iframes = root.querySelectorAll('iframe');
  for (const iframe of iframes) {
    try {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (iframeDoc) {
        await traverseNestedDOM(iframeDoc.body, depth + 1);
      }
    } catch (e) {
      // 跨域 iframe 无法访问，跳过
      console.warn('Cross-origin iframe skipped');
    }
  }
}
```

---

## 8. 权限与安全

### 8.1 权限矩阵
| 操作类型 | 需要权限 | 危险级别 | 默认策略 |
|---------|---------|---------|---------|
| click | `activeTab` | 低 | 自动执行 |
| type | `activeTab` | 低 | 自动执行 |
| hover | `activeTab` | 低 | 自动执行 |
| select | `activeTab` | 低 | 自动执行 |
| scroll | `activeTab` | 低 | 自动执行 |
| navigate | `tabs` + `activeTab` | 中 | 二次确认 |
| wait | `activeTab` | 低 | 自动执行 |
| extract | `activeTab` | 低 | 自动执行 |
| screenshot | `activeTab` | 低 | 自动执行 |
| fillForm | `activeTab` | 中 | 二次确认 |
| dragDrop | `activeTab` | 中 | 二次确认 |
| copyText | `activeTab` | 低 | 自动执行 |
| pasteText | `activeTab` | 中 | 二次确认 |
| pressKey | `activeTab` | 低 | 自动执行 |
| waitUntilVisible | `activeTab` | 低 | 自动执行 |
| waitUntilHidden | `activeTab` | 低 | 自动执行 |
| waitForLoad | `tabs` | 低 | 自动执行 |
| waitForNetworkIdle | `tabs` | 低 | 自动执行 |

### 8.2 安全边界
```typescript
const SAFETY_BOUNDARY: SafetyBoundary = {
  forbiddenActions: [],  // 暂不禁止，依赖用户配置
  requiresConfirmation: ['navigate', 'fillForm', 'dragDrop', 'pasteText'],
  humanInLoopThreshold: 0.7,
  maxElementsPerScan: 5000,
  timeoutMs: 30000,
};

const ATOMIC_CONSTRAINT: AtomicConstraint = {
  maxActionsPerStep: 1,
  allowComplexSequences: false,
  requireSingleElement: true,
};

const SENSITIVE_CONFIG: SensitiveDataConfig = {
  maskFields: ['password', 'email', 'phone', 'credit_card'],
  useVariables: true,
  logSanitization: true,
};
```

### 8.3 安全隔离
- Content Script 仅在授权域名下注入
- 域名白名单/黑名单机制
- CSP 降级策略：禁用时仅读取只读信息
- 敏感操作二次确认
- 操作日志审计
- **敏感数据自动脱敏**

### 8.4 CSP 降级策略
```typescript
enum CSPMode {
  FULL = 'full',        // 完整功能
  READ_ONLY = 'read_only',  // 仅读取
  DISABLED = 'disabled'   // 完全禁用
}

class CSPFallback {
  async detectCSP(tabId: number): Promise<CSPMode> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: () => 'test',
        world: 'MAIN',
      });
      return CSPMode.FULL;
    } catch (error) {
      if (error.message?.includes('Content Security Policy')) {
        return CSPMode.READ_ONLY;
      }
      return CSPMode.DISABLED;
    }
  }
}
```

---

## 9. 错误处理与重试

### 9.1 重试策略矩阵
| 错误类型 | 重试策略 | 说明 |
|---------|---------|------|
| ELEMENT_NOT_FOUND | 等淡后重试 | 元素可能正在加载 |
| ELEMENT_NOT_INTERACTIVE | 等待后重试 | 元素可能正在动画 |
| TIMEOUT | 缩短超时重试 | 可能是网络延迟 |
| PERMISSION_DENIED | 不重试 | 权限问题需用户介入 |
| CSP_VIOLATION | 降级为只读 | 无法恢复，切换模式 |
| NAVIGATION_FAILED | 不重试 | 导航失败需重新规划 |
| ATOMIC_VIOLATION | 分解重试 | 拆分为单步操作 |

### 9.2 重试实现
```typescript
interface RetryStrategy {
  maxRetries: number;
  backoff: 'linear' | 'exponential' | 'constant';
  initialDelay: number;
  jitter: boolean;  // 添加随机抖动避免雪崩
}

class RetryHandler {
  async executeWithRetry(
    operation: () => Promise<T>,
    strategy: RetryStrategy
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= strategy.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < strategy.maxRetries) {
          const delay = this.calculateBackoff(strategy, attempt);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }
  
  private calculateBackoff(strategy: RetryStrategy, attempt: number): number {
    const baseDelay = strategy.initialDelay * Math.pow(2, attempt);
    const jitter = strategy.jitter ? Math.random() * 1000 : 0;
    return baseDelay + jitter;
  }
}
```

---

## 10. 性能优化

### 10.1 性能预算
```typescript
interface PerformanceBudget {
  maxElementsPerScan: number;    // 5000
  maxScanTimeMs: number;         // 200ms
  maxMemoryMB: number;           // 50MB
  maxConcurrentScans: number;    // 3
  maxTokensPerSnapshot: number;  // 4000
}
```

### 10.2 快照缓存
```typescript
class SnapshotCache {
  private cache: Map<string, DOMSnapshot> = new Map();
  private maxSize: number;
  
  get(key: string): DOMSnapshot | null {
    const snapshot = this.cache.get(key);
    if (!snapshot || Date.now() - snapshot.timestamp > snapshotTTL) {
      this.cache.delete(key);
      return null;
    }
    return snapshot;
  }
  
  set(key: string, snapshot: DOMSnapshot): void {
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    this.cache.set(key, snapshot);
  }
  
  private evictOldest(): void {
    let oldestKey = '';
    let oldestTime = Infinity;
    
    for (const [key, snapshot] of this.cache) {
      if (snapshot.timestamp < oldestTime) {
        oldestTime = snapshot.timestamp;
        oldestKey = key;
      }
    }
    
    this.cache.delete(oldestKey);
  }
}
```

### 10.3 懒加载与流式处理
```typescript
async function* streamElements(tabId: number): AsyncGenerator<AccessibilityNode[]> {
  // 分批处理大页面，避免一次性加载过多元素
  const batchSize = 500;
  let offset = 0;
  
  while (true) {
    const batch = await scanBatch(tabId, offset, batchSize);
    if (batch.length === 0) break;
    yield batch;
    offset += batchSize;
  }
}
```

### 10.5 浏览器状态持久化

```typescript
// 保存和恢复浏览器状态（cookies、localStorage）
interface BrowserState {
  cookies: chrome.cookies.Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

class StatePersistence {
  async saveState(tabId: number): Promise<BrowserState> {
    // 使用 Playwright 或 CDP 保存状态
    // 参考：browser-use 的状态持久化机制
  }
  
  async restoreState(tabId: number, state: BrowserState): Promise<void> {
    // 恢复之前保存的状态
  }
}
```
### 10.4 Token 优化策略
```typescript
interface ContextOptimization {
  maxTokensPerSnapshot: number;    // 默认 4000
  compressNonInteractive: boolean; // 默认 true - 只保留交互元素
  selectiveExtraction: boolean;    // 默认 true - 按需提取
  chunkStrategy: 'by-element' | 'by-section' | 'by-depth';
}

// 使用示例
const optimizedText = engine.generateSnapshotText(snapshot);
// 输出示例：
// [ref=e1] button: "Sign In"
// [ref=e5] textbox: "Email"
// [ref=e8] checkbox: "Remember me"
```

---

## 11. 可观测性

### 11.1 审计日志
```typescript
interface OperationLog {
  logId: string;
  timestamp: number;
  action: DOMAction;
  result: DOMResult;
  duration: number;
  error?: string;
  sessionId: string;
  confidence?: number;
  retryCount?: number;
}

class Logger {
  private logs: OperationLog[] = [];
  private maxLogs: number = 1000;
  
  log(entry: OperationLog): void {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // 异步持久化
    this.persistLog(entry).catch(console.error);
  }
  
  private async persistLog(log: OperationLog): Promise<void> {
    // 写入 extension storage 或远程日志服务
  }
}
```

### 11.2 性能监控
```typescript
interface PerformanceMetrics {
  scanTime: number;
  parseTime: number;
  executeTime: number;
  memoryUsage: number;
  cacheHitRate: number;
  retryRate: number;
  errorRate: number;
  tokenUsage: number;  // Token 消耗统计
}

class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();
  
  record(metric: string, value: number): void {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(value);
  }
  
  getAvg(metric: string): number {
    const values = this.metrics.get(metric) || [];
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
```

### 11.3 告警机制
```typescript
interface Alert {
  type: 'performance' | 'error' | 'security';
  severity: 'low' | 'medium' | 'high';
  message: string;
  context?: Record<string, unknown>;
}

class AlertManager {
  private thresholds: Record<string, number> = {
    scanTime: 500,      // ms
    memoryUsage: 100,   // MB
    errorRate: 0.1,     // 10%
    tokenUsage: 8000,   // tokens
  };
  
  check(metrics: PerformanceMetrics): Alert[] {
    const alerts: Alert[] = [];
    
    if (metrics.scanTime > this.thresholds.scanTime) {
      alerts.push({
        type: 'performance',
        severity: 'medium',
        message: `Scan time ${metrics.scanTime}ms exceeds threshold`,
      });
    }
    
    if (metrics.tokenUsage > this.thresholds.tokenUsage) {
      alerts.push({
        type: 'performance',
        severity: 'low',
        message: `Token usage ${metrics.tokenUsage} exceeds limit`,
      });
    }
    
    return alerts;
  }
}
```

---

## 12. 测试策略

### 12.1 测试金字塔
```
        /\
       /  \      E2E 测试（真实浏览器场景）
      /----\
     /      \    集成测试（Content Script ↔ Service Worker）
    /--------\
   /          \  单元测试（各模块独立测试）
  /------------\
```

### 12.2 单元测试
```typescript
// tests/unit/dom-executor.test.ts
describe('DOMExecutor', () => {
  it('should retry on ELEMENT_NOT_FOUND', async () => {
    // 模拟元素暂时不可见，重试后成功
  });
  
  it('should block forbidden actions', async () => {
    // 验证安全边界
  });
  
  it('should request confirmation for high-risk actions', async () => {
    // 验证二次确认机制
  });
  
  it('should sanitize sensitive data', async () => {
    // 验证敏感数据脱敏
    const action = {
      type: 'type',
      target: '[ref=e5]',
      args: { text: 'secret123' },
      variables: { password: 'secret123' }
    };
    // 验证日志中不包含明文密码
  });
  
  it('should enforce atomic constraints', async () => {
    // 验证原子操作约束
  });
});
```

### 12.3 集成测试
```typescript
// tests/integration/content-script.test.ts
describe('Content Script', () => {
  it('should inject and enable on demand', async () => {
    // 测试按需注入
  });
  
  it('should capture accessibility snapshot', async () => {
    // 测试 A11y 快照采集
  });
  
  it('should generate deterministic refs', async () => {
    // 测试确定性引用生成
  });
});
```

### 12.4 E2E 测试
```typescript
// tests/e2e/agent-orchestrator.test.ts
describe('Agent Orchestrator', () => {
  it('should complete multi-step task', async () => {
    // 使用真实浏览器测试完整流程
  });
  
  it('should self-heal on failure', async () => {
    // 测试自愈机制
  });
});
```

### 12.6 决策缓存测试
```typescript
// tests/unit/decision-cache.test.ts
describe('DecisionCache', () => {
  it('should cache LLM decisions', async () => {
    // 验证缓存命中率
  });
  
  it('should sanitize sensitive data', async () => {
    // 验证 PII 脱敏
  });
  
  it('should evict oldest entries when full', async () => {
    // 验证 LRU 淘汰策略
  });
});
```

### 12.7 性能基准测试
```typescript
// tests/performance/snapshot-benchmark.ts
describe('Snapshot Performance', () => {
  it('should capture 1000 elements within 200ms', async () => {
    // 性能约束验证
  });
  
  it('should generate snapshot within 4000 tokens', async () => {
    // Token 约束验证
  });
});
```

---

## 13. 文件结构

```
src/
├── content/
│   ├── dom-perception.js            # 内容脚本（按需注入）
│   └── dom-perception.ts            # TypeScript 类型定义
├── service-worker/
│   ├── agent-orchestrator.ts        # 代理编排器
│   ├── dom-executor.ts              # DOM 执行器
│   ├── dom-command-router.ts        # 命令路由器
│   ├── self-healing.ts              # 自愈引擎（新增）
│   ├── sw-persistence.ts            # Service Worker 持久化（新增）
│   ├── tab-manager.ts               # 多标签页管理器（新增）
│   ├── decision-cache.ts            # 决策缓存（新增，Stagehand V3）
│   ├── network-interceptor.ts       # 网络拦截器（新增，Stagehand V4）
│   ├── vibe-score.ts                # 页面稳定性检测（新增）
│   ├── agent-protocol.ts            # Agent 通信协议（新增）
│   ├── task-planner.ts              # 任务规划器（保留，已清理旧 DOM 代码）
│   ├── executor.ts                  # 原有命令分发器（保留其他命令）
│   ├── index.ts                     # Service Worker 入口
│   └── config-manager.ts            # 配置中心
├── shared/
│   ├── commands.ts                  # 命令定义（保留，新增 DOM 命令）
│   ├── slash-commands.ts            # 斜杠命令（保留）
│   ├── prompts.ts                   # 提示词（保留）
│   ├── config-manager.ts            # 配置类型定义
│   └── types/
│       ├── dom.ts                   # DOM 相关类型
│       ├── agent.ts                 # Agent 相关类型
│       ├── safety.ts                # 安全相关类型
│       └── atomic.ts                # 原子操作类型（新增）
├── composables/
│   └── useAIEngine.ts               # AI 引擎（保留，集成新 DOM 能力）
└── tests/
    ├── unit/
    ├── integration/
    ├── e2e/
    └── performance/
```

---

## 14. 实施计划

### 阶段一：基础架构（2-3 周）
- [ ] 定义数据类型（`src/shared/types/dom.ts`, `safety.ts`, `atomic.ts`）
- [ ] 实现 `DOMPerceptionEngine`（`src/content/dom-perception.js`）
  - [ ] Accessibility Tree 采集
  - [ ] 确定性引用生成
  - [ ] Token 优化
  - [ ] iframe/shadow DOM 遍历
- [ ] 实现 `SnapshotCache` 和性能约束
- [ ] 实现 `DOMExecutor`（`src/service-worker/dom-executor.ts`）
- [ ] 实现重试策略
- [ ] 实现 `ServiceWorkerPersistence`（`src/service-worker/sw-persistence.ts`）
- [ ] 更新 `manifest.json`（content_scripts 配置）
- [ ] 编写单元测试和集成测试

### 阶段二：编排层（2-3 周）
- [ ] 实现 `ConfigManager`（`src/service-worker/config-manager.ts`）
- [ ] 实现 `TabManager`（`src/service-worker/tab-manager.ts`）
- [ ] 实现 `CommandRouter`（`src/service-worker/dom-command-router.ts`）
- [ ] 实现 `SelfHealingEngine`（`src/service-worker/self-healing.ts`）
- [ ] 实现 `AgentOrchestrator`（`src/service-worker/agent-orchestrator.ts`）
- [ ] 集成安全边界和确认机制
- [ ] 集成原子操作约束
- [ ] 集成敏感数据脱敏
- [ ] 集成到 `executor.ts` 命令分发
- [ ] 编写 E2E 测试

### 阶段三：AI 集成（1-2 周）
- [ ] 更新 `prompts.ts`（添加 DOM 操作工具描述 + 提示词规范）
- [ ] 更新 `useAIEngine.ts`（集成 scan/action 能力）
- [ ] 测试 AI → DOM 操作链路
- [ ] 优化提示词模板

### 阶段四：优化与生产化（1-2 周）
- [ ] 性能基准测试和优化
- [ ] 错误处理完善
- [ ] 安全审计
- [ ] 文档完善
- [ ] 发布准备

---

## 15. 技术选型

| 组件 | 技术方案 | 理由 |
|------|---------|------|
| **DOM 快照** | **Accessibility Tree** | 语义化、Token 高效、跨布局稳定 |
| **元素定位** | **确定性引用 ([ref=e1])** | 不依赖 CSS，稳定性高 |
| **选择器引擎** | CSS + XPath | 兼容性好（备用） |
| **变更检测** | MutationObserver | 标准 API，性能好 |
| **重试机制** | 指数退避 + 抖动 | 业界标准，避免雪崩 |
| **自愈机制** | 失败诊断 + 替代方案 | 提高成功率 |
| **AI 推理** | Anthropic Claude / GPT-4 | 强大的指令遵循 |
| **快照缓存** | LRU + TTL | 平衡性能和内存 |
| **配置管理** | Extension Storage + Remote Config | 支持热更新 |
| **日志** | 本地存储 + 异步上报 | 不阻塞主线程 |
| **状态持久化** | chrome.storage.local | MV3 推荐方案 |
| **多标签页** | Tab Manager API | 原生支持 |
| **iframe 处理** | 递归遍历 + 跨域保护 | 兼容性最佳 |
| **决策缓存** | 哈希键 + LRU 淘汰 | Token 成本优化 |
| **网络拦截** | Pattern 匹配 | 减少页面噪声 |
| **页面稳定性** | Vibe Score 评分 | 避免动态加载时操作 |
| **Agent 通信** | 消息队列 + 事件广播 | 多 Agent 协调 |

---

## 16. 风险与缓解

| 风险 | 影响 | 缓解措施 | 优先级 |
|------|------|---------|--------|
| CSP 限制 | 脚本无法注入 | 双 world 执行 + 降级策略 + 自动检测 | P0 |
| 页面复杂度 | 性能下降 | 懒加载 + 内存管控 + 性能预算 | P0 |
| AI 误判 | 错误操作 | 安全边界 + 二次确认 + 低置信度人工介入 | P0 |
| 权限滥用 | 安全风险 | 权限矩阵 + 审计日志 + 域名白名单 | P0 |
| Content Script 泄漏 | 内存泄漏 | 生命周期管理 + 空闲检测 + 自动卸载 | P1 |
| 多标签页冲突 | 状态混乱 | 标签页隔离 + 唯一 ID | P1 |
| 重试风暴 | 性能恶化 | 指数退避 + 随机抖动 + 并发限制 | P1 |
| 快照过大 | 内存溢出 | 元素数量限制 + 流式处理 | P1 |
| **Token 超限** | **AI 成本增加** | **Context 优化 + Token 预算** | **P1** |
| **敏感数据泄露** | **安全风险** | **自动脱敏 + 变量替代** | **P1** |
| **操作失误** | **用户数据损坏** | **原子约束 + 二次确认** | **P1** |
| **Service Worker 睡眠** | **状态丢失** | **chrome.storage.local 持久化** | **P1** |
| **长连接失效** | **通信中断** | **使用 sendMessage 替代 connect** | **P1** |
| **iframe 跨域** | **无法访问** | **捕获异常 + 跳过** | **P2** |
| **重复 LLM 调用** | **Token 浪费** | **Decision Cache 缓存决策** | **P1** |
| **网络噪声干扰** | **误判风险** | **Network Interceptor 拦截** | **P2** |
| **动态页面操作失败** | **操作错误** | **Vibe Score 等待稳定** | **P1** |

---

## 17. 迁移策略

### 17.1 过渡期安排
由于项目已清理完旧 DOM 代码，新旧架构之间需要平滑过渡：

1. **保留 task_plan 占位符**：当前 `task-planner.ts` 中保留 `execPlan` 函数，但各阶段返回"功能暂时不可用"
2. **分阶段启用**：先启用感知层（Accessibility Tree），再启用执行层，最后启用编排层
3. **灰度发布**：新功能默认关闭，通过配置中心控制启用
4. **回滚机制**：保留旧代码备份，遇到问题可快速回滚

### 17.2 兼容性保障
- 新架构不影响现有功能（tabs/bookmarks/windows/history/cookies/extensions/sessions/screenshot/batch）
- 保持 Service Worker 接口不变
- 保持 AI Engine 接口不变

---

## 18. 附录

### 18.1 18 种 DOM 操作类型
1. `click` - 点击元素
2. `type` - 输入文本
3. `hover` - 悬停
4. `select` - 下拉选择
5. `scroll` - 滚动
6. `navigate` - 导航到新 URL
7. `wait` - 等待指定时间
8. `extract` - 提取文本/属性
9. `screenshot` - 页面截图
10. `fillForm` - 表单批量填充
11. `dragDrop` - 拖拽操作
12. `copyText` - 复制文本
13. `pasteText` - 粘贴文本
14. `pressKey` - 按键操作
15. `waitUntilVisible` - 等待元素可见
16. `waitUntilHidden` - 等待元素隐藏
17. `waitForLoad` - 等待页面加载
18. `waitForNetworkIdle` - 等待网络空闲

### 18.2 参考资料
- [Playwright MCP GitHub](https://github.com/microsoft/playwright-mcp)
- [Stagehand v4 Documentation](https://github.com/browserbase/stagehand)
- [Browser-Use GitHub](https://github.com/browser-use/browser-use)
- [Chrome Extension MV3 Best Practices](https://developer.chrome.com/docs/extensions/develop/migrate/improve-manifest)
- [Chrome Scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [WebMCP Proposal](https://github.com/GoogleChromeLabs/web-mcp)
- [Chrome Extension API](https://developer.chrome.com/docs/extensions/reference/)
- [CSP Guidelines](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Playwright Documentation](https://playwright.dev/)
- [MutationObserver MDN](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)

### 18.3 Chrome Extension MV3 最佳实践
```
# Service Worker 生命周期管理
✅ 使用 chrome.alarms 替代 setInterval
❌ 使用 setInterval 定时任务（Service Worker 会睡眠）

✅ 使用 chrome.storage.local 持久化状态
❌ 使用内存变量持久化（Service Worker 重启后丢失）

✅ 使用 runtime.sendMessage 单向通信
❌ 使用 runtime.connect 长连接（不可靠）

# Content Script 注入
✅ 使用 chrome.scripting.registerContentScripts 动态注册
✅ 使用 chrome.scripting.executeScript 按需注入
❌ 硬编码 content_scripts（无法动态控制）

# 权限使用
✅ 按需请求权限（activeTab）
❌ 请求过多权限（增加用户顾虑）
```

### 18.4 性能约束总结
| 指标 | 目标值 | 告警阈值 |
|------|--------|---------|
| 快照采集延迟 | < 200ms | > 500ms |
| 单次扫描元素数 | < 5000 | > 10000 |
| 内存占用 | < 50MB | > 100MB |
| CPU 占用 | < 30% | > 50% |
| Token 消耗 | < 4000 | > 8000 |
| 重试成功率 | > 95% | < 80% |
| AI 置信度 | > 0.85 | < 0.7 |
| Vibe Score | > 0.8 | < 0.5 |
| 缓存命中率 | > 70% | < 50% |

### 18.5 AI 提示词最佳实践
```
# Stagehand 提示词规范
## 元素描述
✅ 使用元素类型和功能："click the 'Sign In' button"
❌ 避免颜色描述："click the blue button"

## 动作动词
✅ click, type, select, check, upload
❌ press, choose, hit

## 敏感数据
✅ 使用变量："enter %password% in the password field"
❌ 明文传递："type 'secret123' into password field"

## 原子操作
✅ 单次操作："click the submit button"
❌ 组合操作："fill out the form and submit it"
```
