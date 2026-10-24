import { headers } from "next/headers"
import { buildPlayerLoginPath, PLAYER_HAD_SESSION_HEADER, PLAYER_RETURN_PATH_HEADER } from "./player-next-path"

/** Called only after remote authentication has confirmed there is no usable user. */
export async function getPlayerLoginPath() {
  const requestHeaders = await headers()
  return buildPlayerLoginPath(requestHeaders.get(PLAYER_RETURN_PATH_HEADER), {
    sessionExpired: requestHeaders.get(PLAYER_HAD_SESSION_HEADER) === "1",
  })
}
