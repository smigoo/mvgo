#!/usr/bin/env python3
"""Generate announcement image for 9/29 deployment sync — v4 (clear text, subtitle below header)."""
from PIL import Image, ImageDraw, ImageFont
import os

# ─ Paths ──
CLIP = "/Users/smigoo/.workbuddy/clipboard-images"
OUT = "/Users/smigoo/工作/mvgo/outputs/announcement-0929.png"

IMG_ENTRY = os.path.join(CLIP, "clipboard-2026-09-29T15-15-44-376Z-dc188fd9.png")
IMG_WORKBENCH = os.path.join(CLIP, "clipboard-2026-09-29T15-15-44-376Z-dcf0dd80.jpg")
IMG_CAPABILITY = os.path.join(CLIP, "clipboard-2026-09-29T15-15-44-377Z-c3ab26e4.png")
IMG_THEME = os.path.join(CLIP, "clipboard-2026-09-29T15-15-44-378Z-10e8ed93.png")

# ── Canvas ──
W = 1080
BG = (245, 247, 250)
CARD_BG = (255, 255, 255)
TEXT_DARK = (26, 26, 46)
TEXT_BODY = (74, 74, 90)
TEXT_LIGHT = (156, 163, 175)
HEADER_BG = (30, 30, 40)
TIPS_BG = (254, 243, 199)
TIPS_TEXT = (120, 53, 15)

# ─ Fonts ──
def get_font(size, bold=False):
    candidates = [
        "/System/Library/Fonts/PingFang.ttc",
        "/System/Library/Fonts/STHeiti Medium.ttc",
        "/System/Library/Fonts/Hiragino Sans GB.ttc",
        "/Library/Fonts/Arial Unicode.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except:
                pass
    return ImageFont.load_default()

font_title = get_font(36, True)
font_section = get_font(22, True)
font_body = get_font(18)
font_body_bold = get_font(18, True)
font_small = get_font(16)
font_tag = get_font(14, True)
font_footer = get_font(14)
font_label = get_font(13)

# ─ Helpers ──
def wrap_text(text, font, max_width, draw):
    lines = []
    for para in text.split('\n'):
        if not para.strip():
            lines.append('')
            continue
        if draw.textlength(para, font=font) <= max_width:
            lines.append(para)
            continue
        current = ''
        for ch in para:
            test = current + ch
            if draw.textlength(test, font=font) > max_width:
                if current:
                    lines.append(current)
                current = ch
            else:
                current = test
        if current:
            lines.append(current)
    return lines

def draw_rounded_rect(draw, xy, radius, fill):
    draw.rounded_rectangle(xy, radius=radius, fill=fill)

# ── Build ──
padding_x = 48
content_w = W - padding_x * 2
card_margin = 16
cx = card_margin + padding_x

# Calculate total height
header_h = 110
subtitle_h = 56  # 2 lines
s1_items = 2
s2_items = 4
s3_items = 4
s4_items = 3
tips_items = 3

item_h = 30
section_title_h = 36
divider_h = 16

def section_height(n_items):
    return section_title_h + n_items * item_h + 10 + divider_h

s1_h = section_height(s1_items)
s2_h = section_height(s2_items)
s3_h = section_height(s3_items)
s4_h = section_height(s4_items)

# Screenshots
ss_cap_h = 130
ss_theme_h = 100
ss_label_h = 28
ss_row1_h = max(ss_cap_h, ss_theme_h) + ss_label_h + 16

ss_wb_h = 600
ss_row2_h = ss_wb_h + ss_label_h + 16

tips_h = 30 + 24 + tips_items * 28 + 20
footer_h = 50

total_h = card_margin * 2 + 24 + header_h + subtitle_h + 16 + s1_h + s2_h + ss_row1_h + s3_h + ss_row2_h + s4_h + tips_h + footer_h + 24

# Create canvas
img = Image.new('RGB', (W, total_h), BG)
draw = ImageDraw.Draw(img)

# Card background
draw_rounded_rect(draw, (card_margin, card_margin, W - card_margin, total_h - card_margin), 20, CARD_BG)

y = card_margin + 24

# ── Header (compact, title only) ──
header_x = card_margin + 12
header_w = W - card_margin * 2 - 24
draw_rounded_rect(draw, (header_x, y, header_x + header_w, y + header_h), 16, HEADER_BG)
hdr_y = y

# Tag
tag_text = "DEPLOYMENT SYNC"
tag_bbox = draw.textbbox((0, 0), tag_text, font=font_tag)
tag_w = tag_bbox[2] - tag_bbox[0] + 28
tag_h_val = tag_bbox[3] - tag_bbox[1] + 12
draw_rounded_rect(draw, (header_x + 24, hdr_y + 14, header_x + 24 + tag_w, hdr_y + 14 + tag_h_val), 20, (55, 55, 70))
draw.text((header_x + 38, hdr_y + 18), tag_text, fill=(200, 200, 215), font=font_tag)

# Title
draw.text((header_x + 24, hdr_y + 48), "9/29 部署同步", fill=(255, 255, 255), font=font_title)

y += header_h + 12

# ── Subtitle (below header, on white card, dark text) ──
subtitle = "本次部署时间超出预期，源于部署中复测发现的视觉识别缺陷（识别能力判定不严谨），相关问题现已全部闭环，同步如下"
sub_lines = wrap_text(subtitle, font_small, content_w - 20, draw)
for line in sub_lines:
    draw.text((cx, y + 2), line, fill=TEXT_BODY, font=font_small)
    y += 26

y += 14

# ── Section helper (no icon, no 顿号, numbered items) ─
def draw_section(title, items, y):
    global draw
    draw.text((cx, y), title, fill=TEXT_DARK, font=font_section)
    y += section_title_h
    item_num = 0
    for item_text, is_bold in items:
        color = TEXT_DARK if is_bold else TEXT_BODY
        f = font_body_bold if is_bold else font_body
        if item_text.startswith('→'):
            prefix = '  '
        else:
            item_num += 1
            prefix = f"{item_num}. "
        full_text = prefix + item_text
        lines = wrap_text(full_text, f, content_w - 20, draw)
        for line in lines:
            draw.text((cx + 4, y + 2), line, fill=color, font=f)
            y += 28
        y += 2
    y += 10
    draw.line((cx, y, cx + content_w, y), fill=(240, 240, 240), width=1)
    y += divider_h
    return y

# Section 1
s1_text = [
    ('模型"思考模式"：深推理冗长，易超时 / 返回空内容', False),
    ('视觉能力误判：非视觉模型被当作"支持视觉"，导致识别失败', False),
]
y = draw_section("一. 此前生成失败的原因", s1_text, y)

# Section 2
s2_text = [
    ('视觉识别检测逻辑：非视觉模型被误判为"支持视觉"', True),
    ('→ 已修正，用随机数字图验证模型是否真能看图识别，并补充能力白名单', False),
    ('视觉识别稳定性：识别失败 / 降级无兜底', True),
    ('→ 已补充自动重试与降级提示', False),
]
y = draw_section("二. 部署中新发现并修复的问题", s2_text, y)

# Section 3
s3_text = [
    ('工作台：对话式组件生成，支持 Figma 链接与截图粘贴', False),
    ('实时查看生成进度与代码产出，支持暂停与取消', False),
    ('支持 Vue3 / 微码、Lite / Max 多种规格选择', False),
    ('深浅主题面板：实时预览浅色 / 深色两种模式', False),
]
y = draw_section("三. 新增功能", s3_text, y)

# ── Screenshots Row 1 (after section 3) ──
gap = 16
half_w = (content_w - gap) // 2

img_cap = Image.open(IMG_CAPABILITY)
img_theme = Image.open(IMG_THEME)

cap_h_target = ss_cap_h
cap_ratio = cap_h_target / img_cap.height
cap_w_new = int(img_cap.width * cap_ratio)
img_cap_resized = img_cap.resize((cap_w_new, cap_h_target), Image.LANCZOS)

theme_h_target = ss_theme_h
theme_ratio = theme_h_target / img_theme.height
theme_w_new = int(img_theme.width * theme_ratio)
img_theme_resized = img_theme.resize((theme_w_new, theme_h_target), Image.LANCZOS)

draw_rounded_rect(draw, (cx, y, cx + half_w, y + ss_cap_h + ss_label_h + 12), 12, (250, 250, 252))
draw_rounded_rect(draw, (cx + half_w + gap, y, cx + half_w + gap + half_w, y + ss_theme_h + ss_label_h + 12), 12, (250, 250, 252))

cap_x = cx + (half_w - cap_w_new) // 2
theme_x = cx + half_w + gap + (half_w - theme_w_new) // 2
img.paste(img_cap_resized, (cap_x, y + 6))
img.paste(img_theme_resized, (theme_x, y + 6))

draw.text((cx + 8, y + ss_cap_h + 10), "模型能力检测 — 视觉/文本/推理逐项验证", fill=(107, 114, 128), font=font_label)
draw.text((cx + half_w + gap + 8, y + ss_theme_h + 10), "深浅主题面板 — 实时预览浅色 / 深色两种模式", fill=(107, 114, 128), font=font_label)

y += max(ss_cap_h, ss_theme_h) + ss_label_h + 28

# ── Screenshot Row 2 (workbench, crop top half, full width) ──
img_wb = Image.open(IMG_WORKBENCH)
# Crop to top half
wb_crop_h = img_wb.height // 2
img_wb_cropped = img_wb.crop((0, 0, img_wb.width, wb_crop_h))
# Resize to full content width
wb_w_new = content_w
wb_h_new = int(img_wb_cropped.height * (wb_w_new / img_wb_cropped.width))
img_wb_resized = img_wb_cropped.resize((wb_w_new, wb_h_new), Image.LANCZOS)

draw_rounded_rect(draw, (cx, y, cx + content_w, y + wb_h_new + ss_label_h + 12), 12, (250, 250, 252))
img.paste(img_wb_resized, (cx, y + 6))
draw.text((cx + 8, y + wb_h_new + 10), "工作台界面 — 对话式组件生成，左侧对话 + 右侧代码实时预览", fill=(107, 114, 128), font=font_label)

y += wb_h_new + ss_label_h + 28

# Section 4
s4_text = [
    ('请使用支持视觉的模型；非视觉模型仍可能无法识别图片', False),
    ('建议改用更快的模型，慢模型易超时失败', False),
    ('此前因思考模式 / 识别失败而失败的组件，建议重新测试后使用', False),
]
y = draw_section("四. 测试注意事项", s4_text, y)

# ── Tips Box ──
tips_y_start = y
draw_rounded_rect(draw, (cx, tips_y_start, cx + content_w, tips_y_start + tips_h), 12, TIPS_BG)
draw.text((cx + 16, tips_y_start + 12), "快速上手", fill=(146, 64, 14), font=font_body_bold)
ty = tips_y_start + 42
tips_text = [
    '进入工作台 → 新建对话 → 粘贴 Figma 链接或拖拽截图 → 选择规格 → 点击生成',
    '生成过程中可在右侧实时查看代码产出，支持暂停与取消',
    '生成完成后可一键进入 Playground 预览与编辑',
]
for tip in tips_text:
    draw.text((cx + 24, ty), "• " + tip, fill=TIPS_TEXT, font=font_small)
    ty += 28

y = tips_y_start + tips_h + 16

# ── Footer ──
footer_text = "如有问题请随时沟通  ·  晓界工坊"
ft_bbox = draw.textbbox((0, 0), footer_text, font=font_footer)
ft_w = ft_bbox[2] - ft_bbox[0]
fx = cx + (content_w - ft_w) // 2
draw.text((fx, y), footer_text, fill=TEXT_LIGHT, font=font_footer)

# Save
img.save(OUT, 'PNG', quality=95)
print(f"Saved: {OUT} ({img.width}x{img.height})")
