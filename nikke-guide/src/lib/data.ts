import { NikkeCharacter } from "./types";
import { nikkeCharacters } from "./characters";

/** NIKKE 캐릭터 이미지 URL */
function getCharacterImageUrl(name: string): string {
  return "";
}

/** 시트 데이터 파싱 - 今은直接데이터 사용 */
function parseSheetData(csv: string): NikkeCharacter[] {
  return nikkeCharacters;
}

/** 구글시트에서 데이터 가져오기 */
export async function fetchSheetData(): Promise<NikkeCharacter[]> {
  return nikkeCharacters;
}
