import { getEnvVar } from "@/lib/env"

export const TOKEN_ALGORITHM = "HS256"
export const USER_JWT_SECRET = getEnvVar("USER_JWT_SECRET")
export const ADMIN_JWT_SECRET = getEnvVar("ADMIN_JWT_SECRET")
export const LIVEKIT_API_KEY = getEnvVar("LIVEKIT_API_KEY")
export const LIVEKIT_API_SECRET = getEnvVar("LIVEKIT_API_SECRET")
export const LIVEKIT_URL = getEnvVar("LIVEKIT_URL")
