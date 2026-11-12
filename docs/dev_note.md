# 开发笔记

## 0.3 版（520 个地图种子）数据生成流水线

源数据：`D:\games\NightReign\地图种子信息0.3`（`MAP_PATTERN.csv` / `CONSTRUCT.csv` / `坐标.csv` / `素材\`）。
项目侧只用两条命令生成全部数据：

```powershell
# 1) 种子数据 + 点位模型 + 类型图标 + 前端常量表
python tools\build_seed_data.py --source "D:\games\NightReign\地图种子信息0.3" --project . `
    --out-dataset dataset\dataset.json --out-model assets\data\slot_model.json --out-js assets\data\slots.js

# 2) 大空洞底图（底图必须正好覆盖 768 坐标系对应的源图区域，黄点位置才能对上）
python tools\build_map_images.py --source "D:\games\NightReign\地图种子信息0.3" --project . --map Hollow

# 3) 校验：用前端同一套匹配逻辑验证 520 个种子是否都能唯一识别
node tools\verify_app_logic.js

# 4) 导入种子图（0-319 为旧版更新，1000-1199 为新增；先 --dry-run 预览）
python tools\import_seed_images.py --source "D:\games\NightReign\地图种子信息0.3" --ranges 0-319,1000-1199 --dry-run
python tools\import_seed_images.py --source "D:\games\NightReign\地图种子信息0.3" --ranges 0-319,1000-1199
```

> 图片命名规则与 `script.js` 的 `showSeedImage` 一致：id < 1000 补三位（`017.jpg`），否则原样（`1000.jpg`）。
> 2026-01 已完成 0-319 的 0.3 版替换（旧版为 2025.8 渲染，新版 2025.12：签名日期、部分标签由紫色改橙色、
> 默认/山顶/火山口底图重制）。差异示例见 `docs/image-update-before-after.png`。

### 关键结论（踩过的坑）

- **坐标系**：源图 `picX/picY` 是 4775×4775 底图像素；项目画布是 768×768。两者是仿射关系，
  用项目里已人工校准的 320 个种子拟合得到 `x768 = 0.172240*x + (-28.64)`、`y768 = 0.172353*y + (-18.09)`。
  注意不是简单的 `768/4775` 缩放，也不是把 `素材\background_*.png` 裁一块——项目现有的
  `assets/images/*-POI.png` 是另一种构图，所以大空洞底图直接用 `background_4.png` 按上述仿射裁剪。
- **大空洞特殊变换**：`Special=4` 时建筑坐标要先做 `x*1.0186-306 / y*1.0186-260`，
  且 7 个地底坐标点（1107/1110/1153/1159/1160/1174/1175）再 `+862 / +355`。
- **教堂 ≠ 大教堂**：`41xxx/51xxx` 是教堂（加圣杯瓶使用次数），`38xxx/524xx` 是大教堂（战斗地点）。
  项目原先只用了教堂，大教堂/遗迹/主城以前根本不在识别范围里。
- **类型按"外观"归并**：`素材\Construct_<ID>.png` 内容相同（MD5 相同）就是同一种外观，
  合并成一个类型 key；代表 ID 取该组里最小的。
- **坐标索引会重号**：`坐标.csv` 里 300/350/2300/2350 这类不同 ID 指向同一物理位置（新旧版本编号不同），
  必须先换算到 768 坐标再按 20px 聚类成点位。
- 生成器会自动沿用 `data.js`/`slots.js` 里旧点位的 id 与坐标，老 320 个种子人工校准的 11/9/8 个点位数据不会被动到
  （生成时校验：1670 条老数据 0 处冲突）。

### 手工维护的类型表：`tools/type_config.json`

`assets/data/slots.js` 是生成物，**改它会被下次重跑覆盖**。要改类型文案、菜单顺序、某类包含哪些结构 ID，
改 `tools/type_config.json` 再重跑 `build_seed_data.py`：

- `categoryOrder` / `categoryZH`：类别的先后与中文名（菜单按「类别顺序 + 类别内 order」排列）。
- `types.<类型key>.label`：右键菜单里的文案。
- `types.<类型key>.order`：同类内的顺序。
- `types.<类型key>.ids`：该类型包含哪些结构 ID。**想把某个 ID 拆成单独一类，就把它从原来的 `ids` 里挪到新条目**
  （例：`forge_50103` 与 `forge_50116` 素材图相同，但游戏里是死骑士 / 祖民两种，所以拆成两类）。
- `types.<类型key>.icon`：可选，指定图标来源结构 ID（默认取 `ids` 里最小的）。
- 生成图标时，若 `assets/icons/construct/<key>.png` 与源素材不同，视为自定义图标并**保留不覆盖**。

### 布局注意（排查过的一个坑）

显示种子大图后，整页会变宽、右侧「夜晚Boss/特殊事件」栏被挤成 3 列（甚至出现横向滚动条）。原因链：

1. `#seed-image-container` 原来有 `min-width: 900px`；
2. `.results-grid` 用的是 `1fr`，`1fr` 的最小尺寸是 auto（= 内容最小宽度），于是该列被顶到 ≥900px；
3. `.container` 是 `body`（flex 列容器）的子项且带 `margin: 0 auto` —— 横向 auto margin 会让它**不再被拉伸**，
   变成 shrink-to-fit，于是宽度 = min-content（约 1352px）> 视口，整页溢出、右侧栏多挤进一列。

已做的修正：

- `.container` 加 `width: 100%`（配合 `max-width: 1400px` + `margin: 0 auto` 仍然居中）；
- `.results-grid` 改成 `320px minmax(0, 1fr)`，`.left-panel` / `.map-container` 加 `min-width: 0`；
- `#seed-image-container` 去掉 `min-width: 900px`，改为 `width/max-width: 100%; min-width: 0`；
- `.boss-table-container` **最多两列**：默认单列，视口 ≥1280px 才两列。依据：实测（无头浏览器量
  `.nightlord-tag` 的 `offsetTop` 行数）单栏 <572px 时，「三狼事件 / 新型黑夜威胁」这类 8 标签的行会折成两行；
  三列时单栏只有 413px，6 行折行。手机单列会折行，可接受。

**验证手段**：临时放一个页面把 `index.html` 塞进指定宽度的 iframe，自动点击种子/地图/画布，
把 `scrollWidth`、`gridTemplateColumns` 等测量值渲染成文字，用无头 Chrome 截图读取：

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --headless --disable-gpu --no-sandbox `
  --window-size=700,340 --virtual-time-budget=12000 --screenshot=probe.png `
  "http://localhost:8000/_layout_probe.html?w=1280&click=1"
```

（这套探针文件用完即删，不要提交。）

### 数据模型

- `assets/data/slots.js`（生成物）：`POIS_BY_MAP[地图] = [{id,x,y,options:[类型key...]}]`、
  `TYPE_INFO[类型key] = {label, icon, cat}`、`MAP_IMAGES`、`MAP_NAME_ZH`、`NIGHTLORDS`、`MAPS`。
- `dataset/dataset.json`：`poiDatabase.seeds[种子号] = {seedNumber, nightlord, mapType, pois:{点位id: {type,...}}}`。
  `pois` 里没有该点位 = 该点位没有这些建筑。
- 前端匹配按**点位 id 精确匹配**（`getPOITypeById`），不再按坐标容差（大空洞有两个点位只差 35px，容差匹配会串）。
- 点位状态：`dot`(未标注) / `empty`(确认是空的) / 具体类型 key。

---

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
