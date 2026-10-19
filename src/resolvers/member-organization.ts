/**
 * 멤버의 소속 회사·부서·직책을 바쁨 시간 조회 응답에서 꺼낸다.
 *
 * `member get` 응답에는 이 셋이 없어 `POST /calendar/v1/fetch-busy-hours` 를 빌려 쓴다.
 * 바쁨 시간 자체는 쓰지 않으므로 기간은 1분으로 둔다 (ADR-069).
 */
import type { DoorayApiClient } from "../api/client.js";
import type { MemberOrganization } from "../api/types.js";
import { DoorayCliError } from "../utils/errors.js";
import { EXIT_API_ERROR } from "../utils/exit-codes.js";

/** 조회 기간. 공식 문서의 상한(7일 미만)과 무관하게 최소 폭만 쓴다. */
const WINDOW_MS = 60_000;

export function buildBusyHoursWindow(now: Date): { beginDateTime: string; endDateTime: string } {
  return {
    beginDateTime: now.toISOString(),
    endDateTime: new Date(now.getTime() + WINDOW_MS).toISOString(),
  };
}

export async function fetchMemberOrganization(
  client: DoorayApiClient,
  memberId: string,
  now: Date = new Date(),
): Promise<MemberOrganization> {
  let res;
  try {
    res = await client.fetchBusyHours({
      organizationMemberIds: [memberId],
      ...buildBusyHoursWindow(now),
    });
  } catch (e) {
    // 인증 오류 같은 종료 코드는 클라이언트가 정한 것을 그대로 둔다.
    const msg = e instanceof Error ? e.message : String(e);
    const exitCode = e instanceof DoorayCliError ? e.exitCode : EXIT_API_ERROR;
    throw new DoorayCliError(`소속 정보를 불러오지 못했습니다: ${msg}`, exitCode, { cause: e });
  }

  const entry = (res.result ?? []).find((r) => String(r.member?.id) === memberId);
  if (!entry) {
    throw new DoorayCliError(
      `소속 정보 응답에 멤버가 없습니다: ${memberId}`,
      EXIT_API_ERROR,
    );
  }

  const { defaultOrganization, primaryDepartment, positionName } = entry.member;
  return {
    defaultOrganization: defaultOrganization ?? null,
    primaryDepartment: primaryDepartment ?? null,
    positionName: positionName ?? null,
  };
}
