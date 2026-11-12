#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从「黑夜君临地图种子信息」源数据（MAP_PATTERN.csv / CONSTRUCT.csv / 坐标.csv / 素材）
生成项目所需的种子识别数据。

用法:
    python tools/build_seed_data.py --source "D:\\games\\NightReign\\地图种子信息0.3" \
        --project . --out-dataset dataset/dataset.json --out-model assets/data/slot_model.json

设计要点
--------
* 源数据里每个种子由 MAP_PATTERN.csv 的一行描述（夜王索引 / 特殊地形索引），
  建筑分布见 CONSTRUCT.csv，坐标见 坐标.csv（picX/picY 为 4775x4775 底图像素）。
* 项目画布使用 768x768 坐标系，两者之间存在仿射关系；该关系用项目里已人工校准过的
  320 个种子（dataset.json 的坐标）做最小二乘拟合。
* 建筑类型按「游戏里能看到的外观」归并（同一张素材图 = 同一种外观），
  这就是候选类型词表 TYPES。
* 每个地图有一组固定点位（slot）；每个点位有一组可能出现的候选类型。
"""
import argparse, hashlib, json, os, re, sys
from collections import Counter, defaultdict

import numpy as np
import pandas as pd

# --------------------------------------------------------------------------
# 类型词表：结构 ID -> 类型 key
# --------------------------------------------------------------------------
def _cat_map():
    m = {}
    for s, k in [
        (set(range(34000, 34400)) | {52500, 52520, 52550, 52570}, 'ruin'),
        ({38000, 38001, 38002, 38100, 38101, 52400, 52420, 52450, 52460}, 'cathedral'),
        ({41000, 41001, 41002, 41010, 41011, 51000, 51050, 51051}, 'church'),
        (set(range(40000, 40010)) | set(range(40900, 40910)) | set(range(51100, 51110)), 'mage'),
        ({37900, 37901, 37902}, 'village'),
        ({50001, 50011, 50020, 50030, 50040, 50050}, 'marsh'),
        ({50100, 50102, 50103, 50104, 50112, 50113, 50114, 50116}, 'forge'),
        ({49410, 49420, 49430, 53580, 53590, 53670, 53680}, 'city'),
        ({53600, 53610, 53700, 53710, 53720}, 'elite'),
        ({51150}, 'cart'),
    ]:
        for t in s:
            m[t] = k
    return m

CAT_OF = _cat_map()

SPECIAL_TO_MAP = {0: 'Default', 1: 'Mountaintop', 2: 'Crater', 3: 'Rotted Woods', 4: 'Hollow', 5: 'Noklateo'}
NIGHTLORD_BY_INDEX = {0: 'Gladius', 1: 'Adel', 2: 'Gnoster', 3: 'Maris',
                      4: 'Libra', 5: 'Fulghor', 6: 'Caligo', 7: 'Heolstor',
                      8: 'Harmonia', 9: 'Straghess'}
# 大空洞专用：坐标变换（与源作者 汉化地图导出.py 一致）
UNDERGROUND_COORDS = {1160, 1159, 1107, 1110, 1153, 1175, 1174}


# 三类老建筑沿用项目既有 key，其余用「类别_代表结构ID」
LEGACY_KEY = {'church': 'church', 'mage': 'mage', 'village': 'village'}


def load_icon_hashes(materials):
    h = {}
    for f in os.listdir(materials):
        if f.startswith('Construct_') and f.endswith('.png'):
            t = int(f[len('Construct_'):-4])
            h[t] = hashlib.md5(open(os.path.join(materials, f), 'rb').read()).hexdigest()[:8]
    return h


def load_type_config(project):
    """读取手工维护的类型表（标签/顺序/结构ID归属）"""
    path = os.path.join(project, 'tools', 'type_config.json')
    if not os.path.exists(path):
        print('[config] 未找到 tools/type_config.json，使用自动归并')
        return {'categoryOrder': [], 'categoryZH': {}, 'types': {}}
    cfg = json.load(open(path, encoding='utf-8'))
    cfg.setdefault('categoryOrder', [])
    cfg.setdefault('categoryZH', {})
    cfg.setdefault('types', {})
    print(f"[config] 类型表 {len(cfg['types'])} 项")
    return cfg


def build_key_table(icon_of, config, present_ids):
    """结构 ID -> 类型 key。先按 type_config.json 的显式 ids，再按 (类别, 素材图) 自动归并剩余 ID。

    present_ids：源数据里实际出现过的结构 ID，避免给不存在的 ID 造出空类型。
    """
    table, warned = {}, []
    for key, meta in config['types'].items():
        for t in meta.get('ids', []):
            t = int(t)
            if t in table:
                warned.append(f'结构 {t} 同时属于 {table[t]} 和 {key}')
            table[t] = key
            if t not in CAT_OF:
                warned.append(f'结构 {t}（{key}）不在已知类别里，请检查拼写')
    groups = defaultdict(list)
    for t, cat in CAT_OF.items():
        if t in table or t not in present_ids:
            continue
        groups[(cat, icon_of.get(t))].append(t)
    for (cat, _h), ts in groups.items():
        ts = sorted(ts)
        key = LEGACY_KEY.get(cat, f'{cat}_{ts[0]}')
        for t in ts:
            table[t] = key
    for w in warned:
        print(f'[config] 警告: {w}')
    return table


def type_key(stype, key_table):
    """结构 ID -> 类型 key（同类别且同素材图 = 同一个 key）"""
    return key_table.get(int(stype))


def label_of(key, config):
    meta = config['types'].get(key)
    if meta and meta.get('label'):
        return meta['label']
    if key in LABELS:
        return LABELS[key]
    cat, _, rep = key.partition('_')
    return f'{config["categoryZH"].get(cat, cat)} {rep}'


def sort_order(key, config, key_table):
    """菜单排序键：(类别的先后, 类别内 order, key)"""
    cat = key.split('_')[0]
    order = config['categoryOrder']
    cat_idx = order.index(cat) if cat in order else len(order)
    meta = config['types'].get(key) or {}
    inner = meta.get('order')
    if inner is None:
        inner = min((t for t, k in key_table.items() if k == key), default=999)
    return (cat_idx, inner, key)


def icon_source_id(key, config, key_table):
    meta = config['types'].get(key) or {}
    if meta.get('icon'):
        return int(meta['icon'])
    ids = sorted(t for t, k in key_table.items() if k == key)
    return ids[0] if ids else None


def export_icons(key_table, config, materials, project):
    """把每个类型 key 的图标拷进项目；已存在的自定义图标不覆盖"""
    outdir = os.path.join(project, 'assets', 'icons', 'construct')
    os.makedirs(outdir, exist_ok=True)
    keys = sorted({k for k in key_table.values()}, key=lambda k: sort_order(k, config, key_table))
    written = kept = missing = 0
    for k in keys:
        src_id = icon_source_id(k, config, key_table)
        src = os.path.join(materials, f'Construct_{src_id}.png')
        if src_id is None or not os.path.exists(src):
            print(f'[icon] 缺素材 Construct_{src_id}.png（类型 {k}）')
            missing += 1
            continue
        data = open(src, 'rb').read()
        dst = os.path.join(outdir, f'{k}.png')
        if os.path.exists(dst) and open(dst, 'rb').read() != data:
            kept += 1
            continue  # 视为自定义图标，保留
        if not os.path.exists(dst) or open(dst, 'rb').read() != data:
            open(dst, 'wb').write(data)
            written += 1
    print(f'[icon] 类型图标 {len(keys)} 个（新写 {written}，保留自定义 {kept}，缺素材 {missing}）')


# 界面文案：类型 key -> 名称（图标为主，名称用于提示与无障碍）
CAT_ZH = {'church': '教堂', 'mage': '法师塔', 'village': '村庄', 'cathedral': '大教堂',
          'ruin': '遗迹', 'marsh': '湖沼', 'forge': '锻造村', 'city': '主城',
          'elite': '精英', 'cart': '马车'}
LABELS = {
    'church': '教堂', 'mage': '法师塔', 'village': '村庄',
    'cathedral_38000': '大教堂·使者', 'cathedral_38001': '大教堂·守卫',
    'cathedral_38100': '大教堂·火焰',
    'cathedral_52400': '大教堂·圣', 'cathedral_52420': '大教堂·寒冷',
    'cathedral_52450': '大教堂·催眠', 'cathedral_52460': '大教堂·雷',
    'ruin_34000': '遗迹·看门犬', 'ruin_34001': '遗迹·鲜血', 'ruin_34002': '遗迹·萨米尔',
    'ruin_34003': '遗迹·白金', 'ruin_34100': '遗迹·调香师', 'ruin_34102': '遗迹·法师',
    'ruin_34104': '遗迹·卢恩熊', 'ruin_34200': '遗迹·咒死', 'ruin_34300': '遗迹·兽人',
    'city_49410': '主城·失乡', 'city_49420': '主城·山妖', 'city_49430': '主城·熔炉',
    'city_53580': '左上主城·火', 'city_53590': '左上主城·魔',
    'city_53670': '右下主城·腐败', 'city_53680': '右下主城·圣',
    'elite_53600': '精英·恶兆猎人', 'elite_53610': '精英·猎犬骑士',
    'elite_53700': '精英·失乡', 'elite_53710': '精英·咒剑士', 'elite_53720': '精英·噩兆',
    'cart_51150': '马车',
}
MAP_ZH = {'Default': '默认', 'Mountaintop': '山顶', 'Crater': '火山口',
          'Rotted Woods': '腐败森林', 'Noklateo': '隐城', 'Hollow': '大空洞'}
MAP_IMAGE = {'Default': 'Default', 'Mountaintop': 'Mountaintop', 'Crater': 'Crater',
             'Rotted Woods': 'RottedWoods', 'Noklateo': 'Noklateo', 'Hollow': 'Hollow'}
NIGHTLORD_ORDER = ['Gladius', 'Adel', 'Gnoster', 'Maris', 'Libra', 'Fulghor', 'Caligo',
                   'Heolstor', 'Harmonia', 'Straghess']
MAP_ORDER = ['Default', 'Mountaintop', 'Crater', 'Rotted Woods', 'Noklateo', 'Hollow']


def export_slots_js(model, config, key_table, project, out_js):
    """产出前端常量表 assets/data/slots.js"""
    lines = ['// 由 tools/build_seed_data.py 自动生成，请勿手工修改',
             '// 类型文案 / 顺序 / 结构ID归属请改 tools/type_config.json，重跑本脚本即可',
             '// 结构：POIS_BY_MAP[地图][i] = { id, x, y, options:[类型key...] }',
             '']
    lines.append('const NIGHTLORDS = [' + ', '.join(f"'{n}'" for n in NIGHTLORD_ORDER) + ", 'Unknown'];")
    lines.append('const MAPS = [' + ', '.join(f"'{m}'" for m in MAP_ORDER) + '];')
    lines.append('')
    lines.append('const MAP_IMAGES = {')
    for m in MAP_ORDER:
        lines.append(f"  '{m}': 'assets/images/{MAP_IMAGE[m]}-POI.png',")
    lines.append('};')
    lines.append('')
    lines.append('const MAP_NAME_ZH = {')
    for m in MAP_ORDER:
        lines.append(f"  '{m}': '{MAP_ZH[m]}',")
    lines.append('};')
    lines.append('')
    used_keys = sorted({o for sl in model.values() for s in sl for o in s['options']},
                       key=lambda k: sort_order(k, config, key_table))
    lines.append('const TYPE_INFO = {')
    for k in used_keys:
        cat = k.split('_')[0]
        lines.append(f"  '{k}': {{ label: '{label_of(k, config)}', icon: 'assets/icons/construct/{k}.png', cat: '{cat}' }},")
    lines.append('};')
    lines.append('')
    lines.append('// 每个点位的候选类型按 type_config.json 的类别顺序 + 类别内 order 排列')
    lines.append('const POIS_BY_MAP = {')
    for m in MAP_ORDER:
        lines.append(f"  '{m}': [")
        for s in model[m]:
            opts = sorted(s['options'], key=lambda k: sort_order(k, config, key_table))
            opt_str = ', '.join(f"'{o}'" for o in opts)
            lines.append(f"    {{ id: {s['id']}, x: {s['x']}, y: {s['y']}, options: [{opt_str}] }},")
        lines.append('  ],')
    lines.append('};')
    lines.append('')
    path = os.path.join(project, out_js)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
    print(f'[out] 写入 {out_js}（{len(used_keys)} 个类型）')


def parse_existing_slots(slots_js):
    """从上一轮生成的 assets/data/slots.js 里读回旧点位（沿用其 id 与坐标，保证老数据不漂移）"""
    if not os.path.exists(slots_js):
        return {}
    txt = open(slots_js, encoding='utf-8').read()
    if 'const POIS_BY_MAP' not in txt:
        return {}
    block = txt[txt.index('const POIS_BY_MAP'):]
    slots, cur = {}, None
    for line in block.splitlines():
        m = re.match(r"""\s*['"]([^'"]+)['"]\s*:\s*\[""", line)
        if m:
            cur = m.group(1).strip()
            slots[cur] = []
            continue
        if line.strip() == '};':
            cur = None
            continue
        m = re.match(r"\s*\{\s*id:\s*(\d+),\s*x:\s*(-?\d+(?:\.\d+)?),\s*y:\s*(-?\d+(?:\.\d+)?)", line)
        if m and cur is not None:
            slots[cur].append(dict(id=int(m.group(1)), x=float(m.group(2)), y=float(m.group(3))))
    return slots


def fit_transform(source, project, key_table):
    """用已校准的 320 个种子拟合 源(4775) -> 项目(768) 的仿射变换"""
    coord_df = pd.read_csv(os.path.join(source, '坐标.csv'), encoding='utf-8-sig')
    coord = {int(r.ID): (float(r.picX), float(r.picY)) for r in coord_df.itertuples()}
    cs = pd.read_csv(os.path.join(source, 'CONSTRUCT.csv'), encoding='utf-8-sig').rename(columns={'Unnamed: 4': 'ci'})
    cs = cs[cs['is_display'] == 1]
    mp = pd.read_csv(os.path.join(source, 'MAP_PATTERN.csv'), encoding='utf-8-sig').set_index('ID')
    old = json.load(open(os.path.join(project, 'dataset', 'dataset.json'), encoding='utf-8'))['poiDatabase']['seeds']

    a, b = 768.0 / 4775.0, 0.0
    c, d = 768.0 / 4775.0, 0.0
    # 只用人工校准过的老三类点位参与拟合，保证变换可复现、不随新点位漂移
    CALIB = {'church', 'mage', 'village'}
    for _ in range(8):
        pairs = []
        for k, s in old.items():
            sid = int(k)
            sub = cs[(cs['MAP'] == sid)]
            sub = sub[[type_key(t, key_table) is not None for t in sub['type']]]
            if sub.empty:
                continue
            px = np.array([coord[i][0] for i in sub['ci']]) * a + b
            py = np.array([coord[i][1] for i in sub['ci']]) * c + d
            for poi in s['pois'].values():
                if poi['type'] not in CALIB:
                    continue
                gx, gy = poi['coordinates']['x'], poi['coordinates']['y']
                dd = np.hypot(px - gx, py - gy)
                j = int(np.argmin(dd))
                if dd[j] < 30:
                    pairs.append((coord[sub.iloc[j]['ci']][0], coord[sub.iloc[j]['ci']][1], gx, gy))
        P = np.array(pairs, dtype=float)
        a, b = np.polyfit(P[:, 0], P[:, 2], 1)
        c, d = np.polyfit(P[:, 1], P[:, 3], 1)
    return (a, b, c, d), len(pairs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source', required=True)
    ap.add_argument('--project', default='.')
    ap.add_argument('--out-dataset', default='dataset/dataset.json')
    ap.add_argument('--out-model', default='assets/data/slot_model.json')
    ap.add_argument('--out-js', default='assets/data/slots.js')
    ap.add_argument('--report', default=None)
    args = ap.parse_args()

    src, proj = args.source, args.project
    materials = os.path.join(src, '素材')
    icon_of = load_icon_hashes(materials)
    mp = pd.read_csv(os.path.join(src, 'MAP_PATTERN.csv'), encoding='utf-8-sig').set_index('ID')
    cs = pd.read_csv(os.path.join(src, 'CONSTRUCT.csv'), encoding='utf-8-sig').rename(columns={'Unnamed: 4': 'ci'})
    present_ids = set(int(t) for t in cs[cs['is_display'] == 1]['type'])
    config = load_type_config(proj)
    key_table = build_key_table(icon_of, config, present_ids)
    export_icons(key_table, config, materials, proj)
    coord_df = pd.read_csv(os.path.join(src, '坐标.csv'), encoding='utf-8-sig')
    coord = {int(r.ID): (float(r.picX), float(r.picY)) for r in coord_df.itertuples()}
    existing = parse_existing_slots(os.path.join(proj, 'assets', 'data', 'slots.js'))

    (a, b, c, d), npairs = fit_transform(src, proj, key_table)
    print(f'[fit] x768={a:.6f}*picX+{b:.2f}  y768={c:.6f}*picY+{d:.2f}  (参与拟合 {npairs} 个对应点)')

    def pos768(ci, special):
        x, y = coord[ci]
        if special == 4:
            x, y = x * 1.0186 - 306, y * 1.0186 - 260
            if ci in UNDERGROUND_COORDS:
                x, y = x + 862, y + 355
        return x * a + b, y * c + d

    # ---- 收集所有建筑 ----
    rows = []
    for sid in mp.index:
        special = int(mp.loc[sid, 'Special'])
        mt = SPECIAL_TO_MAP[special]
        for r in cs[(cs['MAP'] == sid) & (cs['is_display'] == 1)].itertuples():
            k = type_key(r.type, key_table)
            if k is None:
                continue
            px, py = pos768(r.ci, special)
            rows.append((sid, mt, int(r.type), k, px, py))
    B = pd.DataFrame(rows, columns=['seed', 'map', 'type', 'key', 'px', 'py'])

    def cluster(sub, tol=20):
        used = np.zeros(len(sub), dtype=bool)
        out = []
        for i in range(len(sub)):
            if used[i]:
                continue
            c = sub.iloc[i][['px', 'py']].values.astype(float)
            members = [i]
            used[i] = True
            changed = True
            while changed:
                changed = False
                for j in range(len(sub)):
                    if used[j]:
                        continue
                    if np.hypot(*(sub.iloc[j][['px', 'py']].values - c)) < tol:
                        used[j] = True
                        members.append(j)
                        c = sub.iloc[members][['px', 'py']].values.mean(axis=0)
                        changed = True
            out.append(dict(c=c, members=members))
        return out

    # ---- 每个地图的点位模型 ----
    model, slot_of = {}, {}
    for mt in ['Default', 'Mountaintop', 'Crater', 'Rotted Woods', 'Noklateo', 'Hollow']:
        g = B[B['map'] == mt]
        cents = cluster(g)
        old_slots = existing.get(mt, [])
        used_ids = {s['id'] for s in old_slots}
        slots = []
        for cen in cents:
            sub = g.iloc[cen['members']]
            cx, cy = float(cen['c'][0]), float(cen['c'][1])
            opts = Counter(sub.key)
            # 与项目里已有点位对齐（<22px 且 id 未被占用）
            sid = None
            for s in old_slots:
                if s['id'] in used_ids and np.hypot(s['x'] - cx, s['y'] - cy) < 22:
                    sid, ox, oy = s['id'], s['x'], s['y']
                    used_ids.discard(s['id'])
                    break
            new = sid is None
            if new:
                sid = max(used_ids | {s['id'] for s in old_slots} | {0}) + 1
                used_ids.add(sid)
                ox, oy = round(cx, 1), round(cy, 1)
            slots.append(dict(id=sid, x=ox, y=oy, is_new=new,
                              options=[k for k, _ in opts.most_common()],
                              ids={k: sorted(set(sub[sub.key == k]['type'])) for k in opts},
                              seeds=int(sub.seed.nunique())))
        slots.sort(key=lambda s: s['id'])
        model[mt] = slots
        slot_of[mt] = slots
        print(f'[slots] {mt}: {len(slots)} 个点位（沿用旧点位 {sum(1 for s in slots if not s["is_new"])} 个，新增 {sum(1 for s in slots if s["is_new"])} 个）')

    # ---- 为每个种子生成 POI 数据 ----
    old_ds = json.load(open(os.path.join(proj, 'dataset', 'dataset.json'), encoding='utf-8'))
    old_seeds = old_ds['poiDatabase']['seeds']
    old_cls = old_ds.get('classifications', {})

    new_seeds, new_cls, conflicts = {}, {}, []
    for sid in mp.index:
        special = int(mp.loc[sid, 'Special'])
        mt = SPECIAL_TO_MAP[special]
        nlx = int(mp.loc[sid, 'NightLord'])
        entry = dict(seedNumber=int(sid), nightlord=NIGHTLORD_BY_INDEX[nlx], mapType=mt, pois={})
        cls = {}
        sub = B[B['seed'] == sid]
        for slot in slot_of[mt]:
            near = sub[np.hypot(sub.px - slot['x'], sub.py - slot['y']) < 22]
            tks = list(near.key)
            if sid < 1000:
                # 旧种子：保留人工校准过的老点位数据
                keep = old_seeds.get(str(sid), {}).get('pois', {}).get(str(slot['id']))
                if keep:
                    entry['pois'][str(slot['id'])] = dict(id=slot['id'], coordinates={'x': slot['x'], 'y': slot['y']}, type=keep['type'])
                    cls[f'POI{slot["id"]}'] = keep['type']
                    if tks:
                        conflicts.append((sid, slot['id'], keep['type'], tks))
                    continue
            if not tks:
                continue
            tk = Counter(tks).most_common(1)[0][0]
            entry['pois'][str(slot['id'])] = dict(id=slot['id'], coordinates={'x': slot['x'], 'y': slot['y']}, type=tk)
            cls[f'POI{slot["id"]}'] = tk
        new_seeds[str(sid)] = entry
        new_cls[str(sid)] = cls

    keep_cls = {k: v for k, v in old_cls.items() if k in [str(i) for i in range(320)] and v}
    out = dict(old_ds)
    out['version'] = '2025-12-0.3'
    out['lastUpdated'] = pd.Timestamp.utcnow().strftime('%Y-%m-%dT%H:%M:%S.000Z')
    out['currentSeed'] = int(max(mp.index))
    out['poiDatabase'] = dict(old_ds['poiDatabase'])
    out['poiDatabase']['seeds'] = {k: v for k, v in sorted(new_seeds.items(), key=lambda kv: int(kv[0]))}
    out['classifications'] = {**keep_cls, **{k: v for k, v in new_cls.items() if k not in keep_cls}}
    os.makedirs(os.path.dirname(os.path.join(proj, args.out_dataset)), exist_ok=True)
    json.dump(out, open(os.path.join(proj, args.out_dataset), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'[out] 写入 {args.out_dataset}: {len(out["poiDatabase"]["seeds"])} 个种子')

    model_out = {mt: [dict(id=s['id'], x=s['x'], y=s['y'], options=s['options'],
                           ids=s['ids'], isNew=s['is_new']) for s in sl]
                 for mt, sl in model.items()}
    os.makedirs(os.path.dirname(os.path.join(proj, args.out_model)), exist_ok=True)
    json.dump(model_out, open(os.path.join(proj, args.out_model), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'[out] 写入 {args.out_model}')
    export_slots_js(model, config, key_table, proj, args.out_js)

    # ---- 校验 ----
    print('\n=== 校验 ===')
    bad = [(s, i, h, t) for s, i, h, t in conflicts if len(t) == 1 and t[0] != h]
    print(f'旧种子老点位：与人工数据不一致 {len(bad)} 处 / {sum(len(v.get("pois", {})) for k, v in old_seeds.items())} 处')
    for s, i, h, t in bad[:10]:
        print(f'   seed {s} 点位{i}: 人工={h} 推导={t[0]}')

    # 唯一性：按 (夜王, 地图) 分组，用全部点位取值作为签名
    sig = defaultdict(list)
    for k, v in out['poiDatabase']['seeds'].items():
        key = (v['nightlord'], v['mapType'])
        s = '|'.join(f'{k2}:{p["type"]}' for k2, p in sorted(v['pois'].items(), key=lambda kv: int(kv[0])))
        sig[key].append((k, s))
    worst = 0
    for key, lst in sorted(sig.items()):
        c = Counter(s for _, s in lst)
        worst = max(worst, c.most_common(1)[0][1])
    print(f'按(夜王,地图)分组后，同签名最多种子数 = {worst}（1 表示全部可唯一识别）')
    total = Counter(s for lst in sig.values() for _, s in lst)
    print(f'全库同签名最多种子数 = {total.most_common(1)[0][1]}')


if __name__ == '__main__':
    main()
