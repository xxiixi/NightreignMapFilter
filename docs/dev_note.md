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


