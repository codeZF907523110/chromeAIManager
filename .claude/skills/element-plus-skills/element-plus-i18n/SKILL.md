---
name: "element-plus-i18n"
description: "Configures internationalization and localization for Element Plus components. Invoke when user needs to change language, add custom translations, or configure locale settings."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Element Plus Internationalization

This skill provides comprehensive guidance for configuring internationalization (i18n) in Element Plus applications.

## When to Invoke

Invoke this skill when:
- User wants to change the default language
- User needs to configure multiple languages
- User asks about date/time localization
- User wants to add custom translations
- User needs to switch languages dynamically

## Default Language

Element Plus components use **English** by default. To use other languages, you need to configure the locale.

## Configuration Methods

### 1. Global Configuration

Configure the locale when registering Element Plus:

```ts
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'

const app = createApp(App)
app.use(ElementPlus, {
  locale: zhCn,
})
```

### 2. ConfigProvider Component

Use `el-config-provider` for dynamic locale switching:

```vue
<template>
  <el-config-provider :locale="locale">
    <app />
  </el-config-provider>
</template>

<script setup>
import { ref } from 'vue'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const locale = ref(zhCn)

const switchLanguage = (lang) => {
  locale.value = lang === 'zh' ? zhCn : en
}
</script>
```

### 3. CDN Usage

For CDN-based projects:

```html
<script src="//unpkg.com/element-plus/dist/locale/zh-cn"></script>
<script>
  app.use(ElementPlus, {
    locale: ElementPlusLocaleZhCn,
  })
</script>
```

## Date and Time Localization

Element Plus uses [Day.js](https://day.js.org/) for date/time management in components like `DatePicker`. You must import Day.js locale separately:

```ts
import 'dayjs/locale/zh-cn'
```

### Complete Example with DatePicker

```vue
<template>
  <el-config-provider :locale="locale">
    <el-date-picker
      v-model="date"
      type="date"
      placeholder="Pick a day"
    />
  </el-config-provider>
</template>

<script setup>
import { ref } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'dayjs/locale/zh-cn'

const locale = ref(zhCn)
const date = ref('')
</script>
```

## Supported Languages

Element Plus supports 50+ languages. Here's a partial list:

| Language | Code | Import Path |
|----------|------|-------------|
| Simplified Chinese | zh-cn | `element-plus/es/locale/lang/zh-cn` |
| American English | en | `element-plus/es/locale/lang/en` |
| Traditional Chinese | zh-tw | `element-plus/es/locale/lang/zh-tw` |
| Hong Kong Chinese | zh-hk | `element-plus/es/locale/lang/zh-hk` |
| Japanese | ja | `element-plus/es/locale/lang/ja` |
| Korean | ko | `element-plus/es/locale/lang/ko` |
| German | de | `element-plus/es/locale/lang/de` |
| French | fr | `element-plus/es/locale/lang/fr` |
| Spanish | es | `element-plus/es/locale/lang/es` |
| Portuguese | pt | `element-plus/es/locale/lang/pt` |
| Russian | ru | `element-plus/es/locale/lang/ru` |
| Arabic | ar | `element-plus/es/locale/lang/ar` |
| Thai | th | `element-plus/es/locale/lang/th` |
| Vietnamese | vi | `element-plus/es/locale/lang/vi` |

Full list available at: [GitHub - Element Plus Locale](https://github.com/element-plus/element-plus/tree/dev/packages/locale/lang)

## Dynamic Language Switching

### Complete Example

```vue
<template>
  <div>
    <el-select v-model="currentLang" @change="changeLanguage">
      <el-option label="简体中文" value="zh-cn" />
      <el-option label="English" value="en" />
      <el-option label="日本語" value="ja" />
    </el-select>

    <el-config-provider :locale="locale">
      <el-date-picker
        v-model="date"
        type="date"
        placeholder="Pick a day"
      />
      <el-pagination
        :total="100"
        :page-size="10"
      />
    </el-config-provider>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'
import ja from 'element-plus/es/locale/lang/ja'

const locales = {
  'zh-cn': zhCn,
  'en': en,
  'ja': ja
}

const currentLang = ref('zh-cn')
const locale = ref(zhCn)
const date = ref('')

const changeLanguage = (lang) => {
  locale.value = locales[lang]
  // Also change Day.js locale
  import(`dayjs/locale/${lang}`)
}
</script>
```

## Adding Custom Languages

If your language is not supported, you can create a custom locale file:

```ts
// custom-locale.ts
export default {
  name: 'xx',
  el: {
    colorpicker: {
      confirm: 'Confirm',
      clear: 'Clear',
    },
    datepicker: {
      now: 'Now',
      today: 'Today',
      cancel: 'Cancel',
      clear: 'Clear',
      confirm: 'OK',
      selectDate: 'Select date',
      selectTime: 'Select time',
      startDate: 'Start Date',
      startTime: 'Start Time',
      endDate: 'End Date',
      endTime: 'End Time',
      prevYear: 'Previous Year',
      nextYear: 'Next Year',
      prevMonth: 'Previous Month',
      nextMonth: 'Next Month',
      year: '',
      month1: 'January',
      month2: 'February',
      month3: 'March',
      month4: 'April',
      month5: 'May',
      month6: 'June',
      month7: 'July',
      month8: 'August',
      month9: 'September',
      month10: 'October',
      month11: 'November',
      month12: 'December',
      week: 'week',
      weeks: {
        sun: 'Sun',
        mon: 'Mon',
        tue: 'Tue',
        wed: 'Wed',
        thu: 'Thu',
        fri: 'Fri',
        sat: 'Sat',
      },
      months: {
        jan: 'Jan',
        feb: 'Feb',
        mar: 'Mar',
        apr: 'Apr',
        may: 'May',
        jun: 'Jun',
        jul: 'Jul',
        aug: 'Aug',
        sep: 'Sep',
        oct: 'Oct',
        nov: 'Nov',
        dec: 'Dec',
      },
    },
    select: {
      loading: 'Loading',
      noMatch: 'No matching data',
      noData: 'No data',
      placeholder: 'Select',
    },
    // ... other component translations
  },
}
```

Then use it:

```ts
import customLocale from './custom-locale'

app.use(ElementPlus, {
  locale: customLocale,
})
```

## Best Practices

### 1. Persist Language Preference

Store the user's language preference in localStorage:

```ts
const savedLang = localStorage.getItem('language') || 'en'
const locale = ref(locales[savedLang])

watch(locale, (newLocale) => {
  localStorage.setItem('language', newLocale.name)
})
```

### 2. Sync with Application i18n

If using vue-i18n, sync Element Plus locale with your app locale:

```ts
import { createI18n } from 'vue-i18n'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

const i18n = createI18n({
  locale: 'zh',
  messages: {
    zh: { /* ... */ },
    en: { /* ... */ },
  },
})

const elementLocales = {
  zh: zhCn,
  en: en,
}

app.use(i18n)
app.use(ElementPlus, {
  locale: elementLocales[i18n.global.locale],
})
```

### 3. Lazy Load Locales

For better performance, lazy load locales:

```ts
const loadLocale = async (lang) => {
  const [dayjsLocale, elementLocale] = await Promise.all([
    import(`dayjs/locale/${lang}`),
    import(`element-plus/es/locale/lang/${lang}`),
  ])
  return elementLocale.default
}
```

## Input Parameters

When using this skill, provide:
- **Target language**: The language code you want to use
- **Configuration method**: Global or ConfigProvider
- **Dynamic switching**: Whether you need runtime language switching
- **Date components**: Whether you use DatePicker or other date components

## Output Format

This skill provides:
1. Locale configuration examples
2. Language switching implementations
3. Day.js integration for date components
4. Custom locale creation guide

## Usage Limitations

- Day.js locale must be imported separately for date components
- Some languages may have incomplete translations
- Custom locales need to follow the Element Plus locale structure
- CDN usage requires different import syntax
