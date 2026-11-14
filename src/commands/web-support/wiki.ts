export const wikiWebAreaName = "위키";
/**
 * wiki 웹 지원 목록. 값은 지원하지 않는 옵션의 commander 속성 이름이다.
 * `--mime-type` 은 값과 관계없이 옵션 전체를 막는다. 값 조건으로 막으면 page-edit 이 getWikiPage 를 먼저 불러 요청 전에 막는다는 규약을 어긴다.
 * `--to-wiki` 는 허용된 실측 장소에 위키가 하나뿐이라 다른 위키로 옮기는 쓰기를 확인하지 못해 막는다.
 */
export const wikiWebSupport: Readonly<Record<string, readonly string[]>> = {
  "wiki list": [],
  "wiki pages": [],
  "wiki tree": [],
  "wiki page get": [],
  "wiki page create": [],
  "wiki page edit": ["mimeType"],
  "wiki page replace": [],
  "wiki page move": ["toWiki"],
  "wiki page delete": [],
  "wiki page file list": [],
  "wiki page file upload": [],
  "wiki page file download": [],
  "wiki page file download-all": [],
  "wiki page file delete": [],
  "wiki page comment list": [],
  "wiki page comment latest": [],
  "wiki page comment get": [],
  "wiki page comment add": [],
  "wiki page comment edit": [],
  "wiki page comment delete": [],
} as const;
