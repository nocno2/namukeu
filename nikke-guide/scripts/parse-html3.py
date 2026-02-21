import re
import json

# HTML 파일 읽기
with open('/Users/namwook/Documents/namukeu/claude-discord/uploads/1474506201575461015_message.txt', 'r', encoding='utf-8') as f:
    html = f.read()

# Google Sheets 이미지 URL 추출
img_pattern = r'<img src="(https://lh7-rt\.googleusercontent\.com/sheetsz/[^"]+)"'
images = re.findall(img_pattern, html)

# 이미지 URL과 근처의 텍스트에서 캐릭터 이름 추출
# 구조: <td>이름</td><td><img src="URL"></td> 형태

# 행 단위로 분할
rows = html.split('<tr ')

character_map = {}
current_name = None

for row in rows:
    # td 태그에서 텍스트 찾기
    td_texts = re.findall(r'<td[^>]*>([^<]*)</td>', row)
    for text in td_texts:
        text = text.strip()
        # 한국어 이름 패턴 (2-15글자)
        if 2 <= len(text) <= 15 and re.search(r'[가-힣]', text):
            if not any(x in text for x in ['스킬', '오버로드', '큐브', '장비', '기본', '권장', '종결', 'PVP', '공격']):
                current_name = text
                break

    # 이미지 URL 찾기
    img_match = re.search(r'<img src="(https://lh7-rt\.googleusercontent\.com/sheetsz/[^"]+)"', row)
    if img_match and current_name:
        img_url = img_match.group(1)
        if current_name not in character_map:
            character_map[current_name] = img_url

print(f"캐릭터 매핑 수: {len(character_map)}")
print("\n일부 매핑 예시:")
for i, (name, url) in enumerate(list(character_map.items())[:10]):
    print(f"{name}: {url[:60]}...")

# JSON으로 저장
with open('/Users/namwook/Documents/namukeu/nikke-guide/src/lib/character-images.json', 'w', encoding='utf-8') as f:
    json.dump(character_map, f, ensure_ascii=False, indent=2)

print("\ncharacter-images.json으로 저장 완료!")
