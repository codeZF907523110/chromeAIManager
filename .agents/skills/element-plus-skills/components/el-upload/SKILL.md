---
name: "el-upload"
description: "Upload component for file uploads via click or drag-and-drop. Invoke when user needs to upload files, images, or documents with preview, validation, and progress tracking."
metadata:
  author: jiaiyan
  version: "1.0.0"
---

# Upload Component

Upload component allows users to upload files by clicking or drag-and-drop, supporting file validation, preview, and progress tracking.

## When to Use

- Upload single or multiple files
- Image upload with preview
- Avatar upload with cropping
- Document upload with validation
- Drag-and-drop file upload

## Basic Usage

```vue
<template>
  <el-upload
    action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
    :on-preview="handlePreview"
    :on-remove="handleRemove"
    :before-remove="beforeRemove"
    multiple
    :limit="3"
    :on-exceed="handleExceed"
    :file-list="fileList"
  >
    <el-button type="primary">Click to upload</el-button>
    <template #tip>
      <div class="el-upload__tip">
        jpg/png files with a size less than 500KB
      </div>
    </template>
  </el-upload>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'

const fileList = ref([])

const handlePreview = (file) => {
  console.log('Preview:', file)
}

const handleRemove = (file, fileList) => {
  console.log('Remove:', file, fileList)
}

const beforeRemove = (file, fileList) => {
  return ElMessageBox.confirm(
    `Cancel the transfer of ${file.name} ?`
  ).then(() => true, () => false)
}

const handleExceed = (files, fileList) => {
  ElMessage.warning(
    `The limit is 3, you selected ${files.length} files this time`
  )
}
</script>
```

## User Avatar Upload

```vue
<template>
  <el-upload
    class="avatar-uploader"
    action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
    :show-file-list="false"
    :on-success="handleAvatarSuccess"
    :before-upload="beforeAvatarUpload"
  >
    <img v-if="imageUrl" :src="imageUrl" class="avatar" />
    <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
  </el-upload>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const imageUrl = ref('')

const handleAvatarSuccess = (response, file) => {
  imageUrl.value = URL.createObjectURL(file.raw)
}

const beforeAvatarUpload = (rawFile) => {
  if (rawFile.type !== 'image/jpeg') {
    ElMessage.error('Avatar picture must be JPG format!')
    return false
  }
  if (rawFile.size / 1024 / 1024 > 2) {
    ElMessage.error('Avatar picture size can not exceed 2MB!')
    return false
  }
  return true
}
</script>

<style>
.avatar-uploader .avatar {
  width: 178px;
  height: 178px;
  display: block;
}
.avatar-uploader .el-upload {
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: var(--el-transition-duration-fast);
}
.avatar-uploader .el-upload:hover {
  border-color: var(--el-color-primary);
}
.avatar-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 178px;
  height: 178px;
  text-align: center;
  line-height: 178px;
}
</style>
```

## Photo Wall

```vue
<template>
  <el-upload
    action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
    list-type="picture-card"
    :on-preview="handlePictureCardPreview"
    :on-remove="handleRemove"
  >
    <el-icon><Plus /></el-icon>
  </el-upload>
  
  <el-dialog v-model="dialogVisible">
    <img w-full :src="dialogImageUrl" alt="Preview Image" />
  </el-dialog>
</template>

<script setup>
import { ref } from 'vue'
import { Plus } from '@element-plus/icons-vue'

const dialogImageUrl = ref('')
const dialogVisible = ref(false)

const handlePictureCardPreview = (file) => {
  dialogImageUrl.value = file.url
  dialogVisible.value = true
}

const handleRemove = (file, fileList) => {
  console.log('Remove:', file, fileList)
}
</script>
```

## Custom Thumbnail

```vue
<template>
  <el-upload
    action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
    list-type="picture-card"
  >
    <template #file="{ file }">
      <div>
        <img class="el-upload-list__item-thumbnail" :src="file.url" alt="" />
        <span class="el-upload-list__item-actions">
          <span
            class="el-upload-list__item-preview"
            @click="handlePictureCardPreview(file)"
          >
            <el-icon><zoom-in /></el-icon>
          </span>
          <span
            class="el-upload-list__item-delete"
            @click="handleDownload(file)"
          >
            <el-icon><Download /></el-icon>
          </span>
          <span
            class="el-upload-list__item-delete"
            @click="handleRemove(file)"
          >
            <el-icon><Delete /></el-icon>
          </span>
        </span>
      </div>
    </template>
  </el-upload>
</template>

<script setup>
import { ZoomIn, Download, Delete } from '@element-plus/icons-vue'

const handlePictureCardPreview = (file) => {
  console.log('Preview:', file)
}

const handleDownload = (file) => {
  console.log('Download:', file)
}

const handleRemove = (file) => {
  console.log('Remove:', file)
}
</script>
```

## Drag and Drop

```vue
<template>
  <el-upload
    class="upload-dragger"
    drag
    action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
    multiple
  >
    <el-icon class="el-icon--upload"><upload-filled /></el-icon>
    <div class="el-upload__text">
      Drop file here or <em>click to upload</em>
    </div>
    <template #tip>
      <div class="el-upload__tip">
        jpg/png files with a size less than 500KB
      </div>
    </template>
  </el-upload>
</template>

<script setup>
import { UploadFilled } from '@element-plus/icons-vue'
</script>
```

## Manual Upload

```vue
<template>
  <el-upload
    ref="uploadRef"
    action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
    :auto-upload="false"
  >
    <template #trigger>
      <el-button type="primary">select file</el-button>
    </template>
    <el-button class="ml-3" type="success" @click="submitUpload">
      upload to server
    </el-button>
    <template #tip>
      <div class="el-upload__tip">
        jpg/png files with a size less than 500KB
      </div>
    </template>
  </el-upload>
</template>

<script setup>
import { ref } from 'vue'

const uploadRef = ref()

const submitUpload = () => {
  uploadRef.value.submit()
}
</script>
```

## Directory Upload

```vue
<template>
  <el-upload
    directory
    action="https://run.mocky.io/v3/9d059bf9-4660-45f2-925d-ce80ad6c4d15"
  >
    <el-button type="primary">Upload Directory</el-button>
  </el-upload>
</template>
```

## Custom HTTP Request

```vue
<template>
  <el-upload
    action="#"
    :http-request="customRequest"
    :on-success="handleSuccess"
    :on-error="handleError"
  >
    <el-button type="primary">Upload with custom request</el-button>
  </el-upload>
</template>

<script setup>
const customRequest = (options) => {
  const { action, file, data, headers, onProgress, onSuccess, onError } = options
  
  const formData = new FormData()
  formData.append('file', file)
  
  Object.keys(data || {}).forEach(key => {
    formData.append(key, data[key])
  })
  
  const xhr = new XMLHttpRequest()
  xhr.open('POST', action, true)
  
  Object.keys(headers || {}).forEach(key => {
    xhr.setRequestHeader(key, headers[key])
  })
  
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      onProgress({ percent: (e.loaded / e.total) * 100 })
    }
  }
  
  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      onSuccess(JSON.parse(xhr.response))
    } else {
      onError(new Error('Upload failed'))
    }
  }
  
  xhr.onerror = () => {
    onError(new Error('Network error'))
  }
  
  xhr.send(formData)
  
  return xhr
}

const handleSuccess = (response) => {
  console.log('Success:', response)
}

const handleError = (error) => {
  console.error('Error:', error)
}
</script>
```

## API Reference

### Attributes

| Name | Description | Type | Default |
|------|-------------|------|---------|
| action | Request URL (required) | `string` | `#` |
| headers | Request headers | `Headers \| Record<string, any>` | — |
| method | Upload request method | `string` | `'post'` |
| multiple | Allow multiple files | `boolean` | `false` |
| data | Additional request data | `Record<string, any> \| (rawFile) => Awaitable<Record>` | `{}` |
| name | Key name for uploaded file | `string` | `'file'` |
| with-credentials | Send cookies | `boolean` | `false` |
| show-file-list | Show uploaded file list | `boolean` | `true` |
| drag | Enable drag and drop | `boolean` | `false` |
| accept | Accepted file types | `string` | `''` |
| crossorigin | Native crossorigin attribute | `'' \| 'anonymous' \| 'use-credentials'` | — |
| on-preview | Hook when clicking uploaded files | `(uploadFile: UploadFile) => void` | — |
| on-remove | Hook when files are removed | `(uploadFile, uploadFiles) => void` | — |
| on-success | Hook on upload success | `(response, uploadFile, uploadFiles) => void` | — |
| on-error | Hook on upload error | `(error, uploadFile, uploadFiles) => void` | — |
| on-progress | Hook on upload progress | `(evt, uploadFile, uploadFiles) => void` | — |
| on-change | Hook on file selection/change | `(uploadFile, uploadFiles) => void` | — |
| on-exceed | Hook when limit exceeded | `(files, uploadFiles) => void` | — |
| before-upload | Hook before upload | `(rawFile) => Awaitable<void \| boolean \| File \| Blob>` | — |
| before-remove | Hook before removing | `(uploadFile, uploadFiles) => Awaitable<boolean>` | — |
| file-list / v-model:file-list | Uploaded files | `UploadUserFile[]` | `[]` |
| list-type | File list type | `'text' \| 'picture' \| 'picture-card'` | `'text'` |
| auto-upload | Auto upload on select | `boolean` | `true` |
| http-request | Override default xhr behavior | `(options) => XMLHttpRequest \| Promise` | — |
| disabled | Disable upload | `boolean` | `false` |
| limit | Maximum uploads allowed | `number` | — |
| directory | Support directory upload | `boolean` | `false` |

### Slots

| Name | Description | Type |
|------|-------------|------|
| default | Customize default content | — |
| trigger | Content that triggers file dialog | — |
| tip | Content of tips | — |
| file | Custom thumbnail template | `{ file: UploadFile, index: number }` |

### Exposes (Methods)

| Name | Description | Type |
|------|-------------|------|
| abort | Cancel upload request | `(file?: UploadFile) => void` |
| submit | Upload file list manually | `() => void` |
| clearFiles | Clear file list | `(status?: UploadStatus[]) => void` |
| handleStart | Select file manually | `(rawFile: UploadRawFile) => void` |
| handleRemove | Remove file manually | `(file, rawFile?) => void` |

### UploadFile Type

```ts
interface UploadFile {
  name: string
  percentage?: number
  status: 'ready' | 'uploading' | 'success' | 'fail'
  size?: number
  response?: unknown
  uid: number
  url?: string
  raw?: UploadRawFile
}
```

## Common Patterns

### File Validation

```vue
<template>
  <el-upload
    action="/api/upload"
    :before-upload="validateFile"
    :on-error="handleError"
  >
    <el-button type="primary">Upload</el-button>
  </el-upload>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const validateFile = (file) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
  const maxSize = 5 * 1024 * 1024
  
  if (!allowedTypes.includes(file.type)) {
    ElMessage.error('Invalid file type!')
    return false
  }
  
  if (file.size > maxSize) {
    ElMessage.error('File size exceeds 5MB!')
    return false
  }
  
  return true
}

const handleError = (error) => {
  ElMessage.error('Upload failed: ' + error.message)
}
</script>
```

### Progress Tracking

```vue
<template>
  <el-upload
    action="/api/upload"
    :on-progress="handleProgress"
    :on-success="handleSuccess"
  >
    <el-button type="primary">Upload</el-button>
  </el-upload>
  
  <el-progress
    v-if="uploading"
    :percentage="progress"
    :status="uploadStatus"
  />
</template>

<script setup>
import { ref } from 'vue'

const uploading = ref(false)
const progress = ref(0)
const uploadStatus = ref('')

const handleProgress = (event) => {
  uploading.value = true
  progress.value = Math.round(event.percent)
}

const handleSuccess = () => {
  uploadStatus.value = 'success'
  setTimeout(() => {
    uploading.value = false
    progress.value = 0
    uploadStatus.value = ''
  }, 1000)
}
</script>
```

### Replace Previous File

```vue
<template>
  <el-upload
    action="/api/upload"
    :limit="1"
    :on-exceed="handleExceed"
  >
    <el-button type="primary">Upload (replaces previous)</el-button>
  </el-upload>
</template>

<script setup>
import { ref } from 'vue'

const fileList = ref([])

const handleExceed = (files) => {
  fileList.value = []
  fileList.value.push(files[0])
}
</script>
```

## Component Interactions

- Use with **Form** for form-based file uploads
- Combine with **Dialog** for upload preview modals
- Use with **Progress** for upload progress display
- Integrate with **Image** for image preview

## Best Practices

1. Always validate file type and size in `before-upload`
2. Use `http-request` for custom upload implementations
3. Handle errors gracefully with user feedback
4. Use `limit` and `on-exceed` for file count restrictions
5. Consider `auto-upload="false"` for manual upload control
6. Use `list-type="picture-card"` for image galleries
