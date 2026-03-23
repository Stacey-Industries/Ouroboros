import Anthropic from '@anthropic-ai/sdk'
import fs from 'fs'
import os from 'os'
import path from 'path'

// ---------------------------------------------------------------------------
// OAuth credential management
// ---------------------------------------------------------------------------

const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json')

/** Buffer before actual expiry to trigger proactive refresh (5 minutes). */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

const ANTHROPIC_TOKEN_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token'

interface ClaudeOAuthData {
  accessToken?: string
  refreshToken?: string
  expiresAt?: number
}

interface ClaudeCredentials {
  claudeAiOauth?: ClaudeOAuthData
  [key: string]: unknown
}

interface OAuthRefreshResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type?: string
}

function readCredentials(): ClaudeCredentials | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is derived from os.homedir(), not user input
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    return JSON.parse(raw) as ClaudeCredentials
  } catch {
    return null
  }
}

function writeCredentials(creds: ClaudeCredentials): void {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- path is derived from os.homedir(), not user input
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf8')
  } catch {
    // Non-fatal — worst case the next request re-refreshes
  }
}

function isTokenExpired(expiresAt: number | undefined): boolean {
  if (!expiresAt) return true
  return Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS
}

async function refreshOAuthToken(refreshToken: string): Promise<ClaudeOAuthData | null> {
  try {
    const response = await fetch(ANTHROPIC_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    })

    if (!response.ok) {
      console.warn(`[anthropic-api] OAuth refresh failed: ${response.status} ${response.statusText}`)
      return null
    }

    const data = (await response.json()) as OAuthRefreshResponse
    if (!data.access_token) return null

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    }
  } catch (error) {
    console.warn('[anthropic-api] OAuth refresh error:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Ensures the OAuth token is valid, refreshing if needed.
 * Returns the access token or undefined if unavailable.
 */
export async function ensureValidOAuthToken(): Promise<string | undefined> {
  const creds = readCredentials()
  const oauth = creds?.claudeAiOauth
  if (!oauth?.accessToken) return undefined

  // Token still valid — use it directly
  if (!isTokenExpired(oauth.expiresAt)) {
    return oauth.accessToken
  }

  // Token expired or expiring soon — attempt refresh
  if (!oauth.refreshToken) {
    console.warn('[anthropic-api] OAuth token expired and no refresh token available')
    return undefined
  }

  console.log('[anthropic-api] OAuth token expired or expiring soon, refreshing...')
  const refreshed = await refreshOAuthToken(oauth.refreshToken)
  if (!refreshed) {
    console.warn('[anthropic-api] OAuth refresh failed — token may be expired. Run "claude auth login" to re-authenticate.')
    return undefined
  }

  // Persist refreshed credentials
  const updatedCreds: ClaudeCredentials = {
    ...creds,
    claudeAiOauth: { ...oauth, ...refreshed },
  }
  writeCredentials(updatedCreds)
  console.log('[anthropic-api] OAuth token refreshed successfully')
  return refreshed.accessToken
}

export async function createAnthropicClient(): Promise<Anthropic> {
  // API key subscribers — standard auth path
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  // Claude.ai subscription users — OAuth token with auto-refresh
  const oauthToken = await ensureValidOAuthToken()
  if (oauthToken) {
    return new Anthropic({
      authToken: oauthToken,
      defaultHeaders: { 'anthropic-beta': 'oauth-2025-04-20' },
    })
  }

  // Let the SDK throw its own descriptive error
  return new Anthropic()
}
