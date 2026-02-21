/** NIKKE 캐릭터 데이터 타입 */
export interface NikkeCharacter {
  id: string;
  name: string;
  imageUrl: string;
  skills: {
    basic: string;      // 기본 스킬
    full: string;       // 종결 스킬
    recommended: string; // 권장 스킬
  };
  overload: string;     // 오버로드
  cube: string;         // 큐브/장비
  tags: string[];      // PVP, 레이드, 스테이지 등
  notes: string;       // 추가 메모
}

/** 시트 데이터 원본 */
export interface RawSheetData {
  characters: NikkeCharacter[];
  lastUpdated: string;
}
