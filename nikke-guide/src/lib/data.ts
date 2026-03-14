import { NikkeCharacter } from "./types";
import { nikkeCharacters, getImageUrl } from "./characters";

/** 시트 데이터 파싱 - 今은直接데이터 사용 */
function parseSheetData(csv: string): NikkeCharacter[] {
  // imageUrl을 실시간으로 생성
  return nikkeCharacters.map(char => ({
    ...char,
    imageUrl: getImageUrl(char.name),
  }));
}

/** 구글시트에서 데이터 가져오기 */
export async function fetchSheetData(): Promise<NikkeCharacter[]> {
  return parseSheetData("");
}
