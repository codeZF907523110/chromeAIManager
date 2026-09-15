<script setup lang="ts">
/**
 * LandmarkMapBlock — 页面结构分区骨架（智能页面理解 — 结构模式主块）
 *
 * props:
 *   - landmarks: {
 *       navigation: Array<{ text: string; href: string }>,
 *       main: { exists: boolean; childCount: number; headingCount: number },
 *       complementary: number,
 *       contentinfo: boolean,
 *       banner: boolean,
 *       search: number,
 *     }
 *   - sectionsCount?: { section?: number; article?: number; aside?: number }   可选：附加 section/article/aside 数量
 *
 * 行为：
 *   - 6 个分区卡片（navigation / main / complementary / contentinfo / banner / search）
 *   - main 显示 childCount + headingCount；navigation 列前 5 个链接
 *   - 其他分区显示存在/数量，单行展示
 *   - 空分区显示"未识别"，不渲染空卡
 */

interface LinkItem {
  text: string
  href: string
}

interface MainLandmark {
  exists: boolean
  childCount: number
  headingCount: number
}

interface Landmarks {
  navigation: LinkItem[]
  main: MainLandmark
  complementary: number
  contentinfo: boolean
  banner: boolean
  search: number
}

const props = withDefaults(
  defineProps<{
    landmarks: Landmarks
    sectionsCount?: { section?: number; article?: number; aside?: number }
  }>(),
  { sectionsCount: () => ({}) }
)

/** 渲染上限：每张卡的导航链接最多展示 5 个，避免过长 */
const NAV_PREVIEW_LIMIT = 5
</script>

<template>
  <div class="landmark-grid">
    <!-- navigation -->
    <div v-if="props.landmarks.navigation.length > 0" class="landmark-card">
      <div class="card-header">
        <span class="card-title">导航 navigation</span>
        <span class="card-meta">{{ props.landmarks.navigation.length }} 个</span>
      </div>
      <ul class="nav-list">
        <li v-for="(l, i) in props.landmarks.navigation.slice(0, NAV_PREVIEW_LIMIT)" :key="i">
          <a :href="l.href" :title="l.text" target="_blank" rel="noopener noreferrer">
            {{ l.text || l.href }}
          </a>
        </li>
        <li v-if="props.landmarks.navigation.length > NAV_PREVIEW_LIMIT" class="more">
          等 {{ props.landmarks.navigation.length }} 项…
        </li>
      </ul>
    </div>

    <!-- main -->
    <div class="landmark-card">
      <div class="card-header">
        <span class="card-title">主内容 main</span>
        <span class="card-meta">{{ props.landmarks.main.exists ? '已识别' : '未识别' }}</span>
      </div>
      <div v-if="props.landmarks.main.exists" class="kv-list">
        <div>
          <span>子元素</span><b>{{ props.landmarks.main.childCount }}</b>
        </div>
        <div>
          <span>标题数</span><b>{{ props.landmarks.main.headingCount }}</b>
        </div>
      </div>
      <div v-else class="empty">无显式 main / article 容器</div>
    </div>

    <!-- complementary -->
    <div v-if="props.landmarks.complementary > 0" class="landmark-card">
      <div class="card-header">
        <span class="card-title">侧栏 complementary</span>
        <span class="card-meta">{{ props.landmarks.complementary }} 个</span>
      </div>
    </div>

    <!-- contentinfo -->
    <div v-if="props.landmarks.contentinfo" class="landmark-card">
      <div class="card-header">
        <span class="card-title">页脚 contentinfo</span>
        <span class="card-meta">已识别</span>
      </div>
    </div>

    <!-- banner -->
    <div v-if="props.landmarks.banner" class="landmark-card">
      <div class="card-header">
        <span class="card-title">页首 banner</span>
        <span class="card-meta">已识别</span>
      </div>
    </div>

    <!-- search -->
    <div v-if="props.landmarks.search > 0" class="landmark-card">
      <div class="card-header">
        <span class="card-title">搜索 search</span>
        <span class="card-meta">{{ props.landmarks.search }} 个</span>
      </div>
    </div>

    <!-- 附加 section/article/aside -->
    <div
      v-if="
        (props.sectionsCount.section ?? 0) > 0 ||
        (props.sectionsCount.article ?? 0) > 0 ||
        (props.sectionsCount.aside ?? 0) > 0
      "
      class="landmark-card"
    >
      <div class="card-header">
        <span class="card-title">语义区块</span>
        <span class="card-meta">附加统计</span>
      </div>
      <div class="kv-list">
        <div v-if="(props.sectionsCount.section ?? 0) > 0">
          <span>section</span><b>{{ props.sectionsCount.section }}</b>
        </div>
        <div v-if="(props.sectionsCount.article ?? 0) > 0">
          <span>article</span><b>{{ props.sectionsCount.article }}</b>
        </div>
        <div v-if="(props.sectionsCount.aside ?? 0) > 0">
          <span>aside</span><b>{{ props.sectionsCount.aside }}</b>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.landmark-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  margin: 4px 0;
}

.landmark-card {
  border: 1px solid var(--app-border);
  border-radius: 6px;
  background: var(--app-bg-card);
  padding: 8px 10px;
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-bottom: 1px dashed var(--app-border);
  padding-bottom: 4px;
}

.card-title {
  font-weight: 600;
  color: var(--app-text-primary);
}

.card-meta {
  font-size: 11px;
  color: var(--app-text-muted);
  font-family: ui-monospace, monospace;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.nav-list a {
  color: var(--app-text-primary);
  text-decoration: none;
  font-size: 12px;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-list a:hover {
  text-decoration: underline;
}

.nav-list .more {
  color: var(--app-text-muted);
  font-size: 11px;
  font-style: italic;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.kv-list > div {
  display: flex;
  justify-content: space-between;
  color: var(--app-text-secondary);
}

.kv-list b {
  color: var(--app-text-primary);
  font-weight: 600;
}

.empty {
  color: var(--app-text-muted);
  font-style: italic;
  font-size: 11px;
}
</style>
