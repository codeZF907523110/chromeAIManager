# Element Plus Skills - Agents Documentation

This document provides detailed information about all agents (skills) available in the Element Plus Skills Library.

## 📋 Agent Index

| Category | Skills Count | Description |
|----------|--------------|-------------|
| [Basic Components](#basic-components-agents) | 14 | UI elements for basic interactions |
| [Form Components](#form-components-agents) | 24 | Form inputs and data collection |
| [Data Display](#data-display-agents) | 17 | Data visualization and presentation |
| [Navigation](#navigation-agents) | 8 | Navigation and routing components |
| [Feedback](#feedback-agents) | 12 | User feedback and notifications |
| [Layout](#layout-agents) | 4 | Page layout and structure |
| [Utility](#utility-agents) | 5 | Utility and helper components |
| [Design Specs](#design-specifications-agents) | 5 | Design system specifications |
| [Foundation](#foundation-agents) | 6 | Core setup and configuration |

---

## Basic Components Agents

### el-affix

**Description**: Fixes elements to a specific visible area for sticky navigation.

**Use Cases**:
- Sticky navigation headers
- Fixed toolbars while scrolling
- Persistent action buttons
- Floating sidebars

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| offset | number | 0 | Offset distance from top/bottom |
| position | string | 'top' | Position: 'top' or 'bottom' |
| target | string | - | Target container CSS selector |
| z-index | number | 100 | z-index of affix element |

**Example**:
```vue
<el-affix :offset="120">
  <el-button type="primary">Fixed Button</el-button>
</el-affix>
```

---

### el-alert

**Description**: Displays important alert messages on the page.

**Use Cases**:
- System notifications
- Status messages
- Warning displays
- Important information

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| title | string | - | Alert title (required) |
| type | string | 'info' | Type: primary, success, warning, info, error |
| description | string | - | Descriptive text |
| closable | boolean | true | Whether alert can be dismissed |
| show-icon | boolean | false | Whether to display type icon |

**Example**:
```vue
<el-alert title="Success" type="success" description="Operation completed" show-icon />
```

---

### el-anchor

**Description**: Anchor navigation for quick page section navigation.

**Use Cases**:
- Table of contents
- Document navigation
- Section anchors
- Quick page navigation

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| container | string/HTMLElement | - | Scroll container |
| offset | number | 0 | Scroll offset |
| direction | string | 'vertical' | Direction: 'vertical' or 'horizontal' |

**Example**:
```vue
<el-anchor>
  <el-anchor-link href="#section1" title="Section 1" />
  <el-anchor-link href="#section2" title="Section 2" />
</el-anchor>
```

---

### el-avatar

**Description**: Displays user avatars with images, icons, or characters.

**Use Cases**:
- User profile pictures
- Team member displays
- Entity representations
- Avatar groups

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| src | string | - | Image source URL |
| icon | string/Component | - | Icon component |
| size | number/string | - | Size: number or 'large'/'default'/'small' |
| shape | string | - | Shape: 'circle' or 'square' |

**Example**:
```vue
<el-avatar :size="50" src="avatar.jpg" />
<el-avatar :icon="UserFilled" />
```

---

### el-backtop

**Description**: Back-to-top button for long page navigation.

**Use Cases**:
- Long page navigation
- Quick scroll to top
- Improved user experience

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| target | string | - | Target to trigger scroll |
| visibility-height | number | 200 | Min height to show button |
| right | number | 40 | Right distance |
| bottom | number | 40 | Bottom distance |

**Example**:
```vue
<el-backtop :bottom="100" />
```

---

### el-badge

**Description**: Displays numbers or status marks on buttons and icons.

**Use Cases**:
- Notification counts
- Status indicators
- Unread message badges
- Attention markers

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| value | string/number | - | Display value |
| max | number | 99 | Maximum value |
| is-dot | boolean | false | Display as a dot |
| type | string | 'danger' | Badge type |

**Example**:
```vue
<el-badge :value="12">
  <el-button>Comments</el-button>
</el-badge>
```

---

### el-breadcrumb

**Description**: Displays page location for easier navigation.

**Use Cases**:
- Page navigation paths
- Category hierarchies
- Document structures

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| separator | string | '/' | Separator character |
| separator-icon | string/Component | - | Icon for separator |

**Example**:
```vue
<el-breadcrumb separator="/">
  <el-breadcrumb-item :to="{ path: '/' }">Home</el-breadcrumb-item>
  <el-breadcrumb-item>Page</el-breadcrumb-item>
</el-breadcrumb>
```

---

### el-button

**Description**: Basic button with various types, sizes, and styles.

**Use Cases**:
- Form submissions
- Action triggers
- Navigation controls
- Interactive elements

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| type | string | 'default' | Type: primary, success, warning, danger, info |
| size | string | - | Size: large, default, small |
| plain | boolean | false | Plain style |
| round | boolean | false | Round corners |
| disabled | boolean | false | Disabled state |
| loading | boolean | false | Loading state |

**Example**:
```vue
<el-button type="primary" @click="handleClick">Primary Button</el-button>
<el-button type="success" plain>Plain Success</el-button>
```

---

### el-card

**Description**: Integrates information in a card container.

**Use Cases**:
- Dashboard cards
- Content sections
- Product displays
- Information grouping

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| header | string | - | Card header title |
| shadow | string | 'always' | Shadow: always, hover, never |
| body-style | object | - | Body CSS style |

**Example**:
```vue
<el-card shadow="hover">
  <template #header>Card Title</template>
  Card content
</el-card>
```

---

### el-carousel

**Description**: Loops images or texts in limited space.

**Use Cases**:
- Image sliders
- Content carousels
- Rotating banners
- Product showcases

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| height | string | - | Carousel height |
| autoplay | boolean | true | Auto loop |
| interval | number | 3000 | Interval in ms |
| type | string | - | Type: 'card' |
| indicator-position | string | - | Indicator position |

**Example**:
```vue
<el-carousel height="200px">
  <el-carousel-item v-for="item in 4" :key="item">
    <h3>{{ item }}</h3>
  </el-carousel-item>
</el-carousel>
```

---

### el-collapse

**Description**: Stores content in expandable panels.

**Use Cases**:
- FAQ sections
- Accordion panels
- Collapsible content areas

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | array | - | Active panel names |
| accordion | boolean | false | Accordion mode |

**Example**:
```vue
<el-collapse v-model="activeNames">
  <el-collapse-item title="Panel 1" name="1">Content</el-collapse-item>
</el-collapse>
```

---

### el-divider

**Description**: Creates dividing lines between content.

**Use Cases**:
- Content separation
- Section dividers
- Visual grouping

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| direction | string | 'horizontal' | Direction: horizontal, vertical |
| border-style | string | 'solid' | Border style |
| content-position | string | 'center' | Content position |

**Example**:
```vue
<el-divider />
<el-divider content-position="left">Left</el-divider>
```

---

### el-icon

**Description**: SVG icons with customizable size and color.

**Use Cases**:
- UI icons
- Button icons
- Status indicators

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| size | number/string | - | Icon size |
| color | string | - | Icon color |

**Example**:
```vue
<el-icon :size="30" color="#409EFC">
  <Edit />
</el-icon>
```

---

### el-link

**Description**: Text hyperlinks with various styles.

**Use Cases**:
- Text navigation
- External links
- Inline links

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| type | string | 'default' | Type: primary, success, warning, danger, info |
| href | string | - | Link URL |
| target | string | '_self' | Target: _blank, _self, etc. |
| underline | string | 'hover' | Underline behavior |

**Example**:
```vue
<el-link type="primary" href="https://example.com" target="_blank">Link</el-link>
```

---

### el-text

**Description**: Styled text display with truncation support.

**Use Cases**:
- Styled text display
- Truncated text
- Semantic text types

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| type | string | - | Type: primary, success, warning, danger, info |
| size | string | 'default' | Size: large, default, small |
| truncated | boolean | false | Enable truncation |
| line-clamp | number | - | Maximum lines |

**Example**:
```vue
<el-text type="primary">Primary text</el-text>
<el-text truncated>Long text that will be truncated...</el-text>
```

---

## Form Components Agents

### el-autocomplete

**Description**: Input suggestions based on user input.

**Use Cases**:
- Search suggestions
- Form autocomplete
- Address inputs

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | string | - | Binding value |
| fetch-suggestions | function | - | Method to fetch suggestions |
| placeholder | string | - | Placeholder text |
| debounce | number | 300 | Debounce delay in ms |

**Example**:
```vue
<el-autocomplete
  v-model="state"
  :fetch-suggestions="querySearch"
  placeholder="Search..."
/>
```

---

### el-cascader

**Description**: Hierarchical option selection.

**Use Cases**:
- Region selection
- Category hierarchies
- Organizational structures

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | array | - | Selected values |
| options | array | - | Data options |
| props | object | - | Configuration options |
| filterable | boolean | false | Enable search |

**Example**:
```vue
<el-cascader v-model="value" :options="options" />
```

---

### el-checkbox

**Description**: Multiple choice selection.

**Use Cases**:
- Multiple selections
- Check-all functionality
- Toggle states

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | array | - | Selected values |
| value | any | - | Checkbox value |
| disabled | boolean | false | Disabled state |
| indeterminate | boolean | false | Indeterminate state |

**Example**:
```vue
<el-checkbox-group v-model="checkList">
  <el-checkbox value="Option A">Option A</el-checkbox>
  <el-checkbox value="Option B">Option B</el-checkbox>
</el-checkbox-group>
```

---

### el-color-picker

**Description**: Color selection with multiple formats.

**Use Cases**:
- Theme customization
- Color selection
- Design tools

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | string | - | Selected color |
| show-alpha | boolean | false | Show alpha slider |
| predefine | array | - | Predefined colors |
| color-format | string | 'hex' | Color format |

**Example**:
```vue
<el-color-picker v-model="color" show-alpha />
```

---

### el-date-picker

**Description**: Date selection with various types.

**Use Cases**:
- Date input
- Date range selection
- Scheduling

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | string/array | - | Selected date |
| type | string | 'date' | Type: date, daterange, datetime, etc. |
| format | string | 'YYYY-MM-DD' | Display format |
| value-format | string | - | Value format |
| shortcuts | array | - | Quick selection options |

**Example**:
```vue
<el-date-picker
  v-model="date"
  type="daterange"
  start-placeholder="Start"
  end-placeholder="End"
/>
```

---

### el-form

**Description**: Form management and validation.

**Use Cases**:
- Data collection
- Form validation
- Form submission

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| model | object | - | Form data model |
| rules | object | - | Validation rules |
| label-width | string | - | Label width |
| label-position | string | 'right' | Label position |

**Example**:
```vue
<el-form :model="form" :rules="rules" ref="formRef">
  <el-form-item label="Name" prop="name">
    <el-input v-model="form.name" />
  </el-form-item>
</el-form>
```

---

### el-input

**Description**: Text input with various configurations.

**Use Cases**:
- Text input
- Password input
- Textarea

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | string | - | Binding value |
| type | string | 'text' | Type: text, password, textarea |
| placeholder | string | - | Placeholder text |
| disabled | boolean | false | Disabled state |
| clearable | boolean | false | Show clear button |
| maxlength | number | - | Maximum length |

**Example**:
```vue
<el-input v-model="input" placeholder="Enter text" clearable />
<el-input type="textarea" v-model="textarea" :rows="4" />
```

---

### el-input-number

**Description**: Numeric input with increment controls.

**Use Cases**:
- Quantity inputs
- Numeric settings
- Range-limited numbers

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | number | 0 | Binding value |
| min | number | -Infinity | Minimum value |
| max | number | Infinity | Maximum value |
| step | number | 1 | Step size |
| precision | number | 0 | Decimal precision |

**Example**:
```vue
<el-input-number v-model="num" :min="1" :max="10" />
```

---

### el-radio

**Description**: Single selection from options.

**Use Cases**:
- Single selection
- Radio groups
- Settings selection

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | any | - | Selected value |
| value | any | - | Radio value |
| disabled | boolean | false | Disabled state |
| border | boolean | false | Show border |

**Example**:
```vue
<el-radio-group v-model="radio">
  <el-radio value="1">Option A</el-radio>
  <el-radio value="2">Option B</el-radio>
</el-radio-group>
```

---

### el-rate

**Description**: Star rating functionality.

**Use Cases**:
- User ratings
- Product reviews
- Feedback scoring

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | number | 0 | Rating value |
| max | number | 5 | Maximum stars |
| allow-half | boolean | false | Allow half stars |
| show-text | boolean | false | Show text |
| clearable | boolean | false | Can reset to 0 |

**Example**:
```vue
<el-rate v-model="rating" allow-half show-text />
```

---

### el-select

**Description**: Dropdown selection component.

**Use Cases**:
- Single selection
- Multiple selection
- Searchable dropdowns

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | any/array | - | Selected value(s) |
| multiple | boolean | false | Multiple selection |
| filterable | boolean | false | Enable search |
| clearable | boolean | false | Show clear button |
| placeholder | string | 'Select' | Placeholder text |

**Example**:
```vue
<el-select v-model="value" placeholder="Select">
  <el-option label="Option A" value="a" />
  <el-option label="Option B" value="b" />
</el-select>
```

---

### el-slider

**Description**: Numeric range selection with dragging.

**Use Cases**:
- Volume controls
- Price range filters
- Progress indicators

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | number/array | 0 | Slider value |
| min | number | 0 | Minimum value |
| max | number | 100 | Maximum value |
| step | number | 1 | Step size |
| range | boolean | false | Range mode |
| show-input | boolean | false | Show input box |

**Example**:
```vue
<el-slider v-model="value" :min="0" :max="100" />
<el-slider v-model="range" range :max="1000" />
```

---

### el-switch

**Description**: Toggle between two opposing states.

**Use Cases**:
- Enable/disable features
- Toggle settings
- On/off switches

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | boolean | false | Switch state |
| disabled | boolean | false | Disabled state |
| loading | boolean | false | Loading state |
| active-text | string | - | Text when on |
| inactive-text | string | - | Text when off |

**Example**:
```vue
<el-switch v-model="value" active-text="ON" inactive-text="OFF" />
```

---

### el-time-picker

**Description**: Time selection with various formats.

**Use Cases**:
- Time input
- Time range selection
- Scheduling

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | string/array | - | Selected time |
| is-range | boolean | false | Range mode |
| format | string | 'HH:mm:ss' | Display format |
| arrow-control | boolean | false | Use arrow buttons |

**Example**:
```vue
<el-time-picker v-model="time" placeholder="Select time" />
```

---

### el-transfer

**Description**: Dual-column list selection.

**Use Cases**:
- Permission management
- Multi-select from large datasets
- Item categorization

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | array | - | Selected items |
| data | array | - | Source data |
| filterable | boolean | false | Enable search |
| titles | array | - | Panel titles |

**Example**:
```vue
<el-transfer v-model="value" :data="data" />
```

---

### el-tree-select

**Description**: Tree-based dropdown selection.

**Use Cases**:
- Organization structure selection
- Category tree selection
- Hierarchical data selection

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | any | - | Selected value |
| data | array | - | Tree data |
| multiple | boolean | false | Multiple selection |
| check-strictly | boolean | false | Parent-child independent |
| filterable | boolean | false | Enable search |

**Example**:
```vue
<el-tree-select v-model="value" :data="treeData" />
```

---

### el-upload

**Description**: File upload with drag-and-drop.

**Use Cases**:
- File uploads
- Image uploads
- Avatar uploads

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| action | string | - | Upload URL |
| v-model:file-list | array | - | File list |
| multiple | boolean | false | Multiple files |
| drag | boolean | false | Drag and drop |
| accept | string | - | Accepted file types |
| limit | number | - | Maximum files |

**Example**:
```vue
<el-upload action="/upload" :file-list="fileList" drag>
  <el-button type="primary">Upload</el-button>
</el-upload>
```

---

## Data Display Agents

### el-calendar

**Description**: Date display with events.

**Use Cases**:
- Calendar views
- Event scheduling
- Date selection

**Example**:
```vue
<el-calendar v-model="date" />
```

---

### el-descriptions

**Description**: Multiple fields in list form.

**Use Cases**:
- Product details
- User profiles
- Information summaries

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| column | number | 3 | Number of columns |
| border | boolean | false | Show border |
| direction | string | 'horizontal' | Direction |

**Example**:
```vue
<el-descriptions title="User Info" border>
  <el-descriptions-item label="Name">John</el-descriptions-item>
</el-descriptions>
```

---

### el-empty

**Description**: Placeholder hints for empty states.

**Use Cases**:
- Empty data states
- No search results
- Placeholder content

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| description | string | - | Description text |
| image | string | - | Custom image URL |

**Example**:
```vue
<el-empty description="No data">
  <el-button type="primary">Add Data</el-button>
</el-empty>
```

---

### el-image

**Description**: Images with lazy load and preview.

**Use Cases**:
- Image display
- Image galleries
- Lazy loading images

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| src | string | - | Image URL |
| lazy | boolean | false | Enable lazy load |
| preview-src-list | array | - | Preview images |
| fit | string | - | Fit mode |

**Example**:
```vue
<el-image :src="url" :preview-src-list="srcList" lazy />
```

---

### el-pagination

**Description**: Page navigation for large datasets.

**Use Cases**:
- Data pagination
- Search results
- List navigation

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model:current-page | number | 1 | Current page |
| v-model:page-size | number | 10 | Items per page |
| total | number | 0 | Total items |
| layout | string | - | Layout elements |
| page-sizes | array | [10, 20, 30, 40] | Page size options |

**Example**:
```vue
<el-pagination
  v-model:current-page="page"
  v-model:page-size="size"
  :total="total"
  layout="total, sizes, prev, pager, next"
/>
```

---

### el-progress

**Description**: Operation progress visualization.

**Use Cases**:
- Upload progress
- Task completion
- Loading states

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| percentage | number | 0 | Progress percentage |
| type | string | 'line' | Type: line, circle, dashboard |
| status | string | - | Status: success, exception, warning |
| stroke-width | number | 6 | Line width |

**Example**:
```vue
<el-progress :percentage="50" />
<el-progress type="circle" :percentage="75" />
```

---

### el-scrollbar

**Description**: Custom scrollbar styling.

**Use Cases**:
- Custom scroll areas
- Infinite scrolling
- Scrollable containers

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| height | number/string | - | Scrollbar height |
| max-height | number/string | - | Maximum height |
| always | boolean | false | Always show scrollbar |

**Example**:
```vue
<el-scrollbar height="400px">
  <p v-for="i in 100" :key="i">{{ i }}</p>
</el-scrollbar>
```

---

### el-skeleton

**Description**: Loading placeholders.

**Use Cases**:
- Loading states
- Content placeholders
- Improving perceived performance

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| loading | boolean | false | Show skeleton |
| animated | boolean | false | Animation |
| rows | number | 3 | Number of rows |

**Example**:
```vue
<el-skeleton :loading="loading" animated>
  <template #default>Content</template>
</el-skeleton>
```

---

### el-statistic

**Description**: Numerical statistics display.

**Use Cases**:
- Dashboard statistics
- Count displays
- Amount displays

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| value | number | 0 | Numeric value |
| title | string | - | Title |
| prefix | string | - | Prefix |
| suffix | string | - | Suffix |
| precision | number | 0 | Decimal precision |

**Example**:
```vue
<el-statistic title="Total Users" :value="268500" />
```

---

### el-table

**Description**: Data table with sorting and filtering.

**Use Cases**:
- Data tables
- Data grids
- Tabular data display

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| data | array | - | Table data |
| height | number/string | - | Table height |
| stripe | boolean | false | Striped rows |
| border | boolean | false | Show borders |
| row-key | string/function | - | Row key |

**Example**:
```vue
<el-table :data="tableData">
  <el-table-column prop="name" label="Name" />
  <el-table-column prop="age" label="Age" />
</el-table>
```

---

### el-tag

**Description**: Labels and markers for categorization.

**Use Cases**:
- Category labels
- Status tags
- Removable filters

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| type | string | 'primary' | Type: primary, success, warning, danger, info |
| closable | boolean | false | Removable |
| size | string | - | Size: large, default, small |
| effect | string | 'light' | Effect: light, dark, plain |

**Example**:
```vue
<el-tag type="success">Success</el-tag>
<el-tag type="danger" closable @close="handleClose">Danger</el-tag>
```

---

### el-timeline

**Description**: Chronological event display.

**Use Cases**:
- Activity history
- Chronological events
- Process logs

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| reverse | boolean | false | Reverse order |
| mode | string | 'start' | Position: start, alternate, end |

**Example**:
```vue
<el-timeline>
  <el-timeline-item timestamp="2024-01-01">Event 1</el-timeline-item>
  <el-timeline-item timestamp="2024-01-02">Event 2</el-timeline-item>
</el-timeline>
```

---

### el-tree

**Description**: Hierarchical data display.

**Use Cases**:
- Folder structures
- Organization charts
- Category trees

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| data | array | - | Tree data |
| show-checkbox | boolean | false | Show checkboxes |
| default-expand-all | boolean | false | Expand all nodes |
| node-key | string | - | Node key |
| props | object | - | Configuration |

**Example**:
```vue
<el-tree :data="data" :props="defaultProps" show-checkbox />
```

---

## Navigation Agents

### el-dropdown

**Description**: Toggleable dropdown menus.

**Use Cases**:
- Navigation menus
- Action menus
- Context menus

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| trigger | string | 'hover' | Trigger: hover, click |
| placement | string | 'bottom' | Placement position |
| disabled | boolean | false | Disabled state |

**Example**:
```vue
<el-dropdown>
  <el-button>Dropdown</el-button>
  <template #dropdown>
    <el-dropdown-menu>
      <el-dropdown-item>Action 1</el-dropdown-item>
    </el-dropdown-menu>
  </template>
</el-dropdown>
```

---

### el-menu

**Description**: Navigation menu system.

**Use Cases**:
- Navigation menus
- Side navigation
- Top navigation

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| mode | string | 'vertical' | Mode: vertical, horizontal |
| default-active | string | - | Active menu index |
| collapse | boolean | false | Collapse mode |
| router | boolean | false | Use vue-router |

**Example**:
```vue
<el-menu :default-active="activeIndex" mode="horizontal">
  <el-menu-item index="1">Home</el-menu-item>
  <el-menu-item index="2">About</el-menu-item>
</el-menu>
```

---

### el-page-header

**Description**: Page navigation headers.

**Use Cases**:
- Page headers
- Back navigation
- Title sections

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| title | string | - | Main title |
| content | string | - | Content text |

**Example**:
```vue
<el-page-header @back="goBack">
  <template #content>Title</template>
</el-page-header>
```

---

### el-steps

**Description**: Step-by-step process guide.

**Use Cases**:
- Wizard interfaces
- Process workflows
- Step progress indicators

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| active | number | 0 | Active step |
| direction | string | 'horizontal' | Direction |
| finish-status | string | 'finish' | Finish status |
| process-status | string | 'process' | Process status |

**Example**:
```vue
<el-steps :active="active">
  <el-step title="Step 1" />
  <el-step title="Step 2" />
  <el-step title="Step 3" />
</el-steps>
```

---

### el-tabs

**Description**: Tabbed content organization.

**Use Cases**:
- Tabbed content
- Content organization
- Multi-panel interfaces

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | string | - | Active tab name |
| type | string | - | Type: card, border-card |
| tab-position | string | 'top' | Position: top, right, bottom, left |

**Example**:
```vue
<el-tabs v-model="activeTab">
  <el-tab-pane label="Tab 1" name="1">Content 1</el-tab-pane>
  <el-tab-pane label="Tab 2" name="2">Content 2</el-tab-pane>
</el-tabs>
```

---

## Feedback Agents

### el-dialog

**Description**: Modal dialog boxes.

**Use Cases**:
- Modal dialogs
- Form dialogs
- Confirmation dialogs

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | boolean | false | Dialog visibility |
| title | string | - | Dialog title |
| width | string | '50%' | Dialog width |
| modal | boolean | true | Show modal overlay |
| close-on-click-modal | boolean | true | Close on overlay click |

**Example**:
```vue
<el-dialog v-model="visible" title="Dialog Title">
  <span>Content</span>
  <template #footer>
    <el-button @click="visible = false">Cancel</el-button>
  </template>
</el-dialog>
```

---

### el-drawer

**Description**: Slide-out panel.

**Use Cases**:
- Slide-out panels
- Side panels
- Detail views

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | boolean | false | Drawer visibility |
| title | string | - | Drawer title |
| direction | string | 'rtl' | Direction: rtl, ltr, ttb, btt |
| size | string | '30%' | Drawer size |

**Example**:
```vue
<el-drawer v-model="visible" title="Drawer">
  <span>Content</span>
</el-drawer>
```

---

### el-loading

**Description**: Loading animation overlay.

**Use Cases**:
- Loading states
- Async operation feedback
- Data fetching

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| target | string/HTMLElement | - | Target element |
| text | string | - | Loading text |
| background | string | - | Background color |
| fullscreen | boolean | true | Fullscreen mode |

**Example**:
```vue
<el-table v-loading="loading" :data="tableData">
  <!-- columns -->
</el-table>
```

---

### el-message

**Description**: Toast notification messages.

**Use Cases**:
- Toast notifications
- Operation feedback
- Status messages

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| message | string/VNode | - | Message content |
| type | string | 'info' | Type: success, warning, info, error |
| duration | number | 3000 | Display duration |
| show-close | boolean | false | Show close button |

**Example**:
```js
import { ElMessage } from 'element-plus'

ElMessage.success('Success!')
ElMessage.error('Error!')
```

---

### el-message-box

**Description**: Modal alerts, confirms, prompts.

**Use Cases**:
- Alert dialogs
- Confirmation dialogs
- Prompt inputs

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| title | string | - | Dialog title |
| message | string | - | Message content |
| type | string | - | Type: success, warning, info, error |
| confirmButtonText | string | 'OK' | Confirm button text |
| cancelButtonText | string | 'Cancel' | Cancel button text |

**Example**:
```js
import { ElMessageBox } from 'element-plus'

ElMessageBox.confirm('Delete this item?', 'Warning', {
  confirmButtonText: 'OK',
  cancelButtonText: 'Cancel',
  type: 'warning'
})
```

---

### el-notification

**Description**: Corner notification popups.

**Use Cases**:
- Corner notifications
- System alerts
- Background notifications

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| title | string | - | Notification title |
| message | string | - | Message content |
| type | string | - | Type: success, warning, info, error |
| duration | number | 4500 | Display duration |
| position | string | 'top-right' | Position |

**Example**:
```js
import { ElNotification } from 'element-plus'

ElNotification({
  title: 'Success',
  message: 'Operation completed',
  type: 'success'
})
```

---

### el-popconfirm

**Description**: Simple confirmation dialogs.

**Use Cases**:
- Delete confirmations
- Action confirmations
- Quick confirm dialogs

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| title | string | - | Confirmation message |
| confirm-button-text | string | - | Confirm button text |
| cancel-button-text | string | - | Cancel button text |

**Example**:
```vue
<el-popconfirm title="Delete this item?" @confirm="handleDelete">
  <template #reference>
    <el-button type="danger">Delete</el-button>
  </template>
</el-popconfirm>
```

---

### el-popover

**Description**: Rich content popups.

**Use Cases**:
- Rich popups
- Information cards
- Action menus

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| content | string | - | Popover content |
| trigger | string | 'click' | Trigger: click, hover, focus |
| placement | string | 'bottom' | Placement position |
| width | number/string | - | Popover width |

**Example**:
```vue
<el-popover content="Popover content" trigger="hover">
  <template #reference>
    <el-button>Hover me</el-button>
  </template>
</el-popover>
```

---

### el-result

**Description**: Operation result feedback.

**Use Cases**:
- Success pages
- Error pages
- Result displays

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| title | string | - | Result title |
| sub-title | string | - | Sub title |
| icon | string | 'info' | Icon: success, warning, info, error |

**Example**:
```vue
<el-result icon="success" title="Success" sub-title="Operation completed">
  <template #extra>
    <el-button type="primary">Back</el-button>
  </template>
</el-result>
```

---

### el-tooltip

**Description**: Hover tooltip information.

**Use Cases**:
- Hover tooltips
- Help information
- Additional context

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| content | string | - | Tooltip content |
| placement | string | 'bottom' | Placement position |
| effect | string | 'dark' | Effect: dark, light |
| disabled | boolean | false | Disabled state |

**Example**:
```vue
<el-tooltip content="Tooltip text" placement="top">
  <el-button>Hover me</el-button>
</el-tooltip>
```

---

### el-tour

**Description**: Product tour and onboarding.

**Use Cases**:
- Product tours
- Onboarding guides
- Feature walkthroughs

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-model | boolean | false | Tour visibility |
| current | number | 0 | Current step |
| mask | boolean/object | true | Mask configuration |

**Example**:
```vue
<el-tour v-model="open">
  <el-tour-step :target="buttonRef" title="Step 1" description="Description" />
</el-tour>
```

---

## Layout Agents

### el-container

**Description**: Layout containers (header, aside, main, footer).

**Use Cases**:
- Page layouts
- Application structure
- Responsive layouts

**Sub-components**:
- el-header
- el-aside
- el-main
- el-footer

**Example**:
```vue
<el-container>
  <el-header>Header</el-header>
  <el-container>
    <el-aside width="200px">Aside</el-aside>
    <el-main>Main</el-main>
  </el-container>
</el-container>
```

---

### el-space

**Description**: Consistent spacing between elements.

**Use Cases**:
- Element spacing
- Button groups
- Form layouts

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| direction | string | 'horizontal' | Direction: horizontal, vertical |
| size | string/number | 'small' | Spacing size |
| wrap | boolean | false | Auto wrapping |
| fill | boolean | false | Fill container |

**Example**:
```vue
<el-space>
  <el-button>Button 1</el-button>
  <el-button>Button 2</el-button>
</el-space>
```

---

### el-splitter

**Description**: Resizable split panels.

**Use Cases**:
- Split views
- Resizable panels
- Multi-pane interfaces

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| layout | string | 'horizontal' | Layout direction |
| lazy | boolean | false | Lazy mode |

**Example**:
```vue
<el-splitter>
  <el-splitter-panel>Panel 1</el-splitter-panel>
  <el-splitter-panel>Panel 2</el-splitter-panel>
</el-splitter>
```

---

## Utility Agents

### el-config-provider

**Description**: Global configuration wrapper.

**Use Cases**:
- Global settings
- i18n configuration
- Theme configuration

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| locale | object | - | Locale object |
| size | string | 'default' | Global component size |
| z-index | number | - | Initial zIndex |
| namespace | string | 'el' | Component class prefix |

**Example**:
```vue
<el-config-provider :locale="zhCn" size="small">
  <App />
</el-config-provider>
```

---

### el-infinite-scroll

**Description**: Infinite scrolling directive.

**Use Cases**:
- Infinite scrolling lists
- Lazy loading content
- Pagination on scroll

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| v-infinite-scroll | function | - | Load method |
| infinite-scroll-disabled | boolean | false | Disable loading |
| infinite-scroll-distance | number | 0 | Trigger distance |

**Example**:
```vue
<ul v-infinite-scroll="load" :infinite-scroll-disabled="disabled">
  <li v-for="i in count" :key="i">{{ i }}</li>
</ul>
```

---

### el-watermark

**Description**: Text or pattern watermarks.

**Use Cases**:
- Content protection
- Branding
- Copyright notices

**Parameters**:
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| content | string/array | - | Watermark text |
| font | object | - | Font configuration |
| gap | array | [100, 100] | Spacing between watermarks |
| rotate | number | -22 | Rotation angle |

**Example**:
```vue
<el-watermark content="Confidential">
  <div style="height: 500px">Content</div>
</el-watermark>
```

---

## Design Specifications Agents

### element-plus-design-border

**Description**: Border styles, radius, shadows specifications.

**Use Cases**:
- Understanding border styles
- Applying consistent radius
- Using shadow styles

**Key Variables**:
- `--el-border-radius-base`: 4px
- `--el-border-radius-small`: 2px
- `--el-border-radius-round`: 20px
- `--el-box-shadow`: Standard shadow

---

### element-plus-design-color

**Description**: Color palette and semantics specifications.

**Use Cases**:
- Understanding color system
- Applying brand colors
- Using semantic colors

**Key Colors**:
- Primary: #409eff
- Success: #67c23a
- Warning: #e6a23c
- Danger: #f56c6c
- Info: #909399

---

### element-plus-design-layout

**Description**: 24-column grid system specifications.

**Use Cases**:
- Creating responsive layouts
- Building page structures
- Implementing column-based designs

**Key Components**:
- el-row
- el-col
- Breakpoints: xs, sm, md, lg, xl

---

### element-plus-design-typography

**Description**: Font conventions specifications.

**Use Cases**:
- Understanding font conventions
- Applying consistent text styles
- Managing font sizes

**Key Variables**:
- `--el-font-size-base`: 14px
- `--el-font-size-small`: 13px
- `--el-font-size-large`: 18px

---

### element-plus-design-overview

**Description**: Design system overview.

**Use Cases**:
- Quick component reference
- Understanding component categories
- Planning UI implementation

---

## Foundation Agents

### element-plus-quickstart

**Description**: Installation and configuration guide.

**Use Cases**:
- Setting up Element Plus
- Configuring imports
- Initial project setup

---

### element-plus-theming

**Description**: Theme customization guide.

**Use Cases**:
- Customizing themes
- Using CSS variables
- SCSS configuration

---

### element-plus-i18n

**Description**: Internationalization guide.

**Use Cases**:
- Multi-language support
- Locale configuration
- Language switching

---

### element-plus-dark-mode

**Description**: Dark mode implementation guide.

**Use Cases**:
- Implementing dark mode
- Theme switching
- Dark mode styling

---

### element-plus-ssr

**Description**: Server-side rendering guide.

**Use Cases**:
- SSR setup
- Nuxt.js integration
- SSR configuration

---

### element-plus-components

**Description**: Component overview and navigation index.

**Use Cases**:
- Browse all components
- Find component categories
- Navigate to specific skills

---

## 📝 Usage Guidelines

### For AI Agents

1. **Identify User Intent**: Match user requirements to appropriate agent
2. **Check Prerequisites**: Verify required dependencies
3. **Follow Examples**: Use provided code examples as templates
4. **Apply Best Practices**: Follow recommended implementation guidelines

### Invocation Pattern

```
User Request → Agent Identification → Parameter Extraction → Example Application → Result
```

### Error Handling

When encountering errors:
1. Check parameter types and values
2. Verify component dependencies
3. Review best practices section
4. Consult related skills for context

---

## 🔗 Quick Reference

| Task | Agent |
|------|-------|
| Create a form | el-form |
| Display data table | el-table |
| Show notification | el-message |
| Create dialog | el-dialog |
| Add navigation | el-menu |
| Upload files | el-upload |
| Select date | el-date-picker |
| Show progress | el-progress |

---

## 📚 Additional Resources

- [Element Plus Documentation](https://element-plus.org/)
- [Vue 3 Documentation](https://vuejs.org/)
- [Element Plus Icons](https://element-plus.org/en-US/component/icon.html)
