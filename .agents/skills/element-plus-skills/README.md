# Element Plus Skills Library

A comprehensive skill library for Element Plus UI framework, designed for AI agents to understand and utilize Element Plus components effectively.

**[中文版 ](./README_CN.md)**

***

## 📖 Introduction

This skill library provides structured documentation and usage guidelines for all 88 Element Plus skills, including:

- **77 Component Skills** - Individual component documentation with API reference
- **5 Design Specification Skills** - Border, Color, Layout, Typography, and Overview
- **6 Foundation Skills** - Quickstart, Theming, i18n, Dark Mode, SSR, Components Overview

## ✨ Features

- **Complete API Documentation** - Attributes, events, slots, and exposes for each component
- **Usage Examples** - Basic and advanced usage patterns
- **Best Practices** - Recommended implementation guidelines
- **Component Interactions** - How components work together
- **Cross-Platform Compatibility** - Works in any agent environment

## 📁 Directory Structure

```
element-plus-skills/
├── components/                    # 77 Component Skills
│   ├── el-affix/
│   ├── el-alert/
│   ├── el-button/
│   ├── el-form/
│   ├── el-table/
│   └── ...
├── element-plus-components/       # Component Overview Index
├── element-plus-dark-mode/        # Dark Mode Implementation
├── element-plus-design-border/    # Border Specifications
├── element-plus-design-color/     # Color Specifications
├── element-plus-design-layout/    # Layout Grid System
├── element-plus-design-overview/  # Design Overview
├── element-plus-design-typography/# Typography Specifications
├── element-plus-i18n/             # Internationalization
├── element-plus-quickstart/       # Quick Start Guide
├── element-plus-ssr/              # Server-Side Rendering
└── element-plus-theming/          # Theme Customization
```

## 🚀 Installation

### Prerequisites

- Node.js 18+
- Vue 3.3+
- Element Plus 2.4+

### Setup

```bash
# Install Element Plus
npm install element-plus

# Install icons
npm install @element-plus/icons-vue
```

### Install Element Plus Skills Library

Add the Element Plus Skills library to your project, enabling AI agents to understand and utilize Element Plus components:

```bash
npx skills add https://github.com/jiaiyan/element-plus-skills --skill element-plus-skills
```

## 📚 Usage

### For AI Agents

Each skill file follows a consistent format:

```yaml
---
name: "el-button"
description: "Button component description..."
metadata:
  author: jiaiyan
  version: "1.0.0"
---
```

### Skill Categories

| Category         | Count | Description                                                                                                    |
| ---------------- | ----- | -------------------------------------------------------------------------------------------------------------- |
| Basic Components | 14    | Affix, Anchor, Avatar, Backtop, Badge, Breadcrumb, Button, Card, Carousel, Collapse, Divider, Icon, Link, Text |
| Form Components  | 24    | Autocomplete, Cascader, Checkbox, ColorPicker, DatePicker, Form, Input, Radio, Select, Switch, Upload, etc.    |
| Data Display     | 17    | Avatar, Badge, Calendar, Card, Carousel, Descriptions, Empty, Image, Pagination, Progress, Table, Tree, etc.   |
| Navigation       | 8     | Affix, Anchor, Breadcrumb, Dropdown, Menu, PageHeader, Steps, Tabs                                             |
| Feedback         | 12    | Alert, Dialog, Drawer, Loading, Message, MessageBox, Notification, Popconfirm, Popover, Result, Tooltip, Tour  |
| Layout           | 4     | Container, Divider, Space, Splitter                                                                            |
| Utility          | 5     | ConfigProvider, InfiniteScroll, Scrollbar, Tour, Watermark                                                     |

### Quick Reference

```markdown
# Access component skill
./components/el-{name}/SKILL.md

# Access design specification
./element-plus-design-{name}/SKILL.md

# Access foundation skill
./element-plus-{name}/SKILL.md
```

## 🔧 Component Examples

### Basic Usage

```vue
<template>
  <el-button type="primary">Primary Button</el-button>
  <el-input v-model="input" placeholder="Please input" />
  <el-table :data="tableData">
    <el-table-column prop="name" label="Name" />
  </el-table>
</template>
```

### Form with Validation

```vue
<template>
  <el-form :model="form" :rules="rules" ref="formRef">
    <el-form-item label="Name" prop="name">
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="submitForm">Submit</el-button>
    </el-form-item>
  </el-form>
</template>
```

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-skill`)
3. Commit your changes (`git commit -m 'Add new skill'`)
4. Push to the branch (`git push origin feature/new-skill`)
5. Open a Pull Request

### Skill File Guidelines

Each skill file should include:

- **name**: Unique identifier (e.g., `el-button`)
- **description**: Clear description with invocation criteria
- **metadata**: Author and version information
- **Content Sections**:
  - When to Use
  - Basic Usage
  - API Reference
  - Common Patterns
  - Best Practices

## 📋 Skill File Template

```markdown
---
name: "el-{component-name}"
description: "Component description. Invoke when user needs to..."
metadata:
  author: your-name
  version: "1.0.0"
---

# Component Name

Component description and overview.

## When to Use

- Use case 1
- Use case 2

## Basic Usage

\`\`\`vue
<template>
  <el-component />
</template>
\`\`\`

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| prop | Description | type | default |

### Events

| Name | Description | Type |
|------|-------------|------|
| event | Description | type |

### Slots

| Name | Description |
|------|-------------|
| slot | Description |

## Best Practices

1. Practice 1
2. Practice 2
```

## 📄 License

MIT License

Copyright (c) 2024 Element Plus Skills Library

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## 🔗 Related Resources

- [Element Plus Documentation](https://element-plus.org/)
- [Vue 3 Documentation](https://vuejs.org/)
- [Element Plus GitHub](https://github.com/element-plus/element-plus)

## 📞 Support

For questions and support:

- Open an issue on GitHub
- Check the documentation
- Join the Element Plus community

