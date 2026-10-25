"""
サンプル GLB アセット生成スクリプト（Blender 4.x, ヘッドレス実行）。

  blender --background --python tools/blender/make_sample_assets.py -- public/models

生成物（すべて架空の簡易形状。実在の構造物・BIM データではない）:
  bridge-segment.glb    橋梁セグメント（走行可能なデッキ + 主桁 + 高欄 + 橋脚）。既存コースへの配置用
  bim-bridge-course.glb 道路 + 橋梁の BIM 風コースモデル（走行路ノード名 Road_* / Deck_*）
  shrine-gate.glb       鳥居風ゲート（装飾用）

Blender は Z-up / Y-forward、glTF エクスポータが Y-up へ変換する:
  game.x = blender.x, game.y = blender.z, game.z = -blender.y
走行路として扱うノードは名前が Road_ / Deck_ で始まる（BimModelImporter の既定パターン）。
"""
import math
import sys
from pathlib import Path

import bpy

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = Path(args[0] if args else "public/models")
OUT.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def material(name, rgba, metallic=0.0, roughness=0.8):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
    return mat


def box(name, size, location, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = size
    obj.data.materials.append(mat)
    return obj


def mesh_from_data(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def export(path):
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", export_apply=True, export_yup=True)
    print("exported", path)


# ---------------------------------------------------------------- 橋梁セグメント
def make_bridge_segment():
    clear_scene()
    deck = material("Deck", (0.35, 0.35, 0.37, 1))
    steel = material("Steel", (0.18, 0.32, 0.6, 1), metallic=0.6, roughness=0.4)
    rail = material("Railing", (0.85, 0.86, 0.88, 1), metallic=0.5, roughness=0.5)
    concrete = material("Concrete", (0.62, 0.6, 0.56, 1))
    L, W = 60.0, 8.0
    # デッキ上面を z=0 に揃える（配置先の路面高さに合わせやすい）
    # 長手方向は Blender +Y（= ゲームの -Z, 進行方向）
    box("Deck_Road", (W, L, 0.6), (0, 0, -0.3), deck)
    for sx, suffix in ((-1, "L"), (1, "R")):
        box(f"Girder_{suffix}", (0.5, L, 1.6), (sx * (W / 2 - 0.6), 0, -1.4), steel)
        box(f"Railing_{suffix}", (0.12, L, 1.0), (sx * (W / 2 - 0.1), 0, 0.5), rail)
        for k, y in enumerate(range(-28, 29, 4)):
            box(f"Post_{suffix}_{k}", (0.12, 0.12, 1.0), (sx * (W / 2 - 0.1), y, 0.5), rail)
    for k, y in enumerate((-18.0, 18.0)):
        box(f"Pier_{k}", (W - 2.0, 2.0, 14.0), (0, y, -9.2), concrete)
    export(OUT / "bridge-segment.glb")


# ---------------------------------------------------------------- BIM 風 道路 + 橋梁コース
def centerline(t):
    """ゲーム側 bimBridgeCourse.ts と同じ式。Blender 座標 (x, y_north, z_up)。"""
    return (40.0 * math.sin(math.pi * t) + 25.0 * math.sin(2.3 * math.pi * t), 420.0 * t, 6.0 + 14.0 * t)


def make_bim_course():
    clear_scene()
    asphalt = material("Asphalt", (0.22, 0.22, 0.23, 1))
    deck = material("Deck", (0.35, 0.35, 0.37, 1))
    steel = material("Steel", (0.18, 0.32, 0.6, 1), metallic=0.6, roughness=0.4)
    rail = material("Railing", (0.85, 0.86, 0.88, 1), metallic=0.5, roughness=0.5)
    concrete = material("Concrete", (0.62, 0.6, 0.56, 1))
    ground = material("Ground", (0.3, 0.45, 0.22, 1))
    N = 140
    W = 8.0
    pts = [centerline(i / N) for i in range(N + 1)]

    def frame(i):
        a = pts[max(0, i - 1)]
        b = pts[min(N, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        l = math.hypot(tx, ty) or 1
        tx, ty = tx / l, ty / l
        return (ty, -tx)  # 右向き（水平）

    def strip(name, i0, i1, width, zoff, mat):
        verts, faces = [], []
        for i in range(i0, i1 + 1):
            p = pts[i]
            rx, ry = frame(i)
            verts.append((p[0] - rx * width / 2, p[1] - ry * width / 2, p[2] + zoff))
            verts.append((p[0] + rx * width / 2, p[1] + ry * width / 2, p[2] + zoff))
        for k in range(i1 - i0):
            a, b, c, d = 2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 3
            faces.append((a, c, d, b))
        return mesh_from_data(name, verts, faces, mat)

    # 区間: 0-45 道路, 45-95 橋梁（谷を渡る）, 95-140 道路
    strip("Road_Approach_South", 0, 45, W, 0.0, asphalt)
    strip("Deck_Bridge", 45, 95, W, 0.0, deck)
    strip("Road_Approach_North", 95, N, W, 0.0, asphalt)
    strip("Girder_L", 45, 95, 0.5, -1.2, steel)
    for i in (45, 95):
        pass
    # 高欄（橋梁区間のみ）と路肩ガードレール
    for side in (-1, 1):
        verts, faces = [], []
        for i in range(0, N + 1):
            p = pts[i]
            rx, ry = frame(i)
            ox, oy = p[0] + rx * side * (W / 2 + 0.3), p[1] + ry * side * (W / 2 + 0.3)
            verts.append((ox, oy, p[2] - 0.3))
            verts.append((ox, oy, p[2] + 0.9))
        for k in range(N):
            a, b, c, d = 2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 3
            faces.append((a, b, d, c) if side > 0 else (a, c, d, b))
        mesh_from_data(f"Railing_{'R' if side > 0 else 'L'}", verts, faces, rail)
    # 橋脚
    for k, i in enumerate((55, 70, 85)):
        p = pts[i]
        box(f"Pier_{k}", (3.0, W - 2.0, p[2] + 30.0), (p[0], p[1], (p[2] - 1.0) / 2 - 15.0), concrete)
    # 地盤: 道路区間の下に土手、橋梁区間は谷（低い平面）
    verts, faces = [], []
    for i in range(0, N + 1):
        p = pts[i]
        rx, ry = frame(i)
        t = i / N
        in_valley = 45 <= i <= 95
        gz = -20.0 if in_valley else p[2] - 0.6
        for s in (-60.0, -(W / 2 + 1.0), (W / 2 + 1.0), 60.0):
            z = gz if abs(s) > W else (p[2] - 0.5 if not in_valley else -20.0)
            verts.append((p[0] + rx * s, p[1] + ry * s, z))
    for k in range(N):
        for c in range(3):
            a = 4 * k + c
            faces.append((a, a + 4, a + 5, a + 1))
    mesh_from_data("Ground_Embankment", verts, faces, ground)
    export(OUT / "bim-bridge-course.glb")


# ---------------------------------------------------------------- 鳥居風ゲート
def make_shrine_gate():
    clear_scene()
    red = material("Vermilion", (0.78, 0.12, 0.08, 1), roughness=0.6)
    black = material("Black", (0.05, 0.05, 0.05, 1))
    for sx in (-1, 1):
        box(f"Pillar_{'L' if sx < 0 else 'R'}", (0.5, 0.5, 6.0), (sx * 3.2, 0, 3.0), red)
    box("Kasagi", (9.0, 0.6, 0.5), (0, 0, 6.3), black)
    box("Nuki", (8.0, 0.4, 0.4), (0, 0, 5.2), red)
    export(OUT / "shrine-gate.glb")


make_bridge_segment()
make_bim_course()
make_shrine_gate()
