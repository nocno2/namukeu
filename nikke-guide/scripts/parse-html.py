import re
import json

# HTML 파일 읽기
with open('/Users/namwook/Documents/namukeu/claude-discord/uploads/1474506201575461015_message.txt', 'r', encoding='utf-8') as f:
    html = f.read()

# 이미지 URL 추출
img_pattern = r'<img src="(https://lh7-rt\.googleusercontent\.com/sheetsz/[^"]+)"'
images = re.findall(img_pattern, html)

print(f"총 이미지 수: {len(images)}")
print("첫 5개 이미지 URL:")
for i, img in enumerate(images[:5]):
    print(f"{i+1}. {img[:80]}...")

# 캐릭터 이름이 포함된 행 찾기 (한국어 텍스트에서)
# 이미지 URL과 근처에 있는 텍스트에서 캐릭터 이름 추출
name_pattern = r'<td[^>]*>([^<]*이노우에[^<]*)</td>'
names = re.findall(name_pattern, html)
print(f"\n캐릭터 이름 찾기: {names[:3]}")
