## 批量重命名 pattern-zh-CN 资源为三位数命名（PowerShell）

- 目标：将 `assets\pattern-zh-CN` 中形如 `map_0.jpg`、`map_20.jpg` 的文件重命名为 `000.jpg`、`020.jpg`（保持原扩展名）。
- 推荐流程：先“预览”，确认无误后再“执行”。

### 预览（不改动文件）
```powershell
$dir = 'assets\pattern-zh-CN'
Get-ChildItem -LiteralPath $dir -File |
  Where-Object { $_.BaseName -match '^map_(\d+)$' } |
  ForEach-Object {
    $n = [int]$matches[1]
    $newName = ('{0:D3}{1}' -f $n, $_.Extension.ToLower())
    if ($_.Name -ne $newName) {
      Write-Host ("{0} -> {1}" -f $_.Name, $newName)
    }
  }
```

### 执行（实际重命名，含重名冲突保护）
```powershell
$dir = 'assets\pattern-zh-CN'
Get-ChildItem -LiteralPath $dir -File |
  Where-Object { $_.BaseName -match '^map_(\d+)$' } |
  ForEach-Object {
    $n = [int]$matches[1]
    $newName = ('{0:D3}{1}' -f $n, $_.Extension.ToLower())
    if ($_.Name -ne $newName) {
      $target = Join-Path $_.DirectoryName $newName
      if (Test-Path -LiteralPath $target) {
        Write-Warning ("目标已存在，跳过: {0}" -f $newName)
      } else {
        Rename-Item -LiteralPath $_.FullName -NewName $newName
      }
    }
  }
```

### 备注
- 如需递归子目录，在 `Get-ChildItem` 增加 `-Recurse`。
- 正则 `^map_(\d+)$` 仅匹配形如 `map_数字` 的文件；不影响已为三位数命名的文件。
- 点击判定与资源文件名无直接关系，重命名无需修改坐标数据。


## 中文图替换与标点校准使用方式

### 启动与页面
- 本地启动：`node server.js`，访问主应用 `http://localhost:8000/index.html`；校准工具 `http://localhost:8000/extraction.html`。
- 开发时已禁用缓存（响应头 + URL 时间戳），资源更新无需手动清缓存。

### 主应用的图片加载策略（单一匹配种子时）
- 优先加载本地中文图：`assets/pattern-zh-CN/{三位数}.jpg`。
- 若缺失，自动回退到远程：`https://www.trc-playground.hu/GameZ/NightreignSeeds/Seeds/{三位数}.jpg`。
- 图片文件名需为三位数（零填充）。

### 校准模式（extraction.html）
1) 选择夜王和种子后，点击“Calibration: Off”切换为 On。
2) 在画布上拖拽橙色圆圈（POI）进行坐标微调（坐标系为 768×768 像素）。
3) 完成后点击“Export POI Coordinates”导出当前地图类型下的最新坐标 JSON：
```json
{
  "mapType": "Default",
  "seed": 1,
  "updatedPOIs": [ { "id": 1, "x": 155, "y": 551 }, ... ]
}
```
4) 将导出的 `updatedPOIs` 同步更新到 `data.js` 中对应地图的 `POIS_BY_MAP[MapName]`。

### 注意事项
- 若 `seedData` 含 0，会请求 `000.jpg`，请在 `assets/pattern-zh-CN` 准备对应图片或选择从 1 开始标注。
- `POIS_BY_MAP` 中坐标为画布绝对像素；底图会被拉伸至 768×768 绘制，需以此为基准校准。
- 点击/命中半径与 `ICON_SIZE` 相关（默认 38，半径 19），如需更易点中可适度调整。

## 图标（Font Awesome 6）引入与使用

- 全局引入（已在 index.html 的 <head> 中添加）：
```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
```

- 使用示例（可在任意位置直接使用类名）：
```html
<!-- 心形（Regular 风格） -->
<i class="fa-regular fa-heart"></i>

<!-- GitHub（品牌类图标） -->
<i class="fab fa-github"></i>
```

- 类名前缀：
  - `fa-solid`/`fa-regular`：同一图标的不同风格
  - `fab`：品牌类图标（GitHub、Twitter 等）

- 可选：改用本地 SVG 资源（无需 Font Awesome）：
```html
<img src="assets/icons/github.svg" alt="GitHub" width="16" height="16">
```
