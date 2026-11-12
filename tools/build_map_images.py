#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成项目用的「底图 + 点位标记」图片（assets/images/*-POI.png）。

项目画布使用 768x768 坐标系，底图会被拉伸到画布上，因此底图必须正好覆盖
768 空间对应的源图区域。该区域由 tools/build_seed_data.py 拟合出的仿射关系决定：

    768坐标 = a * 源像素 + b

用法:
    python tools/build_map_images.py --source "D:\\games\\NightReign\\地图种子信息0.3" \
        --project . --map Hollow --size 1536
"""
import argparse, json, os, sys

import numpy as np
from PIL import Image, ImageDraw

Image.MAX_IMAGE_PIXELS = None

# 与 build_seed_data.py 拟合结果一致
A, B = 0.172240, -28.64
C, D = 0.172353, -18.09
SPECIAL_OF = {'Default': 0, 'Mountaintop': 1, 'Crater': 2, 'Rotted Woods': 3, 'Hollow': 4, 'Noklateo': 5}


def detect_dot_radius(img_path):
    """从已有底图里量出黄点半径，保持一致外观"""
    im = np.asarray(Image.open(img_path).convert('RGB')).astype(int)
    R, G, Bc = im[..., 0], im[..., 1], im[..., 2]
    mask = (R > 200) & (G > 200) & (Bc < 120)
    if mask.sum() == 0:
        return 26
    ys, xs = np.where(mask)
    # 用面积/个数的粗估：黄点数量取自连通块估计，这里用像素总数的经验
    return int(max(18, min(40, np.sqrt(mask.sum() / max(len(np.unique(xs // 40)) * len(np.unique(ys // 40)), 1)) / 2)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--project', default='.')
    ap.add_argument('--map', default='Hollow')
    ap.add_argument('--size', type=int, default=1536)
    ap.add_argument('--no-dots', action='store_true')
    args = ap.parse_args()

    mt = args.map
    special = SPECIAL_OF[mt]
    model = json.load(open(os.path.join(args.project, 'assets', 'data', 'slot_model.json'), encoding='utf-8'))
    bg = Image.open(os.path.join(args.source, '素材', f'background_{special}.png')).convert('RGB')

    x0, x1 = (0 - B) / A, (768 - B) / A
    y0, y1 = (0 - D) / C, (768 - D) / C
    crop = bg.crop((int(round(x0)), int(round(y0)), int(round(x1)), int(round(y1))))
    out = crop.resize((args.size, args.size), Image.LANCZOS)
    print(f'[{mt}] 源裁剪 x[{x0:.0f},{x1:.0f}] y[{y0:.0f},{y1:.0f}] -> {args.size}px')

    if not args.no_dots:
        ref = os.path.join(args.project, 'assets', 'images', 'Default-POI.png')
        r = detect_dot_radius(ref) if os.path.exists(ref) else 26
        dr = ImageDraw.Draw(out)
        k = args.size / 768.0
        for s in model[mt]:
            px, py = s['x'] * k, s['y'] * k
            dr.ellipse([px - r, py - r, px + r, py + r], fill=(255, 255, 0), outline=(120, 120, 0))
        print(f'[{mt}] 打点 {len(model[mt])} 个，半径 {r}px')

    dst = os.path.join(args.project, 'assets', 'images', f'{mt}-POI.png')
    out.save(dst)
    print(f'[{mt}] 写入 {dst}  {out.size}')


if __name__ == '__main__':
    main()
