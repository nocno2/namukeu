import re
import json

# HTML 파일 읽기
with open('/Users/namwook/Documents/namukeu/claude-discord/uploads/1474506201575461015_message.txt', 'r', encoding='utf-8') as f:
    html = f.read()

# 방법 1: td 태그에서 캐릭터 이름 찾기 (첫 번째 열에 있는 경우)
# 구조: <td>이름</td> 패턴 찾기
name_td_pattern = r'<td[^>]*>([가-힣A-Za-z\s:]+)</td>'
candidates = re.findall(name_td_pattern, html)

# 고유한 이름 필터링
korean_names = set()
for name in candidates:
    name = name.strip()
    # 2-10글자 한국어 이름 필터
    if 2 <= len(name) <= 15 and re.search(r'[가-힣]', name):
        #특수문자나 이상한 문자 제외
        if not re.search(r'[<>&=]', name):
            korean_names.add(name)

print(f"고유 한국어 이름 수: {len(korean_names)}")
print("일부 이름 예시:")
for name in sorted(korean_names)[:20]:
    print(f"  - {name}")
