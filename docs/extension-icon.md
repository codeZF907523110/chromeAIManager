# 扩展图标（icons/）

## 现状

- `manifest.json` 的 `icons` 声明 4 个尺寸：`icons/icon-{16,32,48,128}.png`（Chrome 扩展图标必须方形，非方形位图会被拉伸变形）。
- 设计源图为 `icons/icon-111.jpg`（802×663、无透明通道、白底）。
- 构建时 `vite.config.ts` 的 `chromeExtensionPlugin` 只把 `icons/*.png` 拷进 dist，源图 jpg 不进产物。

## 从源图重新生成图标

源图非方形，先居中裁成方形再缩放（macOS 自带 sips，无需额外依赖）：

```bash
cd icons
# 1) 居中裁成 663x663 方形（取高度为边长，裁掉两侧多余宽度）
sips -c 663 663 icon-111.jpg --out /tmp/icon-square.png
# 2) 缩放出 4 个尺寸，覆盖 manifest 引用的 PNG
for n in 128 48 32 16; do
  sips -s format png -z $n $n /tmp/icon-square.png --out icon-$n.png
done
```

注意：sips 的 `-c` 参数顺序是「高 宽」；生成后用 `sips -g pixelWidth -g pixelHeight` 或 `file` 核对尺寸与格式。

## 替换新源图时

1. 新源图放入 `icons/`（jpg/png 均可，png 可保留透明通道）。
2. 若边长与上例不同，`-c` 的裁剪边长取「 min(宽, 高) 」。
3. 重新执行上述命令后 `pnpm build`，在 `chrome://extensions` 里对扩展点「重新加载」即可看到新图标。
