#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把源数据里的种子图导入项目：<source>\\输出\\JPEG\\map_<id>.jpg -> assets/pattern-zh-CN/<命名>.jpg

命名规则与前端 showSeedImage 一致：id < 1000 补足三位（000.jpg），否则原样（1000.jpg）。

用法:
    # 先预览（不改动文件）
    python tools/import_seed_images.py --source "D:\\games\\NightReign\\地图种子信息0.3" --ranges 0-319 --dry-run
    # 实际导入（0-319 与 1000-1199 一起）
    python tools/import_seed_images.py --source "D:\\games\\NightReign\\地图种子信息0.3" --ranges 0-319,1000-1199
"""
import argparse, hashlib, os, sys


def dest_name(seed_id):
    return f'{seed_id:03d}.jpg' if seed_id < 1000 else f'{seed_id}.jpg'


def parse_ranges(text):
    out = []
    for part in text.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            a, b = part.split('-', 1)
            out.extend(range(int(a), int(b) + 1))
        else:
            out.append(int(part))
    return out


def md5(path):
    h = hashlib.md5()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True, help='地图种子信息目录（含 输出\\JPEG）')
    ap.add_argument('--project', default='.')
    ap.add_argument('--ranges', default='0-319,1000-1199')
    ap.add_argument('--dry-run', action='store_true', help='只预览不写文件')
    args = ap.parse_args()

    srcdir = os.path.join(args.source, '输出', 'JPEG')
    dstdir = os.path.join(args.project, 'assets', 'pattern-zh-CN')
    if not os.path.isdir(srcdir):
        sys.exit(f'源目录不存在: {srcdir}')

    ids = parse_ranges(args.ranges)
    added = updated = same = 0
    missing, bytes_written = [], 0
    for i in ids:
        src = os.path.join(srcdir, f'map_{i}.jpg')
        dst = os.path.join(dstdir, dest_name(i))
        if not os.path.exists(src):
            missing.append(i)
            continue
        if os.path.exists(dst) and md5(src) == md5(dst):
            same += 1
            continue
        state = '更新' if os.path.exists(dst) else '新增'
        if state == '更新':
            updated += 1
        else:
            added += 1
        size = os.path.getsize(src)
        bytes_written += size
        print(f'  {state} {dest_name(i):9s} <- map_{i}.jpg  ({size/1024:.0f} KB)')
        if not args.dry_run:
            with open(src, 'rb') as f, open(dst, 'wb') as g:
                while True:
                    chunk = f.read(1 << 20)
                    if not chunk:
                        break
                    g.write(chunk)

    print(f'\n共 {len(ids)} 张: 新增 {added}, 更新 {updated}, 内容相同 {same}, 缺源文件 {len(missing)}')
    if missing:
        print('  缺源文件:', missing)
    if args.dry_run:
        print(f'[dry-run] 未写入任何文件；预计写入 {bytes_written/1024/1024:.1f} MB')
    else:
        print(f'已写入 {bytes_written/1024/1024:.1f} MB')
    total = [f for f in os.listdir(dstdir) if f.endswith('.jpg')]
    print(f'assets/pattern-zh-CN 现在共 {len(total)} 张')


if __name__ == '__main__':
    main()
