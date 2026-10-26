"""
車体モデル生成（Blender 4.x ヘッドレス）。
  blender --background --python tools/blender/make_cars.py -- public/models/cars

側面シルエット（屋根線・ベルトライン・床）と平面シルエット（半幅）を関数で定義し、
長手方向に 60 スライス × 断面 13 点のメッシュを直接組み立てる（サブディビジョン不使用）。
ホイールアーチは側面点を押し上げて作る。クーペ / ハッチ / セダン / GT の 4 車種。

マテリアル名（ゲーム側が色を差し替える）:
  Paint（下半分） PaintUpper（上半分） Glass  Trim  HeadLamp  TailLamp  Chrome  Wing（別オブジェクト）
座標: 前方 = Blender -Y（glTF 変換後にゲームの +Z）。上 = +Z。単位 m。原点 = 車体中心、路面 z=0。
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = Path(args[0] if args else "public/models/cars")
OUT.mkdir(parents=True, exist_ok=True)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, rgba, metallic=0.0, roughness=0.5, emission=None, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = 2.0
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.blend_method = "BLEND"
    return mat


def interp(points, y):
    """折れ線 [(y, v)] を滑らかに補間（コサイン補間）"""
    if y <= points[0][0]:
        return points[0][1]
    if y >= points[-1][0]:
        return points[-1][1]
    for (y0, v0), (y1, v1) in zip(points[:-1], points[1:]):
        if y0 <= y <= y1:
            t = (y - y0) / (y1 - y0) if y1 > y0 else 0
            t = (1 - math.cos(t * math.pi)) / 2
            return v0 + (v1 - v0) * t
    return points[-1][1]


def smooth_by_angle(obj, angle):
    """Blender 4.0 の use_auto_smooth と、4.1〜5.x の shade_smooth_by_angle / shade_auto_smooth の両方に対応"""
    me = obj.data
    if hasattr(me, "use_auto_smooth"):
        me.use_auto_smooth = True
        me.auto_smooth_angle = angle
        return
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for op_name in ("shade_smooth_by_angle", "shade_auto_smooth"):
        op = getattr(bpy.ops.object, op_name, None)
        if op is not None:
            op(angle=angle)
            return
    # どちらも無ければ通常のスムーズのまま（glTF 書き出し時に法線は頂点法線になる）


def add_box(name, size, loc, mat, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.data.materials.append(mat)
    bpy.ops.object.transform_apply(scale=True)
    if parent is not None:
        o.parent = parent
    return o


def add_cyl(name, r, depth, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=16)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(mat)
    return o


def build_car(spec):
    clear()
    paint = material("Paint", (0.8, 0.1, 0.08, 1), metallic=0.3, roughness=0.3)
    paint_upper = material("PaintUpper", (0.8, 0.1, 0.08, 1), metallic=0.3, roughness=0.3)
    glass = material("Glass", (0.06, 0.08, 0.1, 1), metallic=0.1, roughness=0.05, alpha=0.8)
    trim = material("Trim", (0.05, 0.05, 0.055, 1), roughness=0.7)
    head = material("HeadLamp", (0.95, 0.95, 0.9, 1), roughness=0.1, emission=(1.0, 0.93, 0.7, 1))
    tail = material("TailLamp", (0.5, 0.03, 0.03, 1), roughness=0.15, emission=(1.0, 0.1, 0.1, 1))
    chrome = material("Chrome", (0.8, 0.8, 0.82, 1), metallic=0.9, roughness=0.25)

    L = spec["length"]
    hl = L / 2
    top = spec["top"]  # [(y, z)] 屋根線（前 -hl → 後 +hl）
    belt = spec["belt"]
    width = spec["width"]  # [(y, half width)]
    floor_z = spec["floor"]
    cabin = spec["cabin"]  # (y_front, y_rear): キャビンがある範囲
    wb = spec["wheelbase"]
    arch_r = spec["arch_r"]
    wheel_z = spec["wheel_z"]

    N = 60
    K = 12  # 半断面の点数
    bm = bmesh.new()
    rings = []
    ring_info = []  # (y, z_belt, z_top, cabin?)
    for i in range(N + 1):
        y = -hl + L * i / N
        zt = interp(top, y)
        zb = interp(belt, y)
        w = interp(width, y)
        in_cabin = cabin[0] <= y <= cabin[1] and zt > zb + 0.15
        wc = w * (spec["cabin_ratio"] if in_cabin else 0.94)
        zf = floor_z + (0.12 if (abs(y) > hl - 0.25) else 0.0)  # 端はバンパー下をえぐる
        # ホイールアーチ: 車輪位置の近くで側面下部を持ち上げる
        arch = 0.0
        for yw in (-wb / 2, wb / 2):
            d = abs(y - yw)
            if d < arch_r:
                arch = max(arch, wheel_z + math.sqrt(arch_r**2 - d**2))
        pts = [
            (0.0, zf),
            (w * 0.78, zf),
            (w * 0.95, zf + 0.07),
            (w, zf + 0.22),
            (w * 1.0, zb - 0.16),
            (w * 0.985, zb),
        ]
        if arch > zf:
            # 外側 4 点をアーチ形状に
            pts[1] = (w * 0.74, zf)
            pts[2] = (w * 0.92, max(zf + 0.07, arch - 0.02))
            pts[3] = (w * 0.985, max(zf + 0.22, arch + 0.03))
            pts[4] = (w * 1.0, max(zb - 0.16, arch + 0.06))
        h = max(zt - zb, 0.02)
        upper = [
            (wc * 1.0, zb + h * 0.06),
            (wc * 0.97, zb + h * 0.35),
            (wc * 0.9, zb + h * 0.68),
            (wc * 0.72, zb + h * 0.92),
            (wc * 0.4, zb + h * 1.0),
            (0.0, zb + h * 1.0),
        ]
        pts += upper
        assert len(pts) == K, len(pts)
        right = [Vector((x, y, z)) for x, z in pts]
        left = [Vector((-x, y, z)) for x, z in reversed(pts[1:-1])]
        ring = [bm.verts.new(v) for v in right + left]
        rings.append(ring)
        ring_info.append((y, zb, zt, in_cabin))
    n = len(rings[0])
    faces = []
    for a, b, ia in zip(rings[:-1], rings[1:], range(N)):
        for j in range(n):
            v0, v1, v2, v3 = a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]
            try:
                f = bm.faces.new((v0, v1, v2, v3))
                faces.append((f, ia, j))
            except ValueError:
                pass
    cap_f = bm.faces.new(rings[0])
    cap_r = bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("Body")
    bm.to_mesh(me)
    me.materials.append(paint)
    me.materials.append(paint_upper)
    me.materials.append(glass)
    me.materials.append(trim)
    # マテリアル割り当て: 点インデックス j（0..n-1）で断面上の位置が分かる
    half = K - 1  # 右半分の最後のインデックス（天井中央）
    def side_index(j):
        return j if j <= half else (2 * half - j)  # 左右対称
    for f, ia, j in faces:
        y, zb, zt, in_cabin = ring_info[ia]
        k = side_index(j)  # 0..half-1 は k→k+1 の帯
        is_upper_band = k >= 6  # ベルトラインより上
        glass_face = False
        if in_cabin and is_upper_band and k <= 9:
            glass_face = True  # サイドガラス（ルーフの丸みより下）
        # フロントガラス / リアガラス: 屋根線が急に上がる/下がる区間の上面
        slope = (interp(top, y + 0.08) - interp(top, y - 0.08)) / 0.16
        if is_upper_band and abs(slope) > 0.35 and zt > zb + 0.2:
            glass_face = True
        poly = me.polygons[f.index]
        if glass_face:
            poly.material_index = 2
        elif is_upper_band or (k >= 4 and zt > spec["split"]):
            poly.material_index = 1 if (sum(me.vertices[v].co.z for v in poly.vertices) / 4) > spec["split"] else 0
        else:
            poly.material_index = 0
        # ホイールアーチ内側は黒
        for yw in (-wb / 2, wb / 2):
            if abs(y - yw) < arch_r - 0.02 and 1 <= k <= 3:
                poly.material_index = 3
    me.polygons[cap_f.index].material_index = 3
    me.polygons[cap_r.index].material_index = 3
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    body = bpy.data.objects.new("Body", me)
    bpy.context.collection.objects.link(body)
    # 自動スムーズ（折れ目を保つ）。Blender 4.0 以前はメッシュ属性、4.1 以降は「角度でスムーズ」モディファイア
    smooth_by_angle(body, math.radians(38))

    # ランプ・グリル・ミラー・マフラー
    w_front = interp(width, -hl + 0.05)
    w_rear = interp(width, hl - 0.05)
    zb_f = interp(belt, -hl + 0.05)
    zb_r = interp(belt, hl - 0.05)
    z_nose = interp(top, -hl + 0.02)
    z_tail = interp(top, hl - 0.02)
    add_box("Grille", (w_front * 1.1, 0.05, 0.12), (0, -hl - 0.005, floor_z + 0.3), trim)
    for sx in (-1, 1):
        add_box("HeadLamp", (0.3, 0.06, 0.1), (sx * w_front * 0.6, -hl - 0.01, z_nose - 0.1), head)
        add_box("TailLamp", (0.42, 0.05, 0.11), (sx * w_rear * 0.58, hl + 0.005, z_tail - 0.1), tail)
        wc_m = interp(width, cabin[0] + 0.1) * spec["cabin_ratio"]
        add_box("MirrorStalk", (0.12, 0.03, 0.03), (sx * (wc_m + 0.05), cabin[0] + 0.1, interp(belt, cabin[0]) + 0.2), trim)
        add_box("Mirror", (0.16, 0.09, 0.08), (sx * (wc_m + 0.14), cabin[0] + 0.1, interp(belt, cabin[0]) + 0.22), paint)
    add_cyl("Exhaust", 0.04, 0.16, (w_rear * 0.5, hl - 0.03, floor_z + 0.08), chrome, rot=(math.pi / 2, 0, 0))
    # ピラー（細い柱で窓を区切る）
    for yp, name in ((cabin[0] + 0.05, "APillar"), ((cabin[0] + cabin[1]) / 2, "BPillar"), (cabin[1] - 0.05, "CPillar")):
        wpc = interp(width, yp) * spec["cabin_ratio"]
        zbp = interp(belt, yp)
        ztp = interp(top, yp)
        for sx in (-1, 1):
            add_box(name, (0.05, 0.06, max(ztp - zbp - 0.1, 0.1)), (sx * wpc * 0.985, yp, (zbp + ztp) / 2), trim)
    # ウィング
    z_deck = interp(top, hl - 0.3)
    wing = add_box("Wing", (w_rear * 1.9, 0.26, 0.04), (0, hl - 0.3, z_deck + 0.3), paint_upper)
    for sx in (-1, 1):
        add_box("WingStay", (0.06, 0.18, 0.26), (sx * w_rear * 0.7, hl - 0.3, z_deck + 0.15), trim, parent=wing)

    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o.name != "Body":
            for p in o.data.polygons:
                p.use_smooth = False
    path = OUT / f"{spec['id']}.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_apply=True, export_yup=True)
    print("exported", path)


def spec(id, L, W, floor, top, belt, width, cabin, cabin_ratio, wheelbase, arch_r, wheel_z, split):
    return dict(id=id, length=L, floor=floor, top=top, belt=belt, width=width, cabin=cabin, cabin_ratio=cabin_ratio, wheelbase=wheelbase, arch_r=arch_r, wheel_z=wheel_z, split=split)


COUPE = spec("coupe", 4.3, 1.76, 0.17,
    top=[(-2.15, 0.52), (-1.95, 0.62), (-1.2, 0.72), (-0.6, 0.78), (-0.1, 1.12), (0.25, 1.24), (0.85, 1.22), (1.45, 0.98), (1.85, 0.82), (2.15, 0.78)],
    belt=[(-2.15, 0.6), (-0.6, 0.76), (1.0, 0.8), (2.15, 0.82)],
    width=[(-2.15, 0.74), (-1.8, 0.84), (-0.5, 0.88), (1.2, 0.88), (1.9, 0.84), (2.15, 0.76)],
    cabin=(-0.55, 1.55), cabin_ratio=0.8, wheelbase=2.55, arch_r=0.4, wheel_z=0.33, split=0.5)
HATCH = spec("hatch", 4.0, 1.66, 0.19,
    top=[(-2.0, 0.55), (-1.8, 0.66), (-1.1, 0.74), (-0.55, 0.8), (-0.1, 1.2), (0.3, 1.3), (1.1, 1.3), (1.6, 1.12), (1.9, 0.92), (2.0, 0.84)],
    belt=[(-2.0, 0.62), (-0.5, 0.78), (2.0, 0.84)],
    width=[(-2.0, 0.7), (-1.7, 0.8), (-0.3, 0.83), (1.3, 0.83), (1.8, 0.8), (2.0, 0.74)],
    cabin=(-0.5, 1.75), cabin_ratio=0.82, wheelbase=2.4, arch_r=0.39, wheel_z=0.33, split=0.52)
SEDAN = spec("sedan", 4.6, 1.8, 0.19,
    top=[(-2.3, 0.55), (-2.05, 0.66), (-1.2, 0.76), (-0.6, 0.82), (-0.15, 1.2), (0.3, 1.33), (0.95, 1.32), (1.5, 1.05), (1.85, 0.86), (2.3, 0.82)],
    belt=[(-2.3, 0.64), (-0.6, 0.8), (1.2, 0.84), (2.3, 0.86)],
    width=[(-2.3, 0.76), (-1.9, 0.86), (-0.5, 0.9), (1.4, 0.9), (2.0, 0.86), (2.3, 0.78)],
    cabin=(-0.6, 1.6), cabin_ratio=0.83, wheelbase=2.65, arch_r=0.41, wheel_z=0.34, split=0.52)
GT = spec("gt", 4.55, 1.82, 0.16,
    top=[(-2.28, 0.5), (-2.05, 0.6), (-1.3, 0.7), (-0.65, 0.76), (-0.2, 1.1), (0.3, 1.26), (0.9, 1.25), (1.5, 1.0), (1.9, 0.84), (2.28, 0.8)],
    belt=[(-2.28, 0.6), (-0.6, 0.76), (1.2, 0.82), (2.28, 0.84)],
    width=[(-2.28, 0.76), (-1.9, 0.88), (-0.5, 0.91), (1.4, 0.91), (2.0, 0.87), (2.28, 0.78)],
    cabin=(-0.65, 1.6), cabin_ratio=0.8, wheelbase=2.6, arch_r=0.42, wheel_z=0.34, split=0.5)

for s in (COUPE, HATCH, SEDAN, GT):
    build_car(s)
